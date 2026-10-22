import { describe, it, expect, vi } from 'vitest';
import {
  JsonRpcError,
  JsonRpcTransport,
  JsonRpcTransportError,
  type FetchLike,
} from './json-rpc-transport';
import { parseRetryAfter } from './retry-after';
import { withRetry } from './retry';

const NOW = Date.parse('2026-10-17T12:00:00Z');

describe('parseRetryAfter', () => {
  it('reads an integer number of seconds as milliseconds', () => {
    expect(parseRetryAfter('120', NOW)).toBe(120_000);
    expect(parseRetryAfter('0', NOW)).toBe(0);
  });

  it('reads an HTTP-date relative to now', () => {
    expect(parseRetryAfter('Sat, 17 Oct 2026 12:00:30 GMT', NOW)).toBe(30_000);
  });

  it('returns 0 for an HTTP-date that has already passed', () => {
    expect(parseRetryAfter('Sat, 17 Oct 2026 11:00:00 GMT', NOW)).toBe(0);
  });

  it.each<[string, string | null | undefined]>([
    ['absent header', null],
    ['undefined header', undefined],
    ['blank header', '   '],
    ['negative seconds', '-5'],
    ['fractional seconds', '1.5'],
    ['free text', 'soon'],
  ])('returns undefined for %s', (_label, value) => {
    expect(parseRetryAfter(value, NOW)).toBeUndefined();
  });
});

function transportError(
  overrides: { retryable?: boolean; retryAfterMs?: number } = {},
): JsonRpcTransportError {
  return new JsonRpcTransportError('HTTP 503', 503, overrides.retryable ?? true, {
    retryAfterMs: overrides.retryAfterMs,
  });
}

describe('withRetry', () => {
  const policy = { maxRetries: 2, getDelay: (attempt: number) => attempt * 100 };

  it('returns the first success without waiting', async () => {
    const sleep = vi.fn(async (_ms: number) => undefined);
    const operation = vi.fn(async () => 'ok');

    await expect(withRetry(operation, { policy, sleep })).resolves.toBe('ok');
    expect(operation).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('retries retryable errors up to maxRetries and then throws the last error', async () => {
    const sleep = vi.fn(async (_ms: number) => undefined);
    const operation = vi.fn(async () => {
      throw transportError();
    });

    await expect(withRetry(operation, { policy, sleep })).rejects.toBeInstanceOf(
      JsonRpcTransportError,
    );
    expect(operation).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([100, 200]);
  });

  it('succeeds when a later attempt recovers', async () => {
    const sleep = vi.fn(async (_ms: number) => undefined);
    const operation = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(transportError())
      .mockResolvedValueOnce('recovered');

    await expect(withRetry(operation, { policy, sleep })).resolves.toBe('recovered');
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('does not retry non-retryable transport errors', async () => {
    const sleep = vi.fn(async (_ms: number) => undefined);
    const operation = vi.fn(async () => {
      throw transportError({ retryable: false });
    });

    await expect(withRetry(operation, { policy, sleep })).rejects.toBeInstanceOf(
      JsonRpcTransportError,
    );
    expect(operation).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('does not retry JSON-RPC errors returned by the server', async () => {
    const sleep = vi.fn(async (_ms: number) => undefined);
    const operation = vi.fn(async () => {
      throw new JsonRpcError(-32602, 'bad params');
    });

    await expect(withRetry(operation, { policy, sleep })).rejects.toBeInstanceOf(JsonRpcError);
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('waits for Retry-After instead of the policy backoff', async () => {
    const sleep = vi.fn(async (_ms: number) => undefined);
    const operation = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(transportError({ retryAfterMs: 2_500 }))
      .mockResolvedValueOnce('ok');

    await withRetry(operation, { policy, sleep });

    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledWith(2_500);
  });

  it('honours a Retry-After of zero', async () => {
    const sleep = vi.fn(async (_ms: number) => undefined);
    const operation = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(transportError({ retryAfterMs: 0 }))
      .mockResolvedValueOnce('ok');

    await withRetry(operation, { policy, sleep });

    expect(sleep).toHaveBeenCalledWith(0);
  });

  it('gives up without sleeping when the Retry-After wait would pass the deadline', async () => {
    let clock = 0;
    const sleep = vi.fn(async (_ms: number) => undefined);
    const operation = vi.fn(async () => {
      throw transportError({ retryAfterMs: 5_000 });
    });

    const err = await withRetry(operation, {
      policy,
      deadlineMs: 4_000,
      now: () => clock,
      sleep,
    }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(JsonRpcTransportError);
    expect(operation).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('counts time already spent against the deadline', async () => {
    let clock = 0;
    const sleep = vi.fn(async (_ms: number) => undefined);
    const operation = vi.fn(async () => {
      clock += 900;
      throw transportError({ retryAfterMs: 200 });
    });

    await expect(
      withRetry(operation, { policy, deadlineMs: 1_000, now: () => clock, sleep }),
    ).rejects.toBeInstanceOf(JsonRpcTransportError);
    expect(operation).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('retries when the wait fits within the deadline', async () => {
    let clock = 0;
    const sleep = vi.fn(async (ms: number) => {
      clock += ms;
    });
    const operation = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(transportError({ retryAfterMs: 300 }))
      .mockResolvedValueOnce('ok');

    await expect(
      withRetry(operation, { policy, deadlineMs: 1_000, now: () => clock, sleep }),
    ).resolves.toBe('ok');
    expect(sleep).toHaveBeenCalledWith(300);
  });
});

describe('JsonRpcTransport Retry-After integration', () => {
  it('records the Retry-After header on a 429 so withRetry can honour it', async () => {
    const fetch: FetchLike = async () => ({
      ok: false,
      status: 429,
      headers: { get: (name) => (name === 'retry-after' ? '7' : null) },
      text: async () => '',
    });
    const transport = new JsonRpcTransport({ url: 'https://rpc.example.com', fetch });

    const err = await transport.request('getHealth').catch((e: unknown) => e);

    expect(err).toBeInstanceOf(JsonRpcTransportError);
    expect(err).toMatchObject({ status: 429, retryable: true, retryAfterMs: 7_000 });
  });

  it('leaves retryAfterMs undefined when no Retry-After is sent', async () => {
    const fetch: FetchLike = async () => ({
      ok: false,
      status: 500,
      headers: { get: () => null },
      text: async () => '',
    });
    const transport = new JsonRpcTransport({ url: 'https://rpc.example.com', fetch });

    const err = await transport.request('getHealth').catch((e: unknown) => e);

    expect(err).toMatchObject({ retryable: true, retryAfterMs: undefined });
  });
});

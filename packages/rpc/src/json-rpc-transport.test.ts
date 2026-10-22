import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  JsonRpcError,
  JsonRpcProtocolError,
  JsonRpcTransport,
  JsonRpcTransportError,
  parseJsonRpcEnvelope,
  type FetchLike,
  type FetchResponseLike,
} from './json-rpc-transport';

function jsonResponse(body: unknown, status = 200): FetchResponseLike {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    text: async () => JSON.stringify(body),
  };
}

describe('JsonRpcTransport', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts a JSON-RPC 2.0 envelope to the configured URL and returns the result', async () => {
    const fetch = vi.fn<FetchLike>(async () =>
      jsonResponse({ jsonrpc: '2.0', id: 1, result: { latestLedger: 42 } }),
    );
    const transport = new JsonRpcTransport({ url: 'https://rpc.example.com', fetch });

    const result = await transport.request<{ latestLedger: number }>('getLatestLedger', {
      format: 'json',
    });

    expect(result).toEqual({ latestLedger: 42 });
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('https://rpc.example.com');
    expect(init.method).toBe('POST');
    expect(init.headers['content-type']).toBe('application/json');
    expect(JSON.parse(init.body)).toEqual({
      jsonrpc: '2.0',
      id: 1,
      method: 'getLatestLedger',
      params: { format: 'json' },
    });
  });

  it('assigns a distinct id to each request', async () => {
    const fetch = vi.fn<FetchLike>(async (_url, init) => {
      const { id } = JSON.parse(init.body) as { id: number };
      return jsonResponse({ jsonrpc: '2.0', id, result: null });
    });
    const transport = new JsonRpcTransport({ url: 'https://rpc.example.com', fetch });

    await transport.request('a');
    await transport.request('b');

    const ids = fetch.mock.calls.map(([, init]) => (JSON.parse(init.body) as { id: number }).id);
    expect(ids).toEqual([1, 2]);
  });

  it('maps a JSON-RPC error member to JsonRpcError with code, message and data', async () => {
    const fetch = vi.fn<FetchLike>(async () =>
      jsonResponse({
        jsonrpc: '2.0',
        id: 1,
        error: { code: -32602, message: 'bad params', data: { field: 'hash' } },
      }),
    );
    const transport = new JsonRpcTransport({ url: 'https://rpc.example.com', fetch });

    const err = await transport.request('getTransaction').catch((e: unknown) => e);

    expect(err).toBeInstanceOf(JsonRpcError);
    expect(err).toMatchObject({ code: -32602, message: 'bad params', data: { field: 'hash' } });
  });

  it('wraps a rejected fetch as a retryable JsonRpcTransportError keeping the cause', async () => {
    const cause = new Error('socket hang up');
    const fetch: FetchLike = async () => {
      throw cause;
    };
    const transport = new JsonRpcTransport({ url: 'https://rpc.example.com', fetch });

    const err = await transport.request('getHealth').catch((e: unknown) => e);

    expect(err).toBeInstanceOf(JsonRpcTransportError);
    expect(err).toMatchObject({ retryable: true, status: undefined });
    expect((err as JsonRpcTransportError).cause).toBe(cause);
  });

  it.each([
    [429, true],
    [503, true],
    [400, false],
    [404, false],
  ])('classifies HTTP %i as retryable=%s', async (status, retryable) => {
    const fetch: FetchLike = async () => jsonResponse({}, status);
    const transport = new JsonRpcTransport({ url: 'https://rpc.example.com', fetch });

    const err = await transport.request('getHealth').catch((e: unknown) => e);

    expect(err).toBeInstanceOf(JsonRpcTransportError);
    expect(err).toMatchObject({ status, retryable });
  });

  it('throws a clear error when no fetch implementation is available', () => {
    vi.stubGlobal('fetch', undefined);

    expect(() => new JsonRpcTransport({ url: 'https://rpc.example.com' })).toThrow(
      /no fetch implementation/,
    );
  });

  it('uses globalThis.fetch when no fetch is injected', async () => {
    const globalFetch = vi.fn<FetchLike>(async () =>
      jsonResponse({ jsonrpc: '2.0', id: 1, result: 'ok' }),
    );
    vi.stubGlobal('fetch', globalFetch);
    const transport = new JsonRpcTransport({ url: 'https://rpc.example.com' });

    await expect(transport.request('ping')).resolves.toBe('ok');
    expect(globalFetch).toHaveBeenCalledTimes(1);
  });
});

describe('parseJsonRpcEnvelope', () => {
  it('returns the result of a well-formed response with a matching id', () => {
    expect(parseJsonRpcEnvelope({ jsonrpc: '2.0', id: 7, result: { ok: true } }, 7)).toEqual({
      ok: true,
    });
  });

  it('accepts a null result as a valid result', () => {
    expect(parseJsonRpcEnvelope({ jsonrpc: '2.0', id: 1, result: null }, 1)).toBeNull();
  });

  it.each([
    ['a non-object body', 'oops'],
    ['an array body', [{ jsonrpc: '2.0', id: 1, result: 1 }]],
    ['a null body', null],
  ])('rejects %s', (_label, body) => {
    expect(() => parseJsonRpcEnvelope(body, 1)).toThrow(JsonRpcProtocolError);
  });

  it.each([
    ['a missing jsonrpc version', { id: 1, result: 1 }],
    ['an unsupported jsonrpc version', { jsonrpc: '1.0', id: 1, result: 1 }],
  ])('rejects %s', (_label, body) => {
    expect(() => parseJsonRpcEnvelope(body, 1)).toThrow(/jsonrpc/);
  });

  it('rejects a response with neither result nor error', () => {
    expect(() => parseJsonRpcEnvelope({ jsonrpc: '2.0', id: 1 }, 1)).toThrow(/exactly one of/);
  });

  it('rejects a response carrying both result and error', () => {
    const body = { jsonrpc: '2.0', id: 1, result: 1, error: { code: -1, message: 'x' } };
    expect(() => parseJsonRpcEnvelope(body, 1)).toThrow(/exactly one of/);
  });

  it('rejects a response whose id does not match the request', () => {
    expect(() => parseJsonRpcEnvelope({ jsonrpc: '2.0', id: 2, result: 1 }, 1)).toThrow(
      /does not match request id 1/,
    );
  });

  it('rejects a null id on a success response', () => {
    expect(() => parseJsonRpcEnvelope({ jsonrpc: '2.0', id: null, result: 1 }, 1)).toThrow(
      /does not match/,
    );
  });

  it('accepts a null id only on an error response', () => {
    const body = { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } };
    expect(() => parseJsonRpcEnvelope(body, 1)).toThrow(JsonRpcError);
  });

  it.each([
    ['a non-integer code', { code: 1.5, message: 'x' }],
    ['a string code', { code: '-32602', message: 'x' }],
    ['a missing message', { code: -32602 }],
    ['a non-object error', 'boom'],
  ])('rejects an error member with %s', (_label, error) => {
    expect(() => parseJsonRpcEnvelope({ jsonrpc: '2.0', id: 1, error }, 1)).toThrow(
      JsonRpcProtocolError,
    );
  });
});

describe('JsonRpcTransport envelope validation', () => {
  it('throws a JsonRpcProtocolError for a body that is not valid JSON', async () => {
    const fetch: FetchLike = async () => ({
      ok: true,
      status: 200,
      headers: { get: () => null },
      text: async () => '<html>gateway</html>',
    });
    const transport = new JsonRpcTransport({ url: 'https://rpc.example.com', fetch });

    await expect(transport.request('getHealth')).rejects.toBeInstanceOf(JsonRpcProtocolError);
  });

  it('does not return a payload whose envelope id belongs to another request', async () => {
    const fetch: FetchLike = async () =>
      jsonResponse({ jsonrpc: '2.0', id: 99, result: { leaked: true } });
    const transport = new JsonRpcTransport({ url: 'https://rpc.example.com', fetch });

    await expect(transport.request('getHealth')).rejects.toBeInstanceOf(JsonRpcProtocolError);
  });

  it('sends the same id it expects back, across consecutive requests', async () => {
    const fetch = vi.fn<FetchLike>(async (_url, init) => {
      const { id } = JSON.parse(init.body) as { id: number };
      return jsonResponse({ jsonrpc: '2.0', id, result: id });
    });
    const transport = new JsonRpcTransport({ url: 'https://rpc.example.com', fetch });

    await expect(transport.request('a')).resolves.toBe(1);
    await expect(transport.request('b')).resolves.toBe(2);
  });
});

describe('JsonRpcTransport maxInFlight', () => {
  it('holds requests beyond the limit until an in-flight request completes', async () => {
    const pending: Array<(response: FetchResponseLike) => void> = [];
    const fetch = vi.fn<FetchLike>(
      () =>
        new Promise<FetchResponseLike>((resolve) => {
          pending.push(resolve);
        }),
    );
    const transport = new JsonRpcTransport({
      url: 'https://rpc.example.com',
      fetch,
      maxInFlight: 2,
    });
    const settle = () => new Promise((resolve) => setImmediate(resolve));

    const requests = [1, 2, 3, 4].map(() => transport.request('getHealth'));
    await settle();
    expect(fetch).toHaveBeenCalledTimes(2);

    pending[0](jsonResponse({ jsonrpc: '2.0', id: 1, result: 'a' }));
    await settle();
    expect(fetch).toHaveBeenCalledTimes(3);

    pending[1](jsonResponse({ jsonrpc: '2.0', id: 2, result: 'b' }));
    await settle();
    expect(fetch).toHaveBeenCalledTimes(4);

    pending[2](jsonResponse({ jsonrpc: '2.0', id: 3, result: 'c' }));
    pending[3](jsonResponse({ jsonrpc: '2.0', id: 4, result: 'd' }));
    await expect(Promise.all(requests)).resolves.toEqual(['a', 'b', 'c', 'd']);
  });

  it('frees the slot when a request fails, so queued requests still run', async () => {
    const fetch: FetchLike = async () => {
      throw new Error('connection reset');
    };
    const transport = new JsonRpcTransport({
      url: 'https://rpc.example.com',
      fetch,
      maxInFlight: 1,
    });

    const results = await Promise.allSettled([transport.request('a'), transport.request('b')]);

    expect(results.map((r) => r.status)).toEqual(['rejected', 'rejected']);
    expect((results[1] as PromiseRejectedResult).reason).toBeInstanceOf(JsonRpcTransportError);
  });

  it('rejects an invalid maxInFlight at construction', () => {
    const fetch: FetchLike = async () => jsonResponse({});
    expect(
      () => new JsonRpcTransport({ url: 'https://rpc.example.com', fetch, maxInFlight: 0 }),
    ).toThrow(RangeError);
  });
});

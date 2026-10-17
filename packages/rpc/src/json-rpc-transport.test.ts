import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  JsonRpcError,
  JsonRpcTransport,
  JsonRpcTransportError,
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
    const fetch = vi.fn<FetchLike>(async () =>
      jsonResponse({ jsonrpc: '2.0', id: 0, result: null }),
    );
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

/**
 * Minimal JSON-RPC 2.0 transport over an injectable fetch implementation.
 *
 * Custom runtimes (edge workers, React Native, service workers) and tests can
 * pass their own `fetch` instead of relying on `globalThis.fetch`.
 */

/** The subset of a fetch `Response` this transport reads. */
export interface FetchResponseLike {
  readonly ok: boolean;
  readonly status: number;
  readonly headers: { get(name: string): string | null };
  text(): Promise<string>;
}

/** A fetch-compatible function. Only POST requests with a JSON body are issued. */
export type FetchLike = (
  url: string,
  init: { method: 'POST'; headers: Record<string, string>; body: string },
) => Promise<FetchResponseLike>;

export interface JsonRpcTransportOptions {
  url: string;
  /** Fetch implementation to use. Defaults to `globalThis.fetch`. */
  fetch?: FetchLike;
}

/** Raised when the JSON-RPC server returns an `error` member in its response. */
export class JsonRpcError extends Error {
  constructor(
    readonly code: number,
    message: string,
    readonly data?: unknown,
  ) {
    super(message);
    this.name = 'JsonRpcError';
  }
}

/** Raised when the request never produced a usable response (network failure or non-2xx HTTP status). */
export class JsonRpcTransportError extends Error {
  constructor(
    message: string,
    readonly status: number | undefined,
    readonly retryable: boolean,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'JsonRpcTransportError';
  }
}

export class JsonRpcTransport {
  private readonly url: string;
  private readonly fetchImpl: FetchLike;
  private nextId = 1;

  constructor(options: JsonRpcTransportOptions) {
    this.url = options.url;
    const fetchImpl = options.fetch ?? (globalThis as { fetch?: FetchLike }).fetch;
    if (!fetchImpl) {
      throw new Error(
        'JsonRpcTransport: no fetch implementation available; pass `fetch` explicitly',
      );
    }
    this.fetchImpl = fetchImpl;
  }

  async request<T>(method: string, params?: unknown): Promise<T> {
    const id = this.nextId++;
    const body = JSON.stringify({ jsonrpc: '2.0', id, method, params });

    let response: FetchResponseLike;
    try {
      response = await this.fetchImpl(this.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
      });
    } catch (err) {
      throw new JsonRpcTransportError(
        `Network error calling ${method}: ${err instanceof Error ? err.message : String(err)}`,
        undefined,
        true,
        { cause: err },
      );
    }

    if (!response.ok) {
      const retryable = response.status === 429 || response.status >= 500;
      throw new JsonRpcTransportError(
        `HTTP ${response.status} calling ${method}`,
        response.status,
        retryable,
      );
    }

    const parsed = JSON.parse(await response.text()) as {
      result?: T;
      error?: { code: number; message: string; data?: unknown };
    };
    if (parsed.error) {
      throw new JsonRpcError(parsed.error.code, parsed.error.message, parsed.error.data);
    }
    return parsed.result as T;
  }
}

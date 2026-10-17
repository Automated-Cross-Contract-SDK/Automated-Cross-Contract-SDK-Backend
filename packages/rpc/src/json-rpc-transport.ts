/**
 * Minimal JSON-RPC 2.0 transport over an injectable fetch implementation.
 *
 * Custom runtimes (edge workers, React Native, service workers) and tests can
 * pass their own `fetch` instead of relying on `globalThis.fetch`.
 */

import { parseRetryAfter } from './retry-after.js';

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
  /** Milliseconds the server asked the caller to wait, from a `Retry-After` header. */
  readonly retryAfterMs: number | undefined;

  constructor(
    message: string,
    readonly status: number | undefined,
    readonly retryable: boolean,
    options?: { cause?: unknown; retryAfterMs?: number },
  ) {
    super(message, { cause: options?.cause });
    this.name = 'JsonRpcTransportError';
    this.retryAfterMs = options?.retryAfterMs;
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
        { retryAfterMs: parseRetryAfter(response.headers.get('retry-after')) },
      );
    }

    return parseJsonRpcEnvelope<T>(await readJson(response, method), id);
  }
}

/** Raised when a response body is not a well-formed JSON-RPC 2.0 response for the request. */
export class JsonRpcProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'JsonRpcProtocolError';
  }
}

async function readJson(response: FetchResponseLike, method: string): Promise<unknown> {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new JsonRpcProtocolError(`Response to ${method} is not valid JSON`);
  }
}

/**
 * Validates a JSON-RPC 2.0 response envelope and returns its `result`.
 *
 * The envelope is checked in full before anything is returned, so a malformed,
 * mismatched or partially-formed response never reaches the caller as data.
 */
export function parseJsonRpcEnvelope<T>(body: unknown, expectedId: number): T {
  if (!isRecord(body)) {
    throw new JsonRpcProtocolError('Response is not a JSON object');
  }
  if (body.jsonrpc !== '2.0') {
    throw new JsonRpcProtocolError('Response has a missing or unsupported "jsonrpc" version');
  }

  const hasResult = 'result' in body;
  const hasError = 'error' in body;
  if (hasResult === hasError) {
    throw new JsonRpcProtocolError('Response must contain exactly one of "result" or "error"');
  }

  // The spec only allows a null id when the server could not read the request id, and only with an error.
  const idMatches = body.id === expectedId || (body.id === null && hasError);
  if (!idMatches) {
    throw new JsonRpcProtocolError(
      `Response id ${JSON.stringify(body.id)} does not match request id ${expectedId}`,
    );
  }

  if (hasError) {
    const error = body.error;
    if (!isRecord(error) || !Number.isInteger(error.code) || typeof error.message !== 'string') {
      throw new JsonRpcProtocolError(
        'Response "error" member must have an integer code and a string message',
      );
    }
    throw new JsonRpcError(error.code as number, error.message, error.data);
  }

  return body.result as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * JSON-RPC HTTP response parsing
 *
 * Separates the two ways a raw RPC HTTP body can be unusable:
 *
 * - INVALID_CONTENT_TYPE: the body is not declared as JSON, typically an HTML
 *   or plain-text error page from a proxy, CDN or load balancer.
 * - MALFORMED_JSON: the body is declared as JSON but does not parse, or the
 *   parsed value is not a JSON-RPC envelope.
 * - JSON_RPC_ERROR: the envelope carries an `error` object. This is checked
 *   regardless of HTTP status, because some providers return these with 200.
 *
 * Error messages never include the response body, which can be large or
 * contain data the caller should not log.
 */

export type RpcResponseErrorKind = 'INVALID_CONTENT_TYPE' | 'MALFORMED_JSON' | 'JSON_RPC_ERROR'

export class RpcResponseError extends Error {
  public readonly kind: RpcResponseErrorKind
  public readonly status: number
  public readonly contentType: string | null
  /** JSON-RPC error code from the envelope; only set for JSON_RPC_ERROR. */
  public readonly rpcCode?: number

  constructor(
    kind: RpcResponseErrorKind,
    message: string,
    status: number,
    contentType: string | null,
    rpcCode?: number,
  ) {
    super(message)
    this.name = 'RpcResponseError'
    this.kind = kind
    this.status = status
    this.contentType = contentType
    this.rpcCode = rpcCode
  }
}

const JSON_RPC_MEDIA_TYPES: ReadonlySet<string> = new Set(['application/json', 'application/json-rpc'])

function isJsonMediaType(contentType: string): boolean {
  const mediaType = contentType.split(';')[0].trim().toLowerCase()
  return JSON_RPC_MEDIA_TYPES.has(mediaType) || mediaType.endsWith('+json')
}

/**
 * Parses the body of a JSON-RPC HTTP response.
 *
 * The content type is checked before the body is parsed, so a non-JSON page
 * is reported as INVALID_CONTENT_TYPE even if its text happens to be valid JSON.
 *
 * @throws {RpcResponseError} with kind INVALID_CONTENT_TYPE or MALFORMED_JSON
 */
export function parseJsonRpcResponse(body: string, contentType: string | null, status: number): unknown {
  if (contentType === null || !isJsonMediaType(contentType)) {
    throw new RpcResponseError(
      'INVALID_CONTENT_TYPE',
      `Expected a JSON-RPC response but received content type ${contentType ?? 'none'} (status ${status})`,
      status,
      contentType,
    )
  }

  try {
    return JSON.parse(body) as unknown
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    throw new RpcResponseError(
      'MALFORMED_JSON',
      `Malformed JSON in RPC response (status ${status}): ${reason}`,
      status,
      contentType,
    )
  }
}

/**
 * Parses a JSON-RPC HTTP response and returns its `result` member.
 *
 * An `error` member takes precedence over HTTP status: a response with an
 * error object is rejected even when the status is 200.
 *
 * @throws {RpcResponseError} with kind INVALID_CONTENT_TYPE, MALFORMED_JSON or JSON_RPC_ERROR
 */
export function parseJsonRpcResult(body: string, contentType: string | null, status: number): unknown {
  const envelope = parseJsonRpcResponse(body, contentType, status)

  if (typeof envelope !== 'object' || envelope === null || Array.isArray(envelope)) {
    throw new RpcResponseError(
      'MALFORMED_JSON',
      `RPC response is not a JSON-RPC object (status ${status})`,
      status,
      contentType,
    )
  }

  const { error, result } = envelope as { error?: unknown; result?: unknown }

  if (error !== undefined && error !== null) {
    const { code, message } = (typeof error === 'object' ? error : {}) as { code?: unknown; message?: unknown }
    const rpcCode = typeof code === 'number' ? code : undefined
    const detail = typeof message === 'string' ? message : 'no message'
    throw new RpcResponseError(
      'JSON_RPC_ERROR',
      `JSON-RPC error ${rpcCode ?? 'unknown'} (status ${status}): ${detail}`,
      status,
      contentType,
      rpcCode,
    )
  }

  if (!('result' in envelope)) {
    throw new RpcResponseError(
      'MALFORMED_JSON',
      `RPC response has neither result nor error (status ${status})`,
      status,
      contentType,
    )
  }

  return result
}

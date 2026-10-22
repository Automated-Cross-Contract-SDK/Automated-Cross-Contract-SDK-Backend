/**
 * Unsupported RPC method reporting
 *
 * Soroban RPC nodes answer calls to methods they do not implement with a
 * JSON-RPC "method not found" error. The raw error does not say which method
 * or which endpoint was involved, which makes it hard to tell an outdated node
 * from a client bug. These helpers attach that context.
 */

/** JSON-RPC 2.0 error code for "Method not found". */
export const JSON_RPC_METHOD_NOT_FOUND = -32601

export interface UnsupportedMethodContext {
  /** RPC method that was called, e.g. `getLedgerEntries`. */
  method: string
  /** Endpoint that rejected the call. */
  endpointUrl: string
  /** Protocol version reported by the endpoint, when known. */
  protocolVersion?: number
}

export class UnsupportedRpcMethodError extends Error {
  readonly code = 'UNSUPPORTED_RPC_METHOD' as const
  readonly method: string
  readonly endpointUrl: string
  readonly protocolVersion?: number
  readonly cause?: unknown

  constructor(context: UnsupportedMethodContext, cause?: unknown) {
    const version = context.protocolVersion === undefined ? '' : ` (protocol ${context.protocolVersion})`
    super(`RPC method ${context.method} is not supported by endpoint ${context.endpointUrl}${version}`)
    this.name = 'UnsupportedRpcMethodError'
    this.method = context.method
    this.endpointUrl = context.endpointUrl
    this.protocolVersion = context.protocolVersion
    this.cause = cause
  }
}

/**
 * Returns true when `err` is a JSON-RPC "method not found" error. Checks the
 * numeric code first, then the error message, because client libraries wrap
 * the original response in different shapes.
 */
export function isUnsupportedMethodError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false

  const direct = (err as { code?: unknown }).code
  if (direct === JSON_RPC_METHOD_NOT_FOUND || direct === String(JSON_RPC_METHOD_NOT_FOUND)) {
    return true
  }

  const nested = (err as { response?: { data?: { error?: { code?: unknown } } } }).response?.data?.error?.code
  if (nested === JSON_RPC_METHOD_NOT_FOUND) return true

  const message = err instanceof Error ? err.message : String((err as { message?: unknown }).message ?? '')
  return /method not found/i.test(message)
}

/**
 * Converts a "method not found" error into an `UnsupportedRpcMethodError`
 * carrying the method and endpoint. Any other error is returned unchanged so
 * callers can wrap every RPC call with this helper.
 */
export function describeUnsupportedMethod(err: unknown, context: UnsupportedMethodContext): unknown {
  if (!isUnsupportedMethodError(err)) return err
  return new UnsupportedRpcMethodError(context, err)
}

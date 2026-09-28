import type { SorobanResurrectErrorContext } from '@soroban-resurrect/types'

/**
 * Error codes for SorobanResurrect operations
 */
export type SorobanResurrectErrorCode = 
  | 'SIMULATION_FAILED'
  | 'RESTORE_FAILED'
  | 'ORIGINAL_TX_FAILED'
  | 'NO_ACCOUNT'
  | 'INVALID_XDR'
  | 'ARCHIVE_DETECTION_FAILED'
  | 'NETWORK_ERROR'
  | 'ABORTED'

/**
 * Options-object form for constructing a {@link SorobanResurrectError}.
 *
 * Preferred over the positional form because `context` no longer sits behind
 * an optional `cause`, so call sites can attach `rpcUrl`/`txHash` without
 * passing `undefined` explicitly.
 */
export interface SorobanResurrectErrorOptions {
  message: string
  code: SorobanResurrectErrorCode
  cause?: unknown
  context?: SorobanResurrectErrorContext
}

/**
 * Main error class for SorobanResurrect operations
 * 
 * This error class provides structured error information with context
 * for debugging and error handling in SDK operations.
 */
export class SorobanResurrectError extends Error {
  /** RPC endpoint URL at the time of the error. */
  public rpcUrl?: string
  /** Transaction hash involved in the failing operation. */
  public txHash?: string
  /** Archived key details when detection/restore fails. */
  public archivedKeys?: Array<{ keyBase64: string; keyType: string; contractId?: string }>

  public code: SorobanResurrectErrorCode
  public cause?: unknown

  constructor(options: SorobanResurrectErrorOptions)
  constructor(
    message: string,
    code: SorobanResurrectErrorCode,
    cause?: unknown,
    context?: SorobanResurrectErrorContext,
  )
  constructor(
    messageOrOptions: string | SorobanResurrectErrorOptions,
    code?: SorobanResurrectErrorCode,
    cause?: unknown,
    context?: SorobanResurrectErrorContext,
  ) {
    const options: SorobanResurrectErrorOptions =
      typeof messageOrOptions === 'string'
        ? { message: messageOrOptions, code: code as SorobanResurrectErrorCode, cause, context }
        : messageOrOptions

    super(options.message)
    this.name = 'SorobanResurrectError'
    this.code = options.code
    this.cause = options.cause

    const ctx = options.context
    if (ctx) {
      this.rpcUrl = ctx.rpcUrl
      this.txHash = ctx.txHash
      this.archivedKeys = ctx.archivedKeys
    }
    
    // Maintain proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, SorobanResurrectError.prototype)
  }
}

/**
 * Helper function to create a SorobanResurrectError with proper context
 */
export function createSorobanResurrectError(
  options: SorobanResurrectErrorOptions,
): SorobanResurrectError
export function createSorobanResurrectError(
  message: string,
  code: SorobanResurrectErrorCode,
  cause?: unknown,
  context?: SorobanResurrectErrorContext,
): SorobanResurrectError
export function createSorobanResurrectError(
  messageOrOptions: string | SorobanResurrectErrorOptions,
  code?: SorobanResurrectErrorCode,
  cause?: unknown,
  context?: SorobanResurrectErrorContext,
): SorobanResurrectError {
  if (typeof messageOrOptions === 'string') {
    return new SorobanResurrectError(messageOrOptions, code as SorobanResurrectErrorCode, cause, context)
  }
  return new SorobanResurrectError(messageOrOptions)
}

/**
 * Check if an error is a SorobanResurrectError
 */
export function isSorobanResurrectError(error: unknown): error is SorobanResurrectError {
  return error instanceof SorobanResurrectError
}

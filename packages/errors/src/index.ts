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

  constructor(
    message: string,
    public code: SorobanResurrectErrorCode,
    public cause?: unknown,
    context?: SorobanResurrectErrorContext,
  ) {
    super(message)
    this.name = 'SorobanResurrectError'
    if (context) {
      this.rpcUrl = context.rpcUrl
      this.txHash = context.txHash
      this.archivedKeys = context.archivedKeys
    }
    
    // Maintain proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, SorobanResurrectError.prototype)
  }
}

/**
 * Helper function to create a SorobanResurrectError with proper context
 */
export function createSorobanResurrectError(
  message: string,
  code: SorobanResurrectErrorCode,
  cause?: unknown,
  context?: SorobanResurrectErrorContext,
): SorobanResurrectError {
  return new SorobanResurrectError(message, code, cause, context)
}

/**
 * Check if an error is a SorobanResurrectError
 */
export function isSorobanResurrectError(error: unknown): error is SorobanResurrectError {
  return error instanceof SorobanResurrectError
}

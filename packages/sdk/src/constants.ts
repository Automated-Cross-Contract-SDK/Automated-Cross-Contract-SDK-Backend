export const MAX_XDR_SIZE_BYTES = 100_000
export const DEFAULT_RESTORE_FEE = '100000'
export const MAX_RETRIES = 3
export const RETRY_DELAY_MS = 500
export const DEFAULT_POLL_ATTEMPTS = 30
export const POLL_INTERVAL_MS = 1000
/** Default number of restore batches executed concurrently. */
export const DEFAULT_MAX_CONCURRENCY = 5

/**
 * Soroban RPC transaction status codes.
 */
export const TRANSACTION_STATUS = {
  PENDING: 'PENDING',
  SUCCESS: 'SUCCESS',
  FAILED: 'FAILED',
  ERROR: 'ERROR',
  DUPLICATE: 'DUPLICATE',
  NOT_FOUND: 'NOT_FOUND',
} as const

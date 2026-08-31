export const MAX_XDR_SIZE_BYTES = 100_000
export const DEFAULT_RESTORE_FEE = '100000'
export const MAX_RETRIES = 3
export const RETRY_DELAY_MS = 500
export const DEFAULT_POLL_ATTEMPTS = 30
export const POLL_INTERVAL_MS = 1000
/** Default number of restore batches executed concurrently. */
export const DEFAULT_MAX_CONCURRENCY = 5
/**
 * Estimated number of ledgers a persistent entry's TTL is extended to when it is
 * restored via `RestoreFootprintOp`. This mirrors the network's
 * `minimumPersistentEntryLifetime` setting (4096 on testnet/futurenet at the
 * time of writing) and is used only for the projected TTL shown in
 * `simulateDiff()`. Override per-call with `simulateDiff(xdr, src, { restoredTtlLedgers })`.
 */
export const RESTORED_ENTRY_TTL_LEDGERS = 4096

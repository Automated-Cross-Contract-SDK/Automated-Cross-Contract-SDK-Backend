import { MAX_XDR_SIZE_BYTES } from './constants.js'
import type { ArchivedKey } from './types.js'

/** Estimated envelope overhead (header, source, signatures) per transaction. */
export const RESTORE_TX_OVERHEAD_BYTES = 200

export interface RestoreBatchPlanOptions {
  /** Upper bound on encoded transaction size. Defaults to `MAX_XDR_SIZE_BYTES`. */
  maxXdrBytes?: number
  /** Hard cap on keys per batch (e.g. `maxRestoreBatchSize`). */
  maxKeysPerBatch?: number
  /** Estimated fee in stroops contributed by each restored key. */
  feePerKeyStroops?: number
  /** Maximum total fee in stroops a single batch may require. */
  maxFeePerBatchStroops?: number
}

/**
 * Splits archived keys into restore batches so each batch respects the XDR
 * size limit, an optional key-count cap and an optional fee budget.
 *
 * A single key that alone exceeds a limit is still placed in its own batch,
 * so planning never drops keys; the network will reject it if truly too large.
 */
export function planRestoreBatches(
  keys: ArchivedKey[],
  options: RestoreBatchPlanOptions = {},
): ArchivedKey[][] {
  const maxBytes = positiveOr(options.maxXdrBytes, MAX_XDR_SIZE_BYTES)
  const maxKeys = positiveOr(options.maxKeysPerBatch, Infinity)
  const feePerKey = options.feePerKeyStroops ?? 0
  const maxFee = positiveOr(options.maxFeePerBatchStroops, Infinity)

  const batches: ArchivedKey[][] = []
  let current: ArchivedKey[] = []
  let currentBytes = RESTORE_TX_OVERHEAD_BYTES

  for (const key of keys) {
    const keyBytes = key.keyBase64.length
    const wouldExceed =
      currentBytes + keyBytes > maxBytes ||
      current.length + 1 > maxKeys ||
      (current.length + 1) * feePerKey > maxFee

    if (wouldExceed && current.length > 0) {
      batches.push(current)
      current = []
      currentBytes = RESTORE_TX_OVERHEAD_BYTES
    }
    current.push(key)
    currentBytes += keyBytes
  }

  if (current.length > 0) batches.push(current)
  return batches
}

function positiveOr(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : fallback
}

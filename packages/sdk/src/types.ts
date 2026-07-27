import { xdr } from '@stellar/stellar-sdk'

export interface ArchivedKey {
  key: xdr.LedgerKey
  keyBase64: string
  keyType: 'contractData' | 'contractCode' | 'ttlEntry' | 'unknown'
  contractId?: string
}

export interface SorobanResurrectConfig {
  rpcUrl: string
  networkPassphrase: string
  allowHttp?: boolean
  restoreFee?: string
  maxRestoreBatchSize?: number
  /**
   * Maximum number of restore batches to execute concurrently.
   * Batches containing keys from different contracts are independent and
   * can safely run in parallel. Defaults to 5.
   * Set to 1 to force sequential execution (same as executeRestoreBatches).
   */
  maxConcurrency?: number
  onLog?: (level: 'info' | 'warn' | 'error', message: string, data?: unknown) => void
}

/**
 * A group of archived keys that all belong to the same contract (or share no
 * contract affiliation). Keys within a group must be restored together because
 * they may depend on each other. Groups across different contracts are
 * independent and can be restored concurrently.
 */
export interface ContractKeyGroup {
  /** Hex contract ID, or '__unknown__' for keys without a contractId */
  contractId: string
  keys: ArchivedKey[]
}

export interface SimulationCheckResult {
  needsRestoration: boolean
  archivedKeys: ArchivedKey[]
  totalKeysInFootprint: number
}

export interface RestoreTransactionResult {
  transactionXDR: string
  keysRestored: number
}

export interface RestoreBatchResult {
  batchIndex: number
  transactionXDR: string
  keysRestored: number
  txHash?: string
  status: 'pending' | 'success' | 'failed'
  error?: string
}

export interface RestoreAllBatchesResult {
  success: boolean
  batches: RestoreBatchResult[]
  totalKeysRestored: number
  failedAtBatchIndex?: number
  error?: string
}

/**
 * Result of a concurrent batch restore operation.
 * Unlike the sequential result, all batches are always attempted — partial
 * failures are collected rather than short-circuiting execution.
 */
export interface ConcurrentRestoreResult {
  /** True only when every batch succeeded. */
  success: boolean
  batches: RestoreBatchResult[]
  totalKeysRestored: number
  /** Number of batches that failed. 0 on full success. */
  failedBatchCount: number
  /** Indices of failed batches, in the order they were detected. */
  failedBatchIndices: number[]
  /** Aggregated error message when failedBatchCount > 0. */
  error?: string
  /** Concurrency level actually used. */
  concurrencyUsed: number
}

export interface ExecutionResult {
  success: boolean
  restoreTxHash?: string
  originalTxHash?: string
  entriesRestored: number
  error?: string
  batchResults?: RestoreAllBatchesResult
  concurrentBatchResults?: ConcurrentRestoreResult
}

export interface PreFlightConfig {
  enabled: boolean
  onRestoreNeeded?: (keys: ArchivedKey[]) => void
  onRestoreComplete?: (result: ExecutionResult) => void
  onError?: (error: Error) => void
}

export class SorobanResurrectError extends Error {
  constructor(
    message: string,
    public code: 'SIMULATION_FAILED' | 'RESTORE_FAILED' | 'ORIGINAL_TX_FAILED' | 'NO_ACCOUNT' | 'INVALID_XDR' | 'ARCHIVE_DETECTION_FAILED' | 'NETWORK_ERROR',
    public cause?: unknown
  ) {
    super(message)
    this.name = 'SorobanResurrectError'
  }
}

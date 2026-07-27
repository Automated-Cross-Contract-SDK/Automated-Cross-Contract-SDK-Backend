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
  onLog?: (level: 'info' | 'warn' | 'error', message: string, data?: unknown) => void
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

export interface ExecutionResult {
  success: boolean
  restoreTxHash?: string
  originalTxHash?: string
  entriesRestored: number
  error?: string
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

/**
 * Event map for all transaction lifecycle events emitted by SorobanResurrect.
 */
export interface SorobanResurrectEvents {
  /** Fired when key restoration begins, before any batch is submitted. */
  'restore:start': (keys: ArchivedKey[]) => void
  /** Fired after each individual restore batch transaction is confirmed. */
  'restore:batch:complete': (batchIndex: number, totalBatches: number) => void
  /** Fired once all restore batches have been confirmed successfully. */
  'restore:complete': (result: RestoreTransactionResult) => void
  /** Fired just before the original (user) transaction is submitted. */
  'original:start': () => void
  /** Fired once the original transaction is confirmed on-chain. */
  'original:complete': (hash: string) => void
  /** Fired whenever a SorobanResurrectError is thrown during execution. */
  'error': (error: SorobanResurrectError) => void
}

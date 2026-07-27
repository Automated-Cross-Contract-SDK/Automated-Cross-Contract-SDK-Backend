import { xdr } from '@stellar/stellar-sdk'
import type { RetryPolicy } from './retry-policy.js'
import type { SimulationCacheConfig } from './simulation-cache.js'

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
  simulateOnly?: boolean
  retryPolicy?: RetryPolicy
  simulationCache?: SimulationCacheConfig
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

export interface FeeBumpMetadata {
  isFeeBump: boolean
  innerTransactionXDR?: string
  feeAccountID?: string
  feeBumpFee?: string
}

export interface ExecutionResult {
  success: boolean
  restoreTxHash?: string
  originalTxHash?: string
  entriesRestored: number
  simulateOnly?: boolean
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

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
  /**
   * Controls automatic Soroban RPC version negotiation.
   * Defaults to `{ enabled: true, failOnUnsupported: true }`.
   */
  versionNegotiation?: {
    /** Whether to negotiate the protocol version on first use. Default: true */
    enabled: boolean
    /** Throw an error when the node reports an unsupported protocol. Default: true */
    failOnUnsupported?: boolean
  }
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
    public code: 'SIMULATION_FAILED' | 'RESTORE_FAILED' | 'ORIGINAL_TX_FAILED' | 'NO_ACCOUNT' | 'INVALID_XDR' | 'ARCHIVE_DETECTION_FAILED' | 'NETWORK_ERROR' | 'UNSUPPORTED_PROTOCOL',
    public cause?: unknown
  ) {
    super(message)
    this.name = 'SorobanResurrectError'
  }
}

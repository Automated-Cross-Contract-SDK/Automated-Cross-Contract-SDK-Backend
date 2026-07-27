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
   * Timeout in milliseconds for RPC requests made by SorobanRpc.Server.
   * Defaults to the Stellar SDK default when not set.
   */
  timeout?: number
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

/**
 * Extra context attached to every SorobanResurrectError for easier debugging.
 */
export interface SorobanResurrectErrorContext {
  /** The RPC endpoint that was being used when the error occurred. */
  rpcUrl?: string
  /** The transaction hash involved in the failing operation, when available. */
  txHash?: string
  /** Archived ledger-key details that triggered the failure, when available. */
  archivedKeys?: Array<{ keyBase64: string; keyType: string; contractId?: string }>
}

export class SorobanResurrectError extends Error {
  /** RPC endpoint URL at the time of the error. */
  public rpcUrl?: string
  /** Transaction hash involved in the failing operation. */
  public txHash?: string
  /** Archived key details when detection/restore fails. */
  public archivedKeys?: Array<{ keyBase64: string; keyType: string; contractId?: string }>

  constructor(
    message: string,
    public code: 'SIMULATION_FAILED' | 'RESTORE_FAILED' | 'ORIGINAL_TX_FAILED' | 'NO_ACCOUNT' | 'INVALID_XDR' | 'ARCHIVE_DETECTION_FAILED' | 'NETWORK_ERROR',
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
  }
}

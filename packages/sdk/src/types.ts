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
   * When `true`, the SDK attempts to subscribe to transaction status updates
   * via WebSocket instead of polling with `getTransaction`. If the server does
   * not support WebSocket connections, or if the connection fails, the SDK
   * automatically falls back to polling. Defaults to `false`.
   */
  useWebSocket?: boolean
}

/**
 * The JSON-RPC 2.0 message shape sent by a Soroban RPC server over its
 * WebSocket endpoint when a subscribed transaction changes status.
 */
export interface WsTransactionStatusEvent {
  jsonrpc: '2.0'
  method: 'transaction_status'
  params: {
    hash: string
    status: 'PENDING' | 'SUCCESS' | 'FAILED' | 'NOT_FOUND'
    result?: string
    error?: string
  }
}

/**
 * Result returned by the internal `waitForTransaction` helper, regardless of
 * whether the WebSocket or polling path was used.
 */
export interface TransactionWaitResult {
  hash: string
  /** Which transport was actually used to receive the final status. */
  transport: 'websocket' | 'polling'
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

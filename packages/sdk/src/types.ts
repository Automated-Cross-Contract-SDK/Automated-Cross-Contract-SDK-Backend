import { xdr } from '@stellar/stellar-sdk'
import type { RetryPolicy } from './retry-policy.js'
import type { SimulationCacheConfig } from './simulation-cache.js'

/**
 * SAC (Stellar Asset Contract) specific key types.
 *
 * SAC tokens store per-user state in `ContractData` ledger entries whose XDR key
 * is an `ScVal` with predictable shape:
 *
 * | sacKeyType      | ScVal shape                                                         |
 * |-----------------|---------------------------------------------------------------------|
 * | `sacBalance`    | `scvVec([ scvSymbol("Balance"), scvAddress(account) ])`             |
 * | `sacAllowance`  | `scvVec([ scvSymbol("Allowance"), scvMap([from, spender]) ])`       |
 * | `sacNonce`      | `scvLedgerKeyNonce` (ScNonceKey)                                    |
 * | `sacAdmin`      | `scvSymbol("Admin")`                                                |
 * | `sacMetadata`   | `scvSymbol("Name"|"Symbol"|"Decimals")`                             |
 */
export type SacKeyType = 'sacBalance' | 'sacAllowance' | 'sacNonce' | 'sacAdmin' | 'sacMetadata'

/**
 * Restoration priority order.
 *
 * Contract instance entries **must** be restored before their contract data
 * entries become accessible, so they carry a lower numeric priority value
 * (restored first).
 *
 * | priority | meaning                                      |
 * |----------|----------------------------------------------|
 * | 0        | contractInstance – restore first             |
 * | 1        | contractCode    – restore second             |
 * | 2        | contractData    – restore last               |
 * | 3        | other / unknown – restore last               |
 */
export type RestorePriority = 0 | 1 | 2 | 3

export interface ArchivedKey {
  key: xdr.LedgerKey
  keyBase64: string
  /**
   * High-level entry type classification.
   *
   * - `contractInstance` – the contract's own instance entry (new, issue #48)
   * - `contractData`     – generic contract data (includes SAC entries, issue #47)
   * - `contractCode`     – the contract's WASM bytecode entry
   * - `ttlEntry`         – a TTL / expiry ledger entry
   * - `unknown`          – unrecognised entry type
   */
  keyType: 'contractInstance' | 'contractData' | 'contractCode' | 'ttlEntry' | 'unknown'
  /**
   * SAC-specific sub-classification, only present when `keyType === 'contractData'`
   * and the entry belongs to a Stellar Asset Contract.
   */
  sacKeyType?: SacKeyType
  /** Hex-encoded contract ID, when available. */
  contractId?: string
  /**
   * Restoration priority — lower numbers should be restored first.
   * `contractInstance` entries always have priority 0 so they are sent to the
   * chain before any dependent `contractData` entries.
   */
  restorePriority: RestorePriority
}

export interface SorobanResurrectConfig {
  /** Single RPC URL or an ordered list of fallback URLs */
  rpcUrl: string | string[]
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
  /**
   * When `true`, the SDK attempts to subscribe to transaction status updates
   * via WebSocket instead of polling with `getTransaction`. If the server does
   * not support WebSocket connections, or if the connection fails, the SDK
   * automatically falls back to polling. Defaults to `false`.
   */
  useWebSocket?: boolean
  /**
   * When `true`, a mismatch between `networkPassphrase` and the passphrase
   * reported by the RPC server's `getNetwork()` throws a `SorobanResurrectError`
   * with code `NETWORK_ERROR` instead of only logging a warning.
   */
  strictNetworkValidation?: boolean
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
  batchResults?: RestoreAllBatchesResult
  concurrentBatchResults?: ConcurrentRestoreResult
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

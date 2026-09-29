import { xdr } from '@stellar/stellar-sdk'

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
  /**
   * Validity window, in seconds, applied to restore/original transactions via
   * `TransactionBuilder.setTimeout`. Soroban RPC expects an explicit validity
   * window rather than `[0, 0]` time bounds. Defaults to `60`.
   */
  txValiditySeconds?: number
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
  /**
   * Delay in milliseconds between polling attempts when waiting for a
   * transaction to reach a terminal status. Defaults to `1000`.
   */
  pollIntervalMs?: number
  /**
   * Maximum number of polling attempts before giving up on a transaction.
   * Defaults to `30`.
   */
  maxPollAttempts?: number
  /**
   * When set, caches `extractFootprintFromTransaction` results keyed by the
   * SHA-256 hash of the transaction XDR.  This avoids redundant XDR parsing
   * when the same transaction is passed to multiple SDK methods (e.g.
   * `simulate` and `checkTransaction`).
   *
   * Call `invalidateFootprintCache()` / `onLedgerClose()` to flush stale
   * entries when a new ledger closes.
   */
  footprintCache?: FootprintCacheConfig
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
  /**
   * Keys detected as archived.  Classification (keyType, sacKeyType,
   * restorePriority) is deferred — call `classifyDeferredKeys()` from
   * `footprint-parser` to resolve them into full `ArchivedKey` objects
   * before batch building.
   */
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
  status: 'pending' | 'success' | 'failed'
  txHash?: string
  error?: string
}

export interface RestoreAllBatchesResult {
  success: boolean
  batches: RestoreBatchResult[]
  totalKeysRestored: number
  failedAtBatchIndex?: number
  error?: string
}

export interface ConcurrentRestoreResult {
  success: boolean
  batches: RestoreBatchResult[]
  totalKeysRestored: number
  failedBatchCount?: number
  failedBatchIndices?: number[]
  error?: string
  concurrencyUsed?: number
}

export interface RpcEndpointHealth {
  url: string
  isHealthy: boolean
  consecutiveFailures: number
  consecutiveSuccesses: number
  lastChecked: number | null
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
  /**
   * Index of the first batch that failed during a multi-batch restore (0-based).
   * Populated when a restore fails partway through; undefined on full success.
   */
  failedBatchIndex?: number
  /**
   * Number of entries that were successfully restored before the failure.
   * Differs from `entriesRestored` when a partial failure occurred.
   */
  partialEntriesRestored?: number
}

/**
 * Captured state from a partially-failed multi-batch restore, returned by
 * `getFailedKeys()` and consumed by `retryFailedRestore()`.
 */
export interface FailedRestoreState {
  /** The source account that was used for the original restore attempt. */
  sourceAccountID: string
  /**
   * Batches that were not successfully su

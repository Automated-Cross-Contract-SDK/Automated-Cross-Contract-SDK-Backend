import { xdr, Account, Transaction } from '@stellar/stellar-sdk'

/**
 * Abstract interface for Soroban RPC client implementations.
 *
 * This interface abstracts the underlying RPC client (e.g., @stellar/stellar-sdk's SorobanRpc.Server)
 * to allow for alternative implementations such as:
 * - soroban-client instead of @stellar/stellar-sdk
 * - Mock/stub implementations in tests
 * - Custom RPC proxy implementations
 *
 * Implementations must provide the core RPC methods used by SorobanResurrect.
 */
export interface SorobanRpcClient {
  /**
   * Fetch account information from the ledger.
   * @param publicKey - The public key of the account to fetch
   * @returns Account information including sequence number
   */
  getAccount(publicKey: string): Promise<Account>

  /**
   * Simulate a transaction without submitting it to the network.
   * @param tx - The transaction to simulate
   * @returns Simulation result including resource fees and footprint
   */
  simulateTransaction(tx: Transaction): Promise<SorobanRpcApiSimulateTransactionResponse>

  /**
   * Submit a signed transaction to the network.
   * @param tx - The signed transaction to submit
   * @returns Send transaction response with hash and status
   */
  sendTransaction(tx: Transaction): Promise<SorobanRpcApiSendTransactionResponse>

  /**
   * Fetch transaction status and details.
   * @param hash - The transaction hash to query
   * @returns Transaction status and metadata
   */
  getTransaction(hash: string): Promise<SorobanRpcApiGetTransactionResponse>

  /**
   * Fetch ledger entries by their keys.
   * @param keys - Array of ledger keys to fetch
   * @returns Ledger entries and their values
   */
  getLedgerEntries(...keys: xdr.LedgerKey[]): Promise<SorobanRpcApiGetLedgerEntriesResponse>

  /**
   * Get network information including passphrase and protocol version.
   * @returns Network metadata
   */
  getNetwork(): Promise<SorobanRpcApiNetworkInfo>
}

/**
 * Re-exported types from @stellar/stellar-sdk SorobanRpc.Api namespace
 * to avoid direct dependency on the SDK in interface definitions.
 *
 * These types match the shape of responses from Soroban RPC methods.
 */
export interface SorobanRpcApiSimulateTransactionResponse {
  id?: string
  transactionData: any
  minResourceFee: string
  results?: any[]
  cost?: {
    cpuInsns: string
    memBytes: string
  }
  latestLedger: number
  restorePreamble?: {
    minResourceFee: string
    transactionData: any
  }
  error?: string
}

export interface SorobanRpcApiSendTransactionResponse {
  status: 'PENDING' | 'DUPLICATE' | 'TRY_AGAIN_LATER' | 'ERROR'
  hash: string
  latestLedger: number
  latestLedgerCloseTime?: number
  errorResult?: string
}

export interface SorobanRpcApiGetTransactionResponse {
  status: 'SUCCESS' | 'FAILED' | 'NOT_FOUND' | 'PENDING'
  hash: string
  latestLedger: number
  latestLedgerCloseTime?: number
  createdAt?: number
  result?: string
  resultXdr?: string
  envelopeXdr?: string
  metaXdr?: string
}

export interface SorobanRpcApiGetLedgerEntriesResponse {
  entries: Array<{
    key: xdr.LedgerKey
    xdr: string
    lastModifiedLedgerSeq: number
  }>
  latestLedger: number
}

export interface SorobanRpcApiNetworkInfo {
  passphrase: string
  protocolVersion: number
  friendbotUrl?: string
}

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
  /**
   * Runtime feature flags to enable/disable experimental features without
   * breaking changes. All flags default to `false` (experimental features
   * disabled).
   */
  featureFlags?: FeatureFlags
  /**
   * Custom RPC client implementation. When provided, this takes precedence over
   * the default @stellar/stellar-sdk SorobanRpc.Server instance constructed from
   * `rpcUrl`. This allows using alternative implementations like soroban-client,
   * mock servers for testing, or custom RPC proxies.
   *
   * When using a custom client, `rpcUrl` is still required for network validation
   * and fallback logic, but the actual RPC calls will be made through this client.
   */
  rpcClient?: SorobanRpcClient
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
  healthy: boolean
  lastCheck: number
  latencyMs: number
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
   * Batches that were not successfully submitted (status !== 'success').
   * These are the exact `RestoreBatchResult` objects that need to be retried.
   */
  failedBatches: RestoreBatchResult[]
  /**
   * Keys that remain unrestored — flattened from all failed batches.
   * Useful for reporting and logging purposes.
   */
  failedKeys: ArchivedKey[]
  /** Zero-based index of the first batch that failed. */
  failedBatchIndex: number
  /** Number of entries that were successfully restored before the failure. */
  partialEntriesRestored: number
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
  'error': (error: SorobanResurrectErrorBase) => void
}

/**
 * Base error class for SorobanResurrect - will be extended in errors package
 */
export interface SorobanResurrectErrorBase {
  message: string
  code: 'SIMULATION_FAILED' | 'RESTORE_FAILED' | 'ORIGINAL_TX_FAILED' | 'NO_ACCOUNT' | 'INVALID_XDR' | 'ARCHIVE_DETECTION_FAILED' | 'NETWORK_ERROR' | 'ABORTED'
  cause?: unknown
  rpcUrl?: string
  txHash?: string
  archivedKeys?: Array<{ keyBase64: string; keyType: string; contractId?: string }>
}

// Configuration interfaces for cache and retry policies
export interface SimulationCacheConfig {
  enabled: boolean
  maxSize: number
  ttlMs: number
}

export interface SimulationCacheStatistics {
  hits: number
  misses: number
  evictions: number
  size: number
  hitRate: number
}

export interface FootprintCacheConfig {
  /** Maximum number of cached entries (default: 500). */
  maxSize: number
}

export interface RpcFailoverConfig {
  /** How often (ms) to run background health checks */
  healthCheckIntervalMs: number
  /** How many consecutive failures before marking an endpoint unhealthy */
  maxFailuresBeforeFallback: number
  /** How many consecutive successes before restoring a previously unhealthy endpoint */
  successThresholdToRestore: number
}

export interface RetryPolicy {
  /** Maximum number of retry attempts */
  maxRetries: number

  /**
   * Determine if an error should be retried
   * @param error The error that occurred
   * @param attempt The attempt number (1-indexed)
   * @returns true if the operation should be retried, false otherwise
   */
  shouldRetry(error: SorobanResurrectErrorBase, attempt: number): boolean

  /**
   * Get the delay in milliseconds before the next retry attempt
   * @param attempt The attempt number (1-indexed)
   * @returns Delay in milliseconds
   */
  getDelay(attempt: number): number

  /**
   * Reset any internal state (used by CircuitBreaker)
   */
  reset?(): void
}

export interface CacheStatistics {
  hits: number
  misses: number
  evictions: number
  size: number
  hitRate: number
}

export interface FootprintCacheStatistics {
  hits: number
  misses: number
  size: number
  hitRate: number
}

// Version negotiation types
export interface ProtocolSupport {
  version: string
  supported: boolean
}

export interface ServerVersionInfo {
  version: string
  protocolVersion?: string
  capabilities?: string[]
}

export interface XdrEncodingOptions {
  /** Force base64 encoding instead of hex */
  base64?: boolean
  /** Include XDR type information */
  includeType?: boolean
}

/**
 * Runtime feature flags to enable/disable experimental features without breaking changes.
 * All flags default to `false` (experimental features disabled).
 */
export interface FeatureFlags {
  /** Enable fee bump transaction support (experimental) */
  feeBumpSupport?: boolean
  /** Enable concurrent batch execution (experimental) */
  concurrentBatches?: boolean
  /** Enable WASM parser for footprint extraction (experimental) */
  wasmParser?: boolean
  /** Enable persistent cache for simulation and footprint data (experimental) */
  persistentCache?: boolean
}

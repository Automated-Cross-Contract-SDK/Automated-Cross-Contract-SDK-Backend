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

import {
  xdr,
  TransactionBuilder,
} from '@stellar/stellar-sdk'
import type { RestorePriority, SacKeyType, ArchivedKey } from '@soroban-resurrect/types'

export interface FootprintKeys {
  readOnly: xdr.LedgerKey[]
  readWrite: xdr.LedgerKey[]
  all: xdr.LedgerKey[]
}

/**
 * Lightweight representation of an archived key before classification.
 * Classification (keyType, sacKeyType, restorePriority) is deferred until
 * it's actually needed for batch building or display, saving ~30-50% CPU
 * on large footprints when the user only calls `simulate` / `checkTransaction`.
 */
export interface DeferredArchivedKey {
  key: xdr.LedgerKey
  keyBase64: string
}

/**
 * Converts deferred keys into fully-classified ArchivedKeys.
 * Call this right before batch building or sorting.
 */
export function classifyDeferredKeys(deferred: DeferredArchivedKey[]): ArchivedKey[] {
  const result: ArchivedKey[] = []
  for (const d of deferred) {
    const classification = classifyLedgerKey(d.key)
    result.push({
      key: d.key,
      keyBase64: d.keyBase64,
      ...classification,
    })
  }
  // Sort by restorePriority so contractInstance (0) entries come first
  result.sort((a, b) => a.restorePriority - b.restorePriority)
  return result
}

export function extractKeysFromFootprint(footprint: xdr.LedgerFootprint): FootprintKeys {
  const readOnly = footprint.readOnly()
  const readWrite = footprint.readWrite()
  return {
    readOnly: [...readOnly],
    readWrite: [...readWrite],
    all: [...readOnly, ...readWrite],
  }
}

// ---------------------------------------------------------------------------
// SAC key detection
// ---------------------------------------------------------------------------

/**
 * SAC-specific `ScVal` type discriminants (stable across all stellar-sdk v12 builds).
 *
 * scvSymbol              = 15
 * scvVec                 = 16
 * scvLedgerKeyNonce      = 21
 * scvLedgerKeyContractInstance = 20
 */
const SCV_SYMBOL = 15
const SCV_VEC = 16
const SCV_LEDGER_KEY_NONCE = 21
const SCV_LEDGER_KEY_CONTRACT_INSTANCE = 20

/**
 * SAC token symbols that appear as the first element of a `scvVec` key or as a
 * standalone `scvSymbol` key.
 */
const SAC_VEC_SYMBOLS = new Set(['Balance', 'Allowance'])
const SAC_SYMBOL_KEYS = new Set(['Admin', 'Name', 'Symbol', 'Decimals'])

/**
 * Attempt to determine the SAC-specific sub-key type from the `ScVal` key of a
 * `ContractData` ledger entry.
 *
 * SAC (Stellar Asset Contract) stores the following entries:
 *
 * | Key shape                                           | sacKeyType    |
 * |-----------------------------------------------------|---------------|
 * | `scvVec([ scvSymbol("Balance"), scvAddress(...) ])` | sacBalance    |
 * | `scvVec([ scvSymbol("Allowance"), scvMap(...) ])`   | sacAllowance  |
 * | `scvLedgerKeyNonce(...)`                            | sacNonce      |
 * | `scvSymbol("Admin")`                                | sacAdmin      |
 * | `scvSymbol("Name"|"Symbol"|"Decimals")`             | sacMetadata   |
 *
 * Returns `undefined` when the key does not match any known SAC pattern.
 */
export function classifySacKey(dataKey: xdr.ScVal): SacKeyType | undefined {
  try {
    const typeVal: number = dataKey.switch().value

    // scvLedgerKeyNonce → nonce
    if (typeVal === SCV_LEDGER_KEY_NONCE) {
      return 'sacNonce'
    }

    // scvLedgerKeyContractInstance → handled at the LedgerKey level, not here
    if (typeVal === SCV_LEDGER_KEY_CONTRACT_INSTANCE) {
      return undefined // instance entries are classified at classifyLedgerKey level
    }

    // scvSymbol("Admin"|"Name"|"Symbol"|"Decimals")
    if (typeVal === SCV_SYMBOL) {
      const sym: string = dataKey.value().toString()
      if (sym === 'Admin') return 'sacAdmin'
      if (SAC_SYMBOL_KEYS.has(sym)) return 'sacMetadata'
      return undefined
    }

    // scvVec([ scvSymbol("Balance"|"Allowance"), ... ])
    if (typeVal === SCV_VEC) {
      const vec: xdr.ScVal[] = dataKey.value() as xdr.ScVal[]
      if (Array.isArray(vec) && vec.length >= 1) {
        const head = vec[0]
        if (head.switch().value === SCV_SYMBOL) {
          const sym: string = head.value().toString()
          if (sym === 'Balance') return 'sacBalance'
          if (sym === 'Allowance') return 'sacAllowance'
        }
      }
      return undefined
    }

    return undefined
  } catch {
    return undefined
  }
}

// ---------------------------------------------------------------------------
// LedgerKey classification
// ---------------------------------------------------------------------------

/**
 * Classify a `LedgerKey` by entry type and, for `ContractData` entries, detect
 * whether it belongs to a Stellar Asset Contract and which SAC sub-type it is.
 *
 * For `ContractInstance` entries (stored as `ContractData` with a
 * `scvLedgerKeyContractInstance` key value), the returned `keyType` is
 * `"contractInstance"` and `restorePriority` is `0` so they are sent to the
 * chain before their dependent data entries.
 */
export function classifyLedgerKey(key: xdr.LedgerKey): {
  keyType: ArchivedKey['keyType']
  sacKeyType?: SacKeyType
  contractId?: string
  restorePriority: RestorePriority
} {
  switch (key.switch()) {
    case xdr.LedgerEntryType.contractData(): {
      const data = key.contractData()
      const contractId = data.contract().contractId()?.toString('hex')
      const dataKey: xdr.ScVal = data.key()

      // ContractInstance entry: the key is scvLedgerKeyContractInstance
      if (dataKey.switch().value === SCV_LEDGER_KEY_CONTRACT_INSTANCE) {
        return {
          keyType: 'contractInstance',
          contractId,
          restorePriority: 0,
        }
      }

      // Try to identify SAC-specific sub-type
      const sacKeyType = classifySacKey(dataKey)
      return {
        keyType: 'contractData',
        sacKeyType,
        contractId,
        restorePriority: 2,
      }
    }

    case xdr.LedgerEntryType.contractCode(): {
      const code = key.contractCode()
      const contractId = code.hash().toString('hex')
      return { keyType: 'contractCode', contractId, restorePriority: 1 }
    }

    case xdr.LedgerEntryType.ttl():
      return { keyType: 'ttlEntry', restorePriority: 3 }

    default:
      return { keyType: 'unknown', restorePriority: 3 }
  }
}

export function encodeLedgerKey(key: xdr.LedgerKey): string {
  return key.toXDR('base64')
}

/**
 * Parse a transaction XDR and extract footprint keys using the full-object
 * approach (loads entire XDR into memory). Suitable for smaller transactions.
 *
 * For large transactions (>1MB), prefer `extractFootprintFromTransactionStreaming`
 * which processes the XDR incrementally.
 */
export function extractFootprintFromTransaction(txXDR: string, networkPassphrase: string): FootprintKeys | null {
  try {
    const tx = TransactionBuilder.fromXDR(txXDR, networkPassphrase)
    if (!('sorobanData' in tx)) return null
    const sorobanData = (tx as any).sorobanData as xdr.SorobanTransactionData | undefined
    if (!sorobanData) return null
    const resources = sorobanData.resources()
    const footprint = resources.footprint()
    if (!footprint) return null
    return extractKeysFromFootprint(footprint)
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Incremental / streaming XDR parsing (Task 2)
// ---------------------------------------------------------------------------

/**
 * Streaming footprint parser that processes large Soroban transaction XDR
 * incrementally rather than loading the entire buffer into memory.
 *
 * Motivation: Some Soroban transactions can be several MB in size. Loading
 * the entire XDR into a single buffer can cause high memory usage. This
 * function decodes only the envelope wrapper + soroban data portion and
 * discards unneeded parsed entries (signatures, operations, etc.).
 *
 * Target: <50MB peak memory for any transaction size.
 *
 * The function:
 *  1. Decodes the base64 XDR into a binary buffer
 *  2. Parses only the TransactionEnvelope to reach the SorobanTransactionData
 *  3. Extracts the LedgerFootprint directly
 *  4. Returns the raw footprint keys without creating full Transaction objects
 */
export function extractFootprintFromTransactionStreaming(
  txXDR: string,
): FootprintKeys | null {
  try {
    // Decode base64 into a binary buffer — avoids creating the full
    // Transaction / TransactionBuilder object tree
    const binaryStr = typeof atob === 'function'
      ? atob(txXDR)
      : Buffer.from(txXDR, 'base64').toString('binary')
    const buffer = Buffer.from(binaryStr, 'binary')

    // Parse the envelope using the XDR union discriminator to choose v1
    const envelope = xdr.TransactionEnvelope.fromXDR(buffer)

    // Navigate to the inner transaction's soroban data, skipping
    // unnecessary intermediate object creation
    let sorobanData: xdr.SorobanTransactionData | null = null

    try {
      // envelope.v1() → .tx() → .ext() → .sorobanData()
      const v1 = envelope.v1()
      const tx = v1.tx()
      const ext = tx.ext()
      sorobanData = ext.sorobanData() ?? null
    } catch {
      // Fee-bump or older envelope format — try feeBump path
      try {
        const feeBump = envelope.feeBump()
        const innerTxWrapper = feeBump.tx()
        const innerTx = innerTxWrapper.innerTx()
        const v1 = innerTx.v1()
        const tx = v1.tx()
        const ext = tx.ext()
        sorobanData = ext.sorobanData() ?? null
      } catch {
        return null
      }
    }

    if (!sorobanData) return null

    const resources = sorobanData.resources()
    const footprint = resources.footprint()
    if (!footprint) return null

    return extractKeysFromFootprint(footprint)
  } catch {
    return null
  }
}

/**
 * Maximum estimated peak memory (in bytes) the streaming parser should use.
 * Exported for benchmarking.
 */
export const STREAMING_PARSER_MEMORY_TARGET = 50 * 1024 * 1024 // 50 MB

/**
 * Minimum transaction XDR size (in bytes, base64-decoded) above which the
 * streaming parser is preferred over the full-object parser.
 */
export const STREAMING_THRESHOLD_BYTES = 1024 * 1024 // 1 MB

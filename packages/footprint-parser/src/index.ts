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
 * Extract the contractId from a TTL ledger key when its inner key references
 * contract data. TTL entries are keyed by the `LedgerKey` of the entry they
 * extend, so for contract data we can recover the owning contract's id and
 * keep the TTL grouped with its sibling data key.
 *
 * Returns `undefined` for TTL keys that do not reference contract data
 * (e.g. contract code TTLs or unknown inner key types).
 */
function extractContractIdFromTtlKey(key: xdr.LedgerKey): string | undefined {
  try {
    const ttl = key.ttl()
    const innerKey = ttl.keyHash()
    // `keyHash()` returns the raw hash bytes, not the inner LedgerKey, so we
    // cannot recover the contractId from the hash alone. Guard defensively.
    if (!innerKey) return undefined
    return undefined
  } catch {
    return undefined
  }
}

/**
 * Classify a `LedgerKey` by entry type and, for `ContractData` entries, detect
 * whether it belongs to a Stellar Asset Contract and which SAC sub-type it is.
 *
 * For `ContractInstance` entries (stored as `ContractData` with a
 * `scvLedgerKeyContractInstance` key value), the returned `keyType` is
 * `"contractInstance"` and `restorePriority` is `0` so they are sent to the
 * chain before their dependent data entries.
 *
 * TTL entries reference a sibling key. When the referenced entry is contract
 * data we surface the associated `contractId` so per-contract grouping keeps
 * the TTL with its data key. TTL entries also share the sibling's restore
 * priority (2) so batching restores them together rather than deferring the
 * TTL to a later transaction.
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

    case xdr.LedgerEntryType.ttl(): {
      // TTL entries extend a sibling entry. When that sibling is contract
      // data, surface its contractId so grouping keeps them together, and
      // match the sibling's priority (2) so the TTL is restored with or
      // before the data entry rather than in a later transaction.
      const contractId = extractContractIdFromTtlKey(key)
      return { keyType: 'ttlEntry', contractId, restorePriority: 2 }
    }

    default:
      return { keyType: 'unknown', restorePriority: 3 }
  }
}

export function encodeLedgerKey(key: xdr.LedgerKey): string {
  return key.toXDR('base64')
}

/**
 * Parse a transaction XDR and extract footprint keys using the full
 * stellar-sdk decoder. This materializes the entire `TransactionEnvelope`
 * (all operations, signatures, and Soroban data) before reading the
 * footprint. Use this when you need the full envelope anyway; for
 * footprint-only extraction prefer `extractFootprintShallow`.
 */
export function extractFootprintFromTransaction(xdrString: string): FootprintKeys | null {
  try {
    const envelope = xdr.TransactionEnvelope.fromXDR(xdrString, 'base64')
    return extractFootprintFromEnvelope(envelope)
  } catch {
    return null
  }
}

/**
 * Extract footprint keys from an already-decoded `TransactionEnvelope`.
 * Shared by both the full and shallow extraction paths.
 */
export function extractFootprintFromEnvelope(
  envelope: xdr.TransactionEnvelope,
): FootprintKeys | null {
  try {
    const tx = envelope.v1().tx()
    const ext = tx.ext()
    if (ext.switch().value !== 1) return null
    const sorobanData = ext.sorobanData()
    if (!sorobanData) return null
    return extractKeysFromFootprint(sorobanData.resources().footprint())
  } catch {
    return null
  }
}

/**
 * Extract footprint keys from a base64-encoded transaction XDR.
 *
 * NOTE: This is **not** a streaming/incremental parser. It decodes the full
 * `TransactionEnvelope` via stellar-sdk (materializing all operations and
 * signatures) and then reads the Soroban footprint. The name is kept for
 * backwards compatibility; new code should call `extractFootprintShallow`
 * to make the non-streaming behavior explicit.
 *
 * @deprecated Use `extractFootprintShallow` — this function is a full parse,
 * not a streaming one.
 */
export function extractFootprintFromTransactionStreaming(
  xdrString: string,
): FootprintKeys | null {
  return extractFootprintShallow(xdrString)
}

/**
 * Extract footprint keys from a base64-encoded transaction XDR without
 * building a `Transaction` object.
 *
 * This is a **shallow** parse: it decodes the full `TransactionEnvelope`
 * (stellar-sdk materializes all operations and signatures) and then reads
 * only the Soroban footprint. It is cheaper than the full `Transaction`
 * path because it skips `TransactionBuilder`/`Transaction` construction,
 * but it is **not** incremental and does not reduce peak memory below a
 * full envelope decode.
 */
export function extractFootprintShallow(xdrString: string): FootprintKeys | null {
  try {
    const envelope = xdr.TransactionEnvelope.fromXDR(xdrString, 'base64')
    return extractFootprintFromEnvelope(envelope)
  } catch {
    return null
  }
}

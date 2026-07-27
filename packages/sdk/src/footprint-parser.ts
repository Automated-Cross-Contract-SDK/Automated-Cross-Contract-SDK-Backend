import {
  xdr,
  TransactionBuilder,
} from '@stellar/stellar-sdk'
import type { ArchivedKey, RestorePriority, SacKeyType } from './types.js'

export interface FootprintKeys {
  readOnly: xdr.LedgerKey[]
  readWrite: xdr.LedgerKey[]
  all: xdr.LedgerKey[]
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

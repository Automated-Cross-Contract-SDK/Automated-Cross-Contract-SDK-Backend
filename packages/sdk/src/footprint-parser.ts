import {
  xdr,
  TransactionBuilder,
} from '@stellar/stellar-sdk'

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

export function classifyLedgerKey(key: xdr.LedgerKey): {
  keyType: 'contractData' | 'contractCode' | 'ttlEntry' | 'unknown'
  contractId?: string
} {
  switch (key.switch()) {
    case xdr.LedgerEntryType.contractData(): {
      const data = key.contractData()
      const contractId = data.contract().contractId()?.toString('hex')
      return { keyType: 'contractData', contractId }
    }
    case xdr.LedgerEntryType.contractCode(): {
      const code = key.contractCode()
      const contractId = code.hash().toString('hex')
      return { keyType: 'contractCode', contractId }
    }
    case xdr.LedgerEntryType.ttl():
      return { keyType: 'ttlEntry' }
    default:
      return { keyType: 'unknown' }
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

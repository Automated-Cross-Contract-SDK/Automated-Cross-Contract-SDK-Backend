import { describe, it, expect } from 'vitest'
import { xdr } from '@stellar/stellar-sdk'
import { classifyLedgerKey, encodeLedgerKey } from '../src/index.js'

// Fixture set for parser maintainers: one ledger key per supported shape.
// Each entry names the classification the parser must produce, so a change
// to classification rules shows up as a fixture diff rather than a silent drift.
const id = Buffer.alloc(32, 7)
const contractData = (key: xdr.ScVal) =>
  xdr.LedgerKey.contractData(
    new xdr.LedgerKeyContractData({
      contract: xdr.ScAddress.scAddressTypeContract(id),
      key,
      durability: xdr.ContractDataDurability.persistent(),
    }),
  )

const FIXTURES: { name: string; key: xdr.LedgerKey; keyType: string; restorePriority: number }[] = [
  {
    name: 'contract instance',
    key: contractData(xdr.ScVal.scvLedgerKeyContractInstance()),
    keyType: 'contractInstance',
    restorePriority: 0,
  },
  {
    name: 'contract code',
    key: xdr.LedgerKey.contractCode(new xdr.LedgerKeyContractCode({ hash: id })),
    keyType: 'contractCode',
    restorePriority: 1,
  },
  {
    name: 'contract data',
    key: contractData(xdr.ScVal.scvSymbol('counter')),
    keyType: 'contractData',
    restorePriority: 2,
  },
]

describe('fixture validation', () => {
  it.each(FIXTURES)('classifies the $name fixture as expected', ({ key, keyType, restorePriority }) => {
    const result = classifyLedgerKey(key)
    expect(result.keyType).toBe(keyType)
    expect(result.restorePriority).toBe(restorePriority)
  })

  it.each(FIXTURES)('round-trips the $name fixture through base64 XDR', ({ key }) => {
    const encoded = encodeLedgerKey(key)
    expect(xdr.LedgerKey.fromXDR(encoded, 'base64').toXDR('base64')).toBe(encoded)
  })

  it('reports every fixture key with a restore priority in the documented 0-3 range', () => {
    for (const { key } of FIXTURES) {
      const { restorePriority } = classifyLedgerKey(key)
      expect([0, 1, 2, 3]).toContain(restorePriority)
    }
  })
})

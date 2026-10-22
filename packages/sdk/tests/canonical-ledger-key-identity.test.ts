import { describe, it, expect } from 'vitest'
import { xdr } from '@stellar/stellar-sdk'
import { classifyLedgerKey, encodeLedgerKey } from '../src/footprint-parser.js'

const contractDataKey = (
  contractHex: string,
  durability: 'persistent' | 'temporary' = 'persistent',
  symbol = 'counter',
): xdr.LedgerKey =>
  xdr.LedgerKey.contractData(
    new xdr.LedgerKeyContractData({
      contract: xdr.ScAddress.scAddressTypeContract(Buffer.from(contractHex, 'hex')),
      key: xdr.ScVal.scvSymbol(symbol),
      durability:
        durability === 'persistent'
          ? xdr.ContractDataDurability.persistent()
          : xdr.ContractDataDurability.temporary(),
    }),
  )

describe('canonical identity for parsed ledger keys', () => {
  const contractHex = '00'.repeat(32)

  it('produces the same identity for equal keys built independently', () => {
    const a = encodeLedgerKey(contractDataKey(contractHex))
    const b = encodeLedgerKey(contractDataKey(contractHex))
    expect(a).toBe(b)
  })

  it('round-trips through its base64 identity to an equal key', () => {
    const original = contractDataKey(contractHex)
    const identity = encodeLedgerKey(original)
    const decoded = xdr.LedgerKey.fromXDR(identity, 'base64')
    expect(encodeLedgerKey(decoded)).toBe(identity)
    expect(classifyLedgerKey(decoded)).toEqual(classifyLedgerKey(original))
  })

  it('distinguishes keys that differ only in durability', () => {
    const persistent = encodeLedgerKey(contractDataKey(contractHex, 'persistent'))
    const temporary = encodeLedgerKey(contractDataKey(contractHex, 'temporary'))
    expect(persistent).not.toBe(temporary)
  })

  it('distinguishes keys that differ only in owning contract', () => {
    const a = encodeLedgerKey(contractDataKey('00'.repeat(32)))
    const b = encodeLedgerKey(contractDataKey('11'.repeat(32)))
    expect(a).not.toBe(b)
  })

  it('exposes the same contractId for every classification of one key', () => {
    const key = contractDataKey(contractHex)
    expect(classifyLedgerKey(key).contractId).toBe(contractHex)
    expect(
      classifyLedgerKey(xdr.LedgerKey.fromXDR(encodeLedgerKey(key), 'base64')).contractId,
    ).toBe(contractHex)
  })

  it('rejects a malformed identity instead of producing a key', () => {
    expect(() => xdr.LedgerKey.fromXDR('not-base64-xdr!!', 'base64')).toThrow()
  })
})

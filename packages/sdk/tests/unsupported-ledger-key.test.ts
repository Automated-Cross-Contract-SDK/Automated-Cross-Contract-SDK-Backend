import { describe, it, expect } from 'vitest'
import { xdr } from '@stellar/stellar-sdk'
import {
  classifyLedgerKey,
  classifyDeferredKeys,
  encodeLedgerKey,
  extractKeysFromFootprint,
} from '../src/footprint-parser.js'

// Account ledger keys are a valid XDR ledger entry type that the restore
// flow does not handle, so they exercise the unknown-discriminant path.
const accountKey = (seed: number) =>
  xdr.LedgerKey.account(
    new xdr.LedgerKeyAccount({
      accountId: xdr.PublicKey.publicKeyTypeEd25519(Buffer.alloc(32, seed)),
    }),
  )

const contractDataKey = (seed: number) =>
  xdr.LedgerKey.contractData(
    new xdr.LedgerKeyContractData({
      contract: xdr.ScAddress.scAddressTypeContract(Buffer.alloc(32, seed)),
      key: xdr.ScVal.scvSymbol('foo'),
      durability: xdr.ContractDataDurability.persistent(),
    }),
  )

describe('unsupported ledger-key discriminants (#532)', () => {
  it('classifies an unsupported entry type as unknown with the lowest priority', () => {
    const result = classifyLedgerKey(accountKey(1))

    expect(result.keyType).toBe('unknown')
    expect(result.restorePriority).toBe(3)
    expect(result.contractId).toBeUndefined()
    expect(result.sacKeyType).toBeUndefined()
  })

  it('keeps unknown keys distinct from supported keys in the classification output', () => {
    const supported = classifyLedgerKey(contractDataKey(2))
    const unsupported = classifyLedgerKey(accountKey(2))

    expect(supported.keyType).toBe('contractData')
    expect(unsupported.keyType).not.toBe(supported.keyType)
  })

  it('sorts unknown keys after every supported key when classifying a batch', () => {
    const deferred = [accountKey(3), contractDataKey(3)].map(key => ({
      key,
      keyBase64: encodeLedgerKey(key),
    }))

    const classified = classifyDeferredKeys(deferred)

    expect(classified.map(c => c.keyType)).toEqual(['contractData', 'unknown'])
  })

  it('preserves unknown keys in the footprint so callers can report them', () => {
    const footprint = new xdr.LedgerFootprint({
      readOnly: [accountKey(4)],
      readWrite: [contractDataKey(4)],
    })

    const keys = extractKeysFromFootprint(footprint)

    expect(keys.readOnly).toHaveLength(1)
    expect(keys.readWrite).toHaveLength(1)
    expect(keys.all).toHaveLength(2)
    expect(keys.all[0].switch()).toEqual(xdr.LedgerEntryType.account())
  })

  it('round-trips unknown keys through base64 encoding without changing their type', () => {
    const original = accountKey(5)
    const decoded = xdr.LedgerKey.fromXDR(encodeLedgerKey(original), 'base64')

    expect(decoded.switch()).toEqual(xdr.LedgerEntryType.account())
    expect(classifyLedgerKey(decoded).keyType).toBe('unknown')
  })
})

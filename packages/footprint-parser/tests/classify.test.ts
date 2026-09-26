import { describe, it, expect } from 'vitest'
import { xdr } from '@stellar/stellar-sdk'
import {
  classifyLedgerKey,
  encodeLedgerKey,
  extractKeysFromFootprint,
} from '../src/index.js'

const id = Buffer.alloc(32, 7)

const contractDataKey = (key: xdr.ScVal) =>
  xdr.LedgerKey.contractData(
    new xdr.LedgerKeyContractData({
      contract: xdr.ScAddress.scAddressTypeContract(id),
      key,
      durability: xdr.ContractDataDurability.persistent(),
    }),
  )

describe('classifyLedgerKey', () => {
  it('classifies contract instance keys with priority 0', () => {
    const r = classifyLedgerKey(contractDataKey(xdr.ScVal.scvLedgerKeyContractInstance()))
    expect(r.keyType).toBe('contractInstance')
    expect(r.restorePriority).toBe(0)
    expect(r.contractId).toBe(id.toString('hex'))
  })

  it('classifies contract data keys with priority 2', () => {
    const r = classifyLedgerKey(contractDataKey(xdr.ScVal.scvSymbol('foo')))
    expect(r.keyType).toBe('contractData')
    expect(r.restorePriority).toBe(2)
  })

  it('classifies contract code keys with priority 1', () => {
    const key = xdr.LedgerKey.contractCode(new xdr.LedgerKeyContractCode({ hash: id }))
    const r = classifyLedgerKey(key)
    expect(r).toEqual({ keyType: 'contractCode', contractId: id.toString('hex'), restorePriority: 1 })
  })

  it('classifies ttl keys with priority 3', () => {
    const key = xdr.LedgerKey.ttl(new xdr.LedgerKeyTtl({ keyHash: id }))
    expect(classifyLedgerKey(key)).toEqual({ keyType: 'ttlEntry', restorePriority: 3 })
  })

  it('classifies other entry types as unknown', () => {
    const key = xdr.LedgerKey.configSetting(
      new xdr.LedgerKeyConfigSetting({ configSettingId: xdr.ConfigSettingId.configSettingContractMaxSizeBytes() }),
    )
    expect(classifyLedgerKey(key)).toEqual({ keyType: 'unknown', restorePriority: 3 })
  })
})

describe('extractKeysFromFootprint / encodeLedgerKey', () => {
  it('splits read-only and read-write keys and combines them in `all`', () => {
    const ro = xdr.LedgerKey.contractCode(new xdr.LedgerKeyContractCode({ hash: id }))
    const rw = contractDataKey(xdr.ScVal.scvSymbol('a'))
    const fp = new xdr.LedgerFootprint({ readOnly: [ro], readWrite: [rw] })
    const r = extractKeysFromFootprint(fp)
    expect(r.readOnly).toHaveLength(1)
    expect(r.readWrite).toHaveLength(1)
    expect(r.all).toHaveLength(2)
  })

  it('encodes keys as base64 XDR', () => {
    const key = xdr.LedgerKey.ttl(new xdr.LedgerKeyTtl({ keyHash: id }))
    expect(encodeLedgerKey(key)).toBe(key.toXDR('base64'))
  })
})

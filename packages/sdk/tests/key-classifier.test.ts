import { describe, it, expect } from 'vitest'
import { classifyLedgerKey } from '../src/footprint-parser.js'
import { xdr } from '@stellar/stellar-sdk'

describe('classifyLedgerKey', () => {
  it('classifies liquidityPool entries correctly', () => {
    const key = xdr.LedgerKey.liquidityPool(
      new xdr.LedgerKeyLiquidityPool({ liquidityPoolId: Buffer.alloc(8) })
    )
    const result = classifyLedgerKey(key)
    expect(result.keyType).toBe('liquidityPool')
    expect(result.restorePriority).toBe(3)
    expect(result.contractId).toBeUndefined()
  })

  it('classifies claimableBalance entries correctly', () => {
    const key = xdr.LedgerKey.claimableBalance(
      new xdr.LedgerKeyClaimableBalance({ balanceId: xdr.ClaimableBalanceId.claimableBalanceIdTypeV0(Buffer.alloc(32)) })
    )
    const result = classifyLedgerKey(key)
    expect(result.keyType).toBe('claimableBalance')
    expect(result.restorePriority).toBe(3)
    expect(result.contractId).toBeUndefined()
  })

  it('classifies existing types without regression', () => {
    const contractDataKey = xdr.LedgerKey.contractData(
      new xdr.LedgerKeyContractData({
        contract: xdr.ScAddress.scAddressTypeContract(Buffer.from('cafebabe', 'hex')),
        key: xdr.ScVal.scvSymbol(Buffer.from('test')),
        durability: xdr.ContractDataDurability.persistent(),
      })
    )
    const contractDataResult = classifyLedgerKey(contractDataKey)
    expect(contractDataResult.keyType).toBe('contractData')
    expect(contractDataResult.restorePriority).toBe(2)

    const contractCodeKey = xdr.LedgerKey.contractCode(
      new xdr.LedgerKeyContractCode({ hash: Buffer.from('deadbeef', 'hex') })
    )
    const contractCodeResult = classifyLedgerKey(contractCodeKey)
    expect(contractCodeResult.keyType).toBe('contractCode')
    expect(contractCodeResult.restorePriority).toBe(1)

    const ttlKey = xdr.LedgerKey.ttl(new xdr.LedgerKeyTtl({ keyHash: Buffer.alloc(32) }))
    const ttlResult = classifyLedgerKey(ttlKey)
    expect(ttlResult.keyType).toBe('ttlEntry')
    expect(ttlResult.restorePriority).toBe(3)
  })

  it('falls back to unknown for unrecognized entry types', () => {
    const unknownKey = {
      switch: () => 'unknown',
    } as any
    const result = classifyLedgerKey(unknownKey)
    expect(result.keyType).toBe('unknown')
    expect(result.restorePriority).toBe(3)
  })
})

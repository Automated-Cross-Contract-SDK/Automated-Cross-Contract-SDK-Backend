import { describe, it, expect, vi, beforeEach } from 'vitest'
import { classifyDeferredKeys, DeferredArchivedKey } from '../src/footprint-parser.js'
import { xdr } from '@stellar/stellar-sdk'

describe('Restore priority configuration', () => {
  const mockLedgerKey = (type: xdr.LedgerEntryType.ContractData | xdr.LedgerEntryType.ContractCode | xdr.LedgerEntryType.Ttl): xdr.LedgerKey => {
    const key = xdr.LedgerKey.contractData(
      new xdr.LedgerKeyContractData({
        contract: xdr.ScAddress.contractId(Buffer.from('abc123', 'hex')),
        key: xdr.ScVal.scvSymbol(Buffer.from('test', 'utf8')),
        durability: xdr.ContractDataDurability.persistent(),
      })
    )
    return key
  }

  const createDeferredKey = (type: 'instance' | 'code' | 'data' | 'ttl'): DeferredArchivedKey => {
    let key: xdr.LedgerKey

    if (type === 'instance') {
      key = xdr.LedgerKey.contractData(
        new xdr.LedgerKeyContractData({
          contract: xdr.ScAddress.contractId(Buffer.from('abc123', 'hex')),
          key: xdr.ScVal.scvLedgerKeyContractInstance(
            new xdr.ScLedgerKeyContractInstance()
          ),
          durability: xdr.ContractDataDurability.persistent(),
        })
      )
    } else if (type === 'code') {
      key = xdr.LedgerKey.contractCode(
        new xdr.LedgerKeyContractCode({
          hash: Buffer.from('def456', 'hex'),
        })
      )
    } else if (type === 'data') {
      key = xdr.LedgerKey.contractData(
        new xdr.LedgerKeyContractData({
          contract: xdr.ScAddress.contractId(Buffer.from('abc123', 'hex')),
          key: xdr.ScVal.scvSymbol(Buffer.from('test', 'utf8')),
          durability: xdr.ContractDataDurability.persistent(),
        })
      )
    } else {
      key = xdr.LedgerKey.ttl(
        new xdr.LedgerKeyTtl({
          keyHash: Buffer.from('ghi789', 'hex'),
        })
      )
    }

    return {
      key,
      keyBase64: key.toXDR('base64'),
    }
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('default behavior', () => {
    it('maintains default priority when no override is provided', () => {
      const deferred = [
        createDeferredKey('data'),
        createDeferredKey('instance'),
        createDeferredKey('code'),
      ]

      const classified = classifyDeferredKeys(deferred)

      // Default: instance (0) < code (1) < data (2)
      expect(classified[0].keyType).toBe('contractInstance')
      expect(classified[0].restorePriority).toBe(0)
      expect(classified[1].keyType).toBe('contractCode')
      expect(classified[1].restorePriority).toBe(1)
      expect(classified[2].keyType).toBe('contractData')
      expect(classified[2].restorePriority).toBe(2)
    })

    it('preserves exact priority order for default case', () => {
      const deferred = [
        createDeferredKey('ttl'),
        createDeferredKey('data'),
        createDeferredKey('code'),
        createDeferredKey('instance'),
      ]

      const classified = classifyDeferredKeys(deferred)

      // Should be sorted: instance (0), code (1), data (2), ttl (3)
      expect(classified.map(k => k.restorePriority)).toEqual([0, 1, 2, 3])
      expect(classified.map(k => k.keyType)).toEqual([
        'contractInstance',
        'contractCode',
        'contractData',
        'ttlEntry',
      ])
    })
  })

  describe('full custom priority override', () => {
    it('applies full custom priority ordering', () => {
      const deferred = [
        createDeferredKey('data'),
        createDeferredKey('instance'),
        createDeferredKey('code'),
      ]

      const customPriority = {
        contractData: 0,
        contractCode: 1,
        contractInstance: 2,
      }

      const classified = classifyDeferredKeys(deferred, customPriority)

      // Custom: data (0) < code (1) < instance (2)
      expect(classified[0].keyType).toBe('contractData')
      expect(classified[0].restorePriority).toBe(0)
      expect(classified[1].keyType).toBe('contractCode')
      expect(classified[1].restorePriority).toBe(1)
      expect(classified[2].keyType).toBe('contractInstance')
      expect(classified[2].restorePriority).toBe(2)
    })

    it('sorts correctly with custom priorities', () => {
      const deferred = [
        createDeferredKey('instance'),
        createDeferredKey('data'),
        createDeferredKey('code'),
      ]

      const customPriority = {
        ttlEntry: 0,
        contractCode: 1,
        contractData: 2,
        contractInstance: 3,
      }

      const classified = classifyDeferredKeys(deferred, customPriority)

      // Should be sorted by custom priority
      expect(classified.map(k => k.restorePriority)).toEqual([1, 2, 3])
      expect(classified.map(k => k.keyType)).toEqual([
        'contractCode',
        'contractData',
        'contractInstance',
      ])
    })
  })

  describe('partial custom priority override', () => {
    it('falls back to default for uncovered key types', () => {
      const deferred = [
        createDeferredKey('data'),
        createDeferredKey('instance'),
        createDeferredKey('code'),
        createDeferredKey('ttl'),
      ]

      const partialPriority = {
        contractData: 0,
        contractCode: 1,
        // contractInstance not overridden, should use default (0)
        // ttlEntry not overridden, should use default (3)
      }

      const classified = classifyDeferredKeys(deferred, partialPriority)

      // data (0), code (1), then contractInstance (default 0) and ttl (default 3)
      // After sorting: data (0), contractInstance (0), code (1), ttl (3)
      // Since data and contractInstance both have priority 0, their relative order depends on stability
      expect(classified.map(k => k.restorePriority)).toEqual([0, 0, 1, 3])
      // The two priority-0 items should be present
      const priority0Keys = classified.filter(k => k.restorePriority === 0).map(k => k.keyType)
      expect(priority0Keys).toContain('contractData')
      expect(priority0Keys).toContain('contractInstance')
    })

    it('handles overriding some types while others use defaults', () => {
      const deferred = [
        createDeferredKey('instance'),
        createDeferredKey('code'),
        createDeferredKey('data'),
      ]

      const partialPriority = {
        contractCode: 10,
        // instance and data use defaults: instance (0), data (2)
      }

      const classified = classifyDeferredKeys(deferred, partialPriority)

      // After sorting: instance (0), data (2), code (10)
      expect(classified.map(k => k.keyType)).toEqual([
        'contractInstance',
        'contractData',
        'contractCode',
      ])
      expect(classified.map(k => k.restorePriority)).toEqual([0, 2, 10])
    })
  })

  describe('priority value constraints', () => {
    it('correctly handles all priority values (0-3)', () => {
      const deferred = [
        createDeferredKey('data'),
        createDeferredKey('code'),
        createDeferredKey('instance'),
        createDeferredKey('ttl'),
      ]

      const customPriority = {
        ttlEntry: 0,
        contractInstance: 1,
        contractCode: 2,
        contractData: 3,
      }

      const classified = classifyDeferredKeys(deferred, customPriority)

      expect(classified.map(k => k.restorePriority)).toEqual([0, 1, 2, 3])
      expect(classified.map(k => k.keyType)).toEqual([
        'ttlEntry',
        'contractInstance',
        'contractCode',
        'contractData',
      ])
    })
  })

  describe('empty deferred keys', () => {
    it('handles empty deferred array', () => {
      const deferred: DeferredArchivedKey[] = []
      const customPriority = {
        contractData: 0,
        contractCode: 1,
      }

      const classified = classifyDeferredKeys(deferred, customPriority)
      expect(classified).toEqual([])
    })
  })
})

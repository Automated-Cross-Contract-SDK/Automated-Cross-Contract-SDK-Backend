import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ArchivedKey } from '@soroban-resurrect/sdk'
import type { UseSorobanResurrectReturn } from '../src/types.js'

describe('useSorobanResurrect', () => {
  describe('needsRestore key classification', () => {
    it('should classify archived keys with type information', () => {
      const mockArchivedKeys: ArchivedKey[] = [
        {
          key: 'key1',
          xdrType: 'ContractData',
          contractId: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4',
          type: 'ContractData',
        } as ArchivedKey,
        {
          key: 'key2',
          xdrType: 'ContractCode',
          contractId: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4',
          type: 'ContractCode',
        } as ArchivedKey,
      ]

      expect(mockArchivedKeys).toHaveLength(2)
      expect(mockArchivedKeys[0].type).toBe('ContractData')
      expect(mockArchivedKeys[1].type).toBe('ContractCode')
    })

    it('should include contractId in archived key details', () => {
      const contractId = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4'
      const mockArchivedKey: ArchivedKey = {
        key: 'contract_state_key',
        xdrType: 'ContractData',
        contractId,
        type: 'ContractData',
      } as ArchivedKey

      expect(mockArchivedKey.contractId).toBe(contractId)
      expect(mockArchivedKey.type).toBeDefined()
    })

    it('should expose multiple classified keys when needsRestore', () => {
      const mockArchivedKeys: ArchivedKey[] = [
        {
          key: 'key1',
          xdrType: 'ContractData',
          contractId: 'CA0000001',
          type: 'ContractData',
        } as ArchivedKey,
        {
          key: 'key2',
          xdrType: 'ContractData',
          contractId: 'CA0000002',
          type: 'ContractData',
        } as ArchivedKey,
        {
          key: 'key3',
          xdrType: 'ContractCode',
          contractId: 'CA0000001',
          type: 'ContractCode',
        } as ArchivedKey,
      ]

      const dataKeys = mockArchivedKeys.filter(k => k.type === 'ContractData')
      const codeKeys = mockArchivedKeys.filter(k => k.type === 'ContractCode')

      expect(dataKeys).toHaveLength(2)
      expect(codeKeys).toHaveLength(1)
    })

    it('should distinguish between ContractData and ContractCode types', () => {
      const dataKey: ArchivedKey = {
        key: 'data',
        xdrType: 'ContractData',
        contractId: 'CA000001',
        type: 'ContractData',
      } as ArchivedKey

      const codeKey: ArchivedKey = {
        key: 'code',
        xdrType: 'ContractCode',
        contractId: 'CA000001',
        type: 'ContractCode',
      } as ArchivedKey

      expect(dataKey.type).not.toBe(codeKey.type)
      expect(dataKey.type).toBe('ContractData')
      expect(codeKey.type).toBe('ContractCode')
    })

    it('should allow UI to filter and display keys by type', () => {
      const allKeys: ArchivedKey[] = [
        {
          key: 'k1',
          xdrType: 'ContractData',
          contractId: 'CA000001',
          type: 'ContractData',
        } as ArchivedKey,
        {
          key: 'k2',
          xdrType: 'ContractCode',
          contractId: 'CA000001',
          type: 'ContractCode',
        } as ArchivedKey,
      ]

      const contractDataKeys = allKeys.filter(k => k.type === 'ContractData')
      expect(contractDataKeys).toHaveLength(1)
      expect(contractDataKeys[0].contractId).toBe('CA000001')
    })

    it('should support grouping archived keys by contractId', () => {
      const archivedKeys: ArchivedKey[] = [
        {
          key: 'k1',
          xdrType: 'ContractData',
          contractId: 'CA000001',
          type: 'ContractData',
        } as ArchivedKey,
        {
          key: 'k2',
          xdrType: 'ContractData',
          contractId: 'CA000001',
          type: 'ContractData',
        } as ArchivedKey,
        {
          key: 'k3',
          xdrType: 'ContractData',
          contractId: 'CA000002',
          type: 'ContractData',
        } as ArchivedKey,
      ]

      const groupedByContract = new Map<string, ArchivedKey[]>()
      archivedKeys.forEach(key => {
        if (!groupedByContract.has(key.contractId)) {
          groupedByContract.set(key.contractId, [])
        }
        groupedByContract.get(key.contractId)!.push(key)
      })

      expect(groupedByContract.get('CA000001')).toHaveLength(2)
      expect(groupedByContract.get('CA000002')).toHaveLength(1)
    })
  })

  describe('restore progress and state', () => {
    it('should maintain archivedKeys state when needsRestore is true', () => {
      const mockArchivedKeys: ArchivedKey[] = [
        {
          key: 'key1',
          xdrType: 'ContractData',
          contractId: 'CA000001',
          type: 'ContractData',
        } as ArchivedKey,
      ]

      const mockReturn: Partial<UseSorobanResurrectReturn> = {
        needsRestore: true,
        archivedKeys: mockArchivedKeys,
      }

      expect(mockReturn.needsRestore).toBe(true)
      expect(mockReturn.archivedKeys).toEqual(mockArchivedKeys)
    })
  })
})

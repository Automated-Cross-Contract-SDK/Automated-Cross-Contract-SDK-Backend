import { describe, it } from 'vitest'
import fc from 'fast-check'
import { createBatches, batchKeysByContract, groupKeysByPriority } from '@soroban-resurrect/utils'
import type { ArchivedKey } from '@soroban-resurrect/types'

// Arbitraries for property-based testing
const keyArb = fc.object({
  contractId: fc.hexaString({ minLength: 8, maxLength: 64 }),
  keyBase64: fc.base64String({ minLength: 10, maxLength: 100 }),
  keyType: fc.constantFrom('contractData', 'contractCode', 'contractState'),
  restorePriority: fc.integer({ min: 0, max: 10 }),
}).map(obj => ({
  ...obj,
  key: {} as any,
})) as any as fc.Arbitrary<ArchivedKey>

const keysArb = fc.array(keyArb, { minLength: 1, maxLength: 500 })
const batchSizeArb = fc.integer({ min: 1, max: 100 })

describe('Batching Property-Based Tests', () => {
  describe('createBatches invariants', () => {
    it('should never exceed maxBatchSize', () => {
      fc.assert(
        fc.property(keysArb, batchSizeArb, (keys, maxBatchSize) => {
          const batches = createBatches(keys, { maxBatchSize })
          return batches.every(batch => batch.length <= maxBatchSize)
        }),
        { numRuns: 100 },
      )
    })

    it('should preserve all keys without duplication', () => {
      fc.assert(
        fc.property(keysArb, batchSizeArb, (keys, maxBatchSize) => {
          const batches = createBatches(keys, { maxBatchSize })
          const flattenedKeys = batches.flat()

          // Count occurrences of each key
          const keyMap = new Map<string, number>()
          for (const key of keys) {
            const keyId = key.keyBase64
            keyMap.set(keyId, (keyMap.get(keyId) ?? 0) + 1)
          }

          const flatMap = new Map<string, number>()
          for (const key of flattenedKeys) {
            const keyId = key.keyBase64
            flatMap.set(keyId, (flatMap.get(keyId) ?? 0) + 1)
          }

          // Both maps should be identical
          if (keyMap.size !== flatMap.size) {
            return false
          }

          for (const [keyId, count] of keyMap) {
            if (flatMap.get(keyId) !== count) {
              return false
            }
          }

          return true
        }),
        { numRuns: 100 },
      )
    })

    it('should never lose keys during batching', () => {
      fc.assert(
        fc.property(keysArb, batchSizeArb, (keys, maxBatchSize) => {
          const batches = createBatches(keys, { maxBatchSize })
          const flattenedKeys = batches.flat()

          return flattenedKeys.length === keys.length
        }),
        { numRuns: 100 },
      )
    })

    it('should partition keys into minimum number of batches', () => {
      fc.assert(
        fc.property(keysArb, batchSizeArb, (keys, maxBatchSize) => {
          const batches = createBatches(keys, { maxBatchSize })
          const minBatchesNeeded = Math.ceil(keys.length / maxBatchSize)

          return batches.length === minBatchesNeeded
        }),
        { numRuns: 100 },
      )
    })

    it('should respect priority order within batches', () => {
      fc.assert(
        fc.property(keysArb, batchSizeArb, (keys, maxBatchSize) => {
          const batches = createBatches(keys, { maxBatchSize })

          // Verify each batch has increasing or same priority
          for (const batch of batches) {
            for (let i = 1; i < batch.length; i++) {
              if (batch[i].restorePriority < batch[i - 1].restorePriority) {
                return false
              }
            }
          }

          // Verify batches are prioritized
          for (let i = 1; i < batches.length; i++) {
            const lastOfPrev = batches[i - 1][batches[i - 1].length - 1]
            const firstOfCurr = batches[i][0]
            if (firstOfCurr.restorePriority < lastOfPrev.restorePriority) {
              return false
            }
          }

          return true
        }),
        { numRuns: 100 },
      )
    })

    it('should handle edge case of single key', () => {
      fc.assert(
        fc.property(keyArb, batchSizeArb, (key, maxBatchSize) => {
          const batches = createBatches([key], { maxBatchSize })
          return batches.length === 1 && batches[0].length === 1 && batches[0][0].keyBase64 === key.keyBase64
        }),
        { numRuns: 100 },
      )
    })

    it('should handle exact batch size multiples', () => {
      fc.assert(
        fc.property(batchSizeArb, (batchSize) => {
          const keys = Array.from({ length: batchSize * 3 }, (_, i) => ({
            key: {} as any,
            contractId: 'contract-' + i,
            keyBase64: 'key-' + i,
            keyType: 'contractData' as const,
            restorePriority: 0,
          }))

          const batches = createBatches(keys, { maxBatchSize: batchSize })

          return (
            batches.length === 3 &&
            batches.every(b => b.length === batchSize)
          )
        }),
        { numRuns: 100 },
      )
    })
  })

  describe('batchKeysByContract invariants', () => {
    it('should group all keys by their contractId', () => {
      fc.assert(
        fc.property(keysArb, (keys) => {
          const groups = batchKeysByContract(keys)
          const flattenedKeys = groups.flatMap(g => g.keys)

          return flattenedKeys.length === keys.length
        }),
        { numRuns: 100 },
      )
    })

    it('should never duplicate keys when grouping by contract', () => {
      fc.assert(
        fc.property(keysArb, (keys) => {
          const groups = batchKeysByContract(keys)
          const flattenedKeys = groups.flatMap(g => g.keys)

          // Count original keys
          const originalCount = new Map<string, number>()
          for (const key of keys) {
            const id = key.keyBase64
            originalCount.set(id, (originalCount.get(id) ?? 0) + 1)
          }

          // Count grouped keys
          const groupedCount = new Map<string, number>()
          for (const key of flattenedKeys) {
            const id = key.keyBase64
            groupedCount.set(id, (groupedCount.get(id) ?? 0) + 1)
          }

          // Compare
          if (originalCount.size !== groupedCount.size) {
            return false
          }

          for (const [id, count] of originalCount) {
            if (groupedCount.get(id) !== count) {
              return false
            }
          }

          return true
        }),
        { numRuns: 100 },
      )
    })

    it('should have one group per unique contractId', () => {
      fc.assert(
        fc.property(keysArb, (keys) => {
          const groups = batchKeysByContract(keys)

          // Count unique contractIds in original keys
          const uniqueContracts = new Set(keys.map(k => k.contractId || '__unknown__'))

          return groups.length === uniqueContracts.size
        }),
        { numRuns: 100 },
      )
    })

    it('should place keys in correct contract groups', () => {
      fc.assert(
        fc.property(keysArb, (keys) => {
          const groups = batchKeysByContract(keys)

          for (const group of groups) {
            for (const key of group.keys) {
              if ((key.contractId || '__unknown__') !== group.contractId) {
                return false
              }
            }
          }

          return true
        }),
        { numRuns: 100 },
      )
    })
  })

  describe('groupKeysByPriority invariants', () => {
    it('should group keys by restorePriority', () => {
      fc.assert(
        fc.property(keysArb, (keys) => {
          const groups = groupKeysByPriority(keys)
          const flattenedKeys = Array.from(groups.values()).flat()

          return flattenedKeys.length === keys.length
        }),
        { numRuns: 100 },
      )
    })

    it('should have one group per unique priority', () => {
      fc.assert(
        fc.property(keysArb, (keys) => {
          const groups = groupKeysByPriority(keys)

          // Count unique priorities in original keys
          const uniquePriorities = new Set(keys.map(k => k.restorePriority))

          return groups.size === uniquePriorities.size
        }),
        { numRuns: 100 },
      )
    })

    it('should place keys in correct priority groups', () => {
      fc.assert(
        fc.property(keysArb, (keys) => {
          const groups = groupKeysByPriority(keys)

          for (const [priority, groupKeys] of groups) {
            for (const key of groupKeys) {
              if (key.restorePriority !== priority) {
                return false
              }
            }
          }

          return true
        }),
        { numRuns: 100 },
      )
    })

    it('should never lose keys when grouping by priority', () => {
      fc.assert(
        fc.property(keysArb, (keys) => {
          const groups = groupKeysByPriority(keys)
          const totalGroupedKeys = Array.from(groups.values()).reduce((sum, g) => sum + g.length, 0)

          return totalGroupedKeys === keys.length
        }),
        { numRuns: 100 },
      )
    })
  })

  describe('Combined batching operations', () => {
    it('batching then grouping should preserve all keys', () => {
      fc.assert(
        fc.property(keysArb, batchSizeArb, (keys, maxBatchSize) => {
          const batches = createBatches(keys, { maxBatchSize })
          const flatBatches = batches.flat()

          const groups = groupKeysByPriority(flatBatches)
          const totalGrouped = Array.from(groups.values()).reduce((sum, g) => sum + g.length, 0)

          return totalGrouped === keys.length
        }),
        { numRuns: 100 },
      )
    })

    it('grouping then batching should maintain invariants', () => {
      fc.assert(
        fc.property(keysArb, batchSizeArb, (keys, maxBatchSize) => {
          const groups = groupKeysByPriority(keys)
          const allGroupedKeys = Array.from(groups.values()).flat()
          const batches = createBatches(allGroupedKeys, { maxBatchSize })

          // All invariants should hold
          const noOversizeBatches = batches.every(b => b.length <= maxBatchSize)
          const allKeysPresent = batches.flat().length === keys.length
          const noNegativeBatches = batches.length > 0

          return noOversizeBatches && allKeysPresent && noNegativeBatches
        }),
        { numRuns: 100 },
      )
    })

    it('contract grouping should not affect key counts', () => {
      fc.assert(
        fc.property(keysArb, batchSizeArb, (keys, maxBatchSize) => {
          const contractGroups = batchKeysByContract(keys)
          const contractFlat = contractGroups.flatMap(g => g.keys)

          const batches = createBatches(contractFlat, { maxBatchSize })
          const batchFlat = batches.flat()

          return batchFlat.length === keys.length && batchFlat.length === contractFlat.length
        }),
        { numRuns: 100 },
      )
    })
  })

  describe('Batching edge cases', () => {
    it('should handle batch size of 1', () => {
      fc.assert(
        fc.property(keysArb, (keys) => {
          const batches = createBatches(keys, { maxBatchSize: 1 })

          return (
            batches.length === keys.length &&
            batches.every(b => b.length === 1)
          )
        }),
        { numRuns: 100 },
      )
    })

    it('should handle very large batch sizes', () => {
      fc.assert(
        fc.property(keysArb, (keys) => {
          const largeSize = 10000
          const batches = createBatches(keys, { maxBatchSize: largeSize })

          return (
            batches.length === 1 &&
            batches[0].length === keys.length
          )
        }),
        { numRuns: 100 },
      )
    })

    it('should handle undefined batch size gracefully', () => {
      fc.assert(
        fc.property(keysArb, (keys) => {
          const batches = createBatches(keys)

          return batches.flat().length === keys.length
        }),
        { numRuns: 100 },
      )
    })
  })
})

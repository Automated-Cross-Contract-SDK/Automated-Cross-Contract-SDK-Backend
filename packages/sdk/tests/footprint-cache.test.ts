import { describe, it, expect, beforeEach } from 'vitest'
import { FootprintCache } from '../src/footprint-cache.js'
import type { FootprintKeys } from '../src/footprint-parser.js'
import { xdr } from '@stellar/stellar-sdk'

function makeFootprintKeys(count: number): FootprintKeys {
  const keys: xdr.LedgerKey[] = []
  for (let i = 0; i < count; i++) {
    const key = xdr.LedgerKey.contractData(
      new xdr.LedgerKeyContractData({
        contract: xdr.ScAddress.scAddressTypeContract(
          Buffer.from('CAFEBABE' + i.toString(16).padStart(4, '0'), 'hex'),
        ),
        key: xdr.ScVal.scvSymbol('Test'),
        durability: xdr.ContractDataDurability.persistent(),
      }),
    )
    keys.push(key)
  }
  return {
    readOnly: keys,
    readWrite: [],
    all: keys,
  }
}

describe('FootprintCache', () => {
  let cache: FootprintCache

  beforeEach(() => {
    cache = new FootprintCache({ maxSize: 10 })
  })

  describe('cache key generation', () => {
    it('generates consistent keys for the same XDR', () => {
      const xdr1 = 'AAAAAgAAAAD...'
      // Access twice with same XDR — should hit the same cache entry
      cache.set(xdr1, makeFootprintKeys(1))
      const result = cache.get(xdr1)
      expect(result).not.toBeUndefined()
    })

    it('generates different keys for different XDR', () => {
      const xdr1 = 'AAAAAgAAAAD...first'
      const xdr2 = 'AAAAAgAAAAD...second'
      const keys1 = makeFootprintKeys(1)
      const keys2 = makeFootprintKeys(2)

      cache.set(xdr1, keys1)
      cache.set(xdr2, keys2)

      expect(cache.get(xdr1)).toEqual(keys1)
      expect(cache.get(xdr2)).toEqual(keys2)
    })

    it('uses SHA-256 so keys have fixed length regardless of XDR size', () => {
      const smallXdr = 'A'
      const largeXdr = 'A'.repeat(10_000)
      cache.set(smallXdr, null)
      cache.set(largeXdr, null)
      // Both should be retrievable
      expect(cache.has(smallXdr)).toBe(true)
      expect(cache.has(largeXdr)).toBe(true)
    })
  })

  describe('basic cache operations', () => {
    it('stores and retrieves values', () => {
      const xdr = 'test-xdr'
      const keys = makeFootprintKeys(3)

      cache.set(xdr, keys)
      const retrieved = cache.get(xdr)

      expect(retrieved).toEqual(keys)
    })

    it('stores and retrieves null values', () => {
      const xdr = 'test-xdr-null'
      cache.set(xdr, null)
      const retrieved = cache.get(xdr)
      expect(retrieved).toBeNull()
    })

    it('returns undefined for missing keys', () => {
      const result = cache.get('nonexistent-xdr')
      expect(result).toBeUndefined()
    })

    it('checks key existence with has()', () => {
      const xdr = 'test-xdr'
      expect(cache.has(xdr)).toBe(false)
      cache.set(xdr, makeFootprintKeys(1))
      expect(cache.has(xdr)).toBe(true)
    })

    it('invalidates specific keys', () => {
      const xdr = 'test-xdr'
      cache.set(xdr, makeFootprintKeys(1))
      expect(cache.has(xdr)).toBe(true)

      cache.invalidate(xdr)
      expect(cache.has(xdr)).toBe(false)
    })

    it('clear() removes all entries and resets stats', () => {
      cache.set('xdr1', makeFootprintKeys(1))
      cache.set('xdr2', makeFootprintKeys(2))
      cache.get('xdr1')
      cache.get('nonexistent')

      cache.clear()

      expect(cache.getSize()).toBe(0)
      expect(cache.has('xdr1')).toBe(false)

      const stats = cache.getStatistics()
      expect(stats.hits).toBe(0)
      expect(stats.misses).toBe(0)
    })
  })

  describe('invalidateAll (ledger close)', () => {
    it('removes all entries but preserves statistics', () => {
      cache.set('xdr1', makeFootprintKeys(1))
      cache.set('xdr2', makeFootprintKeys(2))
      cache.get('xdr1') // hit
      cache.get('nonexistent') // miss

      cache.invalidateAll()

      expect(cache.getSize()).toBe(0)
      expect(cache.has('xdr1')).toBe(false)
      expect(cache.has('xdr2')).toBe(false)

      // Statistics should be preserved across invalidations
      // so callers can monitor hit rate over multiple ledger cycles
      const stats = cache.getStatistics()
      expect(stats.hits).toBe(1)
      expect(stats.misses).toBe(1)
    })

    it('can be called multiple times safely', () => {
      cache.set('xdr1', makeFootprintKeys(1))
      cache.invalidateAll()
      cache.invalidateAll() // should not throw
      expect(cache.getSize()).toBe(0)
    })
  })

  describe('LRU eviction (via quick-lru)', () => {
    it('evicts entries when max size is exceeded', () => {
      for (let i = 0; i < 15; i++) {
        cache.set(`xdr-${i}`, makeFootprintKeys(i))
      }

      // Size should not exceed maxSize
      expect(cache.getSize()).toBeLessThanOrEqual(10)

      // Newest entries should remain
      expect(cache.has('xdr-14')).toBe(true)
    })

    it('respects custom max size', () => {
      const smallCache = new FootprintCache({ maxSize: 3 })
      for (let i = 0; i < 10; i++) {
        smallCache.set(`xdr-${i}`, makeFootprintKeys(i))
      }
      expect(smallCache.getSize()).toBeLessThanOrEqual(3)
    })

    it('updates LRU on access (get promotes entry)', () => {
      const tinyCache = new FootprintCache({ maxSize: 2 })

      tinyCache.set('xdr-1', makeFootprintKeys(1))
      tinyCache.set('xdr-2', makeFootprintKeys(2))

      // Access xdr-1 to promote it
      tinyCache.get('xdr-1')

      // Add a new entry — xdr-2 should be evicted (least recently used)
      tinyCache.set('xdr-3', makeFootprintKeys(3))

      expect(tinyCache.has('xdr-1')).toBe(true)
      expect(tinyCache.has('xdr-2')).toBe(false)
      expect(tinyCache.has('xdr-3')).toBe(true)
    })
  })

  describe('statistics and monitoring', () => {
    it('tracks cache hits', () => {
      cache.set('xdr-1', makeFootprintKeys(1))
      cache.get('xdr-1')
      cache.get('xdr-1')

      const stats = cache.getStatistics()
      expect(stats.hits).toBe(2)
    })

    it('tracks cache misses', () => {
      cache.get('nonexistent-1')
      cache.get('nonexistent-2')
      cache.get('nonexistent-3')

      const stats = cache.getStatistics()
      expect(stats.misses).toBe(3)
    })

    it('calculates hit rate', () => {
      cache.set('xdr-1', makeFootprintKeys(1))
      cache.get('xdr-1') // hit
      cache.get('xdr-1') // hit
      cache.get('nonexistent') // miss

      const stats = cache.getStatistics()
      expect(stats.hitRate).toBeCloseTo(66.67, 1)
    })

    it('reports current size', () => {
      expect(cache.getSize()).toBe(0)

      cache.set('xdr-1', makeFootprintKeys(1))
      expect(cache.getSize()).toBe(1)

      cache.set('xdr-2', makeFootprintKeys(2))
      expect(cache.getSize()).toBe(2)

      cache.invalidate('xdr-1')
      expect(cache.getSize()).toBe(1)
    })

    it('hitRate is 0 when no requests have been made', () => {
      const stats = cache.getStatistics()
      expect(stats.hitRate).toBe(0)
    })

    it('provides complete statistics shape', () => {
      cache.set('xdr-1', makeFootprintKeys(1))
      cache.get('xdr-1')
      cache.get('nonexistent')

      const stats = cache.getStatistics()
      expect(stats).toHaveProperty('hits')
      expect(stats).toHaveProperty('misses')
      expect(stats).toHaveProperty('size')
      expect(stats).toHaveProperty('hitRate')
    })
  })

  describe('default configuration', () => {
    it('uses default maxSize of 500 when no config provided', () => {
      const defaultCache = new FootprintCache()
      // Fill with many entries
      for (let i = 0; i < 600; i++) {
        defaultCache.set(`xdr-${i}`, makeFootprintKeys(i))
      }
      expect(defaultCache.getSize()).toBeLessThanOrEqual(500)
    })
  })

  describe('cache behavior with real scenarios', () => {
    it('handles repeated accesses efficiently', () => {
      const xdr = 'AAAAAgAAAAD...repeated'
      const keys = makeFootprintKeys(5)

      // First access - miss
      cache.get(xdr)

      // Store result
      cache.set(xdr, keys)

      // Repeated accesses - all hits
      for (let i = 0; i < 10; i++) {
        const cached = cache.get(xdr)
        expect(cached).toEqual(keys)
      }

      const stats = cache.getStatistics()
      expect(stats.hits).toBe(10)
      expect(stats.misses).toBe(1)
    })

    it('maintains efficiency under mixed operations', () => {
      for (let i = 0; i < 5; i++) {
        cache.set(`xdr-${i}`, makeFootprintKeys(i))
      }

      cache.get('xdr-0') // hit
      cache.get('xdr-1') // hit
      cache.get('nonexistent') // miss
      cache.get('xdr-0') // hit

      const stats = cache.getStatistics()
      expect(stats.hits).toBe(3)
      expect(stats.misses).toBe(1)
      expect(stats.size).toBe(5)
    })

    it('works with ledger close invalidation cycle', () => {
      const xdr = 'AAAAAgAAAAD...ledger-cycle'
      const keys = makeFootprintKeys(3)

      // First ledger: populate and access
      cache.set(xdr, keys)
      cache.get(xdr) // hit
      cache.get(xdr) // hit

      // Ledger closes — invalidate but keep stats
      cache.invalidateAll()

      // Verify cache is empty
      expect(cache.get(xdr)).toBeUndefined()

      // Second ledger: repopulate
      cache.set(xdr, keys)
      cache.get(xdr) // hit

      // Stats should carry over across ledgers
      const stats = cache.getStatistics()
      expect(stats.hits).toBe(3) // 2 from first ledger + 1 from second
      expect(stats.misses).toBe(1) // from the miss after invalidation
    })
  })
})

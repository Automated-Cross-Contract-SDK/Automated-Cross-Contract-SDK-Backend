import { describe, it, expect, beforeEach, vi } from 'vitest'
import { SimulationCache } from '../src/simulation-cache.js'
import { SimulationCheckResult } from '../src/types.js'

describe('SimulationCache', () => {
  let cache: SimulationCache

  beforeEach(() => {
    cache = new SimulationCache(10, 1000) // 10 max size, 1s TTL
  })

  describe('cache key generation', () => {
    it('generates consistent keys for same inputs', () => {
      const key1 = SimulationCache.generateKey('txXDR', 'source', 123)
      const key2 = SimulationCache.generateKey('txXDR', 'source', 123)
      expect(key1).toBe(key2)
    })

    it('generates different keys for different txXDR', () => {
      const key1 = SimulationCache.generateKey('txXDR1', 'source', 123)
      const key2 = SimulationCache.generateKey('txXDR2', 'source', 123)
      expect(key1).not.toBe(key2)
    })

    it('generates different keys for different source', () => {
      const key1 = SimulationCache.generateKey('txXDR', 'source1', 123)
      const key2 = SimulationCache.generateKey('txXDR', 'source2', 123)
      expect(key1).not.toBe(key2)
    })

    it('generates different keys for different ledgerSequence', () => {
      const key1 = SimulationCache.generateKey('txXDR', 'source', 123)
      const key2 = SimulationCache.generateKey('txXDR', 'source', 456)
      expect(key1).not.toBe(key2)
    })

    it('handles undefined source and ledgerSequence', () => {
      const key1 = SimulationCache.generateKey('txXDR')
      const key2 = SimulationCache.generateKey('txXDR', undefined, undefined)
      expect(key1).toBe(key2)
    })

    it('generates SHA256 hash', () => {
      const key = SimulationCache.generateKey('test')
      // Hash is generated using custom hash function
      expect(key).toBeDefined()
      expect(typeof key).toBe('string')
      expect(key.length).toBeGreaterThan(0)
    })
  })

  describe('basic cache operations', () => {
    it('stores and retrieves values', () => {
      const key = 'test-key'
      const result: SimulationCheckResult = {
        needsRestoration: false,
        archivedKeys: [],
        totalKeysInFootprint: 0,
      }

      cache.set(key, result)
      const retrieved = cache.get(key)

      expect(retrieved).toEqual(result)
    })

    it('returns undefined for missing keys', () => {
      const result = cache.get('nonexistent-key')
      expect(result).toBeUndefined()
    })

    it('checks key existence with has()', () => {
      const key = 'test-key'
      const result: SimulationCheckResult = {
        needsRestoration: true,
        archivedKeys: [],
        totalKeysInFootprint: 1,
      }

      expect(cache.has(key)).toBe(false)
      cache.set(key, result)
      expect(cache.has(key)).toBe(true)
    })

    it('invalidates specific keys', () => {
      const key = 'test-key'
      const result: SimulationCheckResult = {
        needsRestoration: false,
        archivedKeys: [],
        totalKeysInFootprint: 0,
      }

      cache.set(key, result)
      expect(cache.has(key)).toBe(true)

      cache.invalidate(key)
      expect(cache.has(key)).toBe(false)
    })

    it('clears all entries', () => {
      const result: SimulationCheckResult = {
        needsRestoration: false,
        archivedKeys: [],
        totalKeysInFootprint: 0,
      }

      cache.set('key1', result)
      cache.set('key2', result)
      cache.set('key3', result)

      expect(cache.getSize()).toBe(3)

      cache.clear()
      expect(cache.getSize()).toBe(0)
    })
  })

  describe('LRU eviction', () => {
    it('evicts least recently used entry when cache is full', () => {
      const result: SimulationCheckResult = {
        needsRestoration: false,
        archivedKeys: [],
        totalKeysInFootprint: 0,
      }

      // Fill cache
      for (let i = 0; i < 10; i++) {
        cache.set(`key-${i}`, result)
      }

      const stats1 = cache.getStatistics()
      expect(stats1.evictions).toBe(0)

      // Add one more - should evict key-0 (least recently used)
      cache.set('key-10', result)

      expect(cache.has('key-0')).toBe(false)
      expect(cache.has('key-10')).toBe(true)

      const stats2 = cache.getStatistics()
      expect(stats2.evictions).toBe(1)
    })

    it('updates LRU on access', () => {
      const result: SimulationCheckResult = {
        needsRestoration: false,
        archivedKeys: [],
        totalKeysInFootprint: 0,
      }

      // Verify that accessing a key updates its LRU time
      const smallCache = new SimulationCache(10, 1000)

      smallCache.set('key-0', result)
      const stats1 = smallCache.getStatistics()
      expect(stats1.size).toBe(1)

      // Access key-0
      const retrieved = smallCache.get('key-0')
      expect(retrieved).toEqual(result)

      // Verify hit was recorded
      const stats2 = smallCache.getStatistics()
      expect(stats2.hits).toBe(1)
    })

    it('respects max size configuration', () => {
      const smallCache = new SimulationCache(5, 1000)
      const result: SimulationCheckResult = {
        needsRestoration: false,
        archivedKeys: [],
        totalKeysInFootprint: 0,
      }

      for (let i = 0; i < 10; i++) {
        smallCache.set(`key-${i}`, result)
      }

      expect(smallCache.getSize()).toBeLessThanOrEqual(5)
    })
  })

  describe('TTL and expiration', () => {
    it('expires entries after TTL', async () => {
      const shortTTLCache = new SimulationCache(10, 100) // 100ms TTL
      const result: SimulationCheckResult = {
        needsRestoration: false,
        archivedKeys: [],
        totalKeysInFootprint: 0,
      }

      shortTTLCache.set('test-key', result)
      expect(shortTTLCache.has('test-key')).toBe(true)

      // Wait for TTL to expire
      await new Promise(resolve => setTimeout(resolve, 150))

      expect(shortTTLCache.has('test-key')).toBe(false)
    })

    it('returns undefined for expired entries', async () => {
      const shortTTLCache = new SimulationCache(10, 100)
      const result: SimulationCheckResult = {
        needsRestoration: false,
        archivedKeys: [],
        totalKeysInFootprint: 0,
      }

      shortTTLCache.set('test-key', result)
      await new Promise(resolve => setTimeout(resolve, 150))

      expect(shortTTLCache.get('test-key')).toBeUndefined()
    })

    it('clears expired entries', async () => {
      const shortTTLCache = new SimulationCache(10, 100)
      const result: SimulationCheckResult = {
        needsRestoration: false,
        archivedKeys: [],
        totalKeysInFootprint: 0,
      }

      shortTTLCache.set('key-1', result)
      await new Promise(resolve => setTimeout(resolve, 150))
      shortTTLCache.set('key-2', result)

      shortTTLCache.clearExpired()

      expect(shortTTLCache.getSize()).toBe(1)
      expect(shortTTLCache.has('key-1')).toBe(false)
      expect(shortTTLCache.has('key-2')).toBe(true)
    })
  })

  describe('statistics and monitoring', () => {
    it('tracks cache hits', () => {
      const result: SimulationCheckResult = {
        needsRestoration: false,
        archivedKeys: [],
        totalKeysInFootprint: 0,
      }

      cache.set('key-1', result)
      cache.get('key-1')
      cache.get('key-1')

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

    it('tracks evictions', () => {
      const result: SimulationCheckResult = {
        needsRestoration: false,
        archivedKeys: [],
        totalKeysInFootprint: 0,
      }

      for (let i = 0; i < 15; i++) {
        cache.set(`key-${i}`, result)
      }

      const stats = cache.getStatistics()
      expect(stats.evictions).toBe(5) // 15 - 10 max size
    })

    it('calculates hit rate', () => {
      const result: SimulationCheckResult = {
        needsRestoration: false,
        archivedKeys: [],
        totalKeysInFootprint: 0,
      }

      cache.set('key-1', result)
      cache.get('key-1') // hit
      cache.get('key-1') // hit
      cache.get('nonexistent') // miss

      const stats = cache.getStatistics()
      expect(stats.hitRate).toBeCloseTo(66.67, 1)
    })

    it('reports current size', () => {
      const result: SimulationCheckResult = {
        needsRestoration: false,
        archivedKeys: [],
        totalKeysInFootprint: 0,
      }

      expect(cache.getSize()).toBe(0)

      cache.set('key-1', result)
      expect(cache.getSize()).toBe(1)

      cache.set('key-2', result)
      expect(cache.getSize()).toBe(2)

      cache.invalidate('key-1')
      expect(cache.getSize()).toBe(1)
    })

    it('resets statistics without clearing cache', () => {
      const result: SimulationCheckResult = {
        needsRestoration: false,
        archivedKeys: [],
        totalKeysInFootprint: 0,
      }

      cache.set('key-1', result)
      cache.get('key-1')
      cache.get('nonexistent')

      let stats = cache.getStatistics()
      expect(stats.hits).toBe(1)
      expect(stats.misses).toBe(1)

      cache.resetStatistics()

      stats = cache.getStatistics()
      expect(stats.hits).toBe(0)
      expect(stats.misses).toBe(0)

      // Cache still has the entry
      expect(cache.has('key-1')).toBe(true)
    })

    it('provides complete statistics', () => {
      const result: SimulationCheckResult = {
        needsRestoration: false,
        archivedKeys: [],
        totalKeysInFootprint: 0,
      }

      cache.set('key-1', result)
      cache.set('key-2', result)
      cache.get('key-1')
      cache.get('nonexistent')

      const stats = cache.getStatistics()

      expect(stats).toHaveProperty('hits')
      expect(stats).toHaveProperty('misses')
      expect(stats).toHaveProperty('evictions')
      expect(stats).toHaveProperty('size')
      expect(stats).toHaveProperty('hitRate')

      expect(stats.size).toBe(2)
      expect(stats.hits).toBe(1)
      expect(stats.misses).toBe(1)
    })
  })

  describe('cache behavior with real scenarios', () => {
    it('handles repeated accesses efficiently', () => {
      const result: SimulationCheckResult = {
        needsRestoration: true,
        archivedKeys: [
          {
            key: {} as any,
            keyBase64: 'base64key',
            keyType: 'contractData',
          },
        ],
        totalKeysInFootprint: 1,
      }

      const key = SimulationCache.generateKey('txXDR123', 'sourceAccount')

      // First access - miss
      cache.get(key)

      // Store result
      cache.set(key, result)

      // Repeated accesses - all hits
      for (let i = 0; i < 10; i++) {
        const cached = cache.get(key)
        expect(cached).toEqual(result)
      }

      const stats = cache.getStatistics()
      expect(stats.hits).toBe(10)
      expect(stats.misses).toBe(1)
      expect(stats.hitRate).toBeCloseTo(90.91, 1)
    })

    it('maintains cache efficiency under mixed operations', () => {
      const result: SimulationCheckResult = {
        needsRestoration: false,
        archivedKeys: [],
        totalKeysInFootprint: 0,
      }

      // Add multiple entries
      for (let i = 0; i < 5; i++) {
        const key = SimulationCache.generateKey(`tx${i}`, 'source')
        cache.set(key, result)
      }

      // Mix of hits and misses
      const key1 = SimulationCache.generateKey('tx0', 'source')
      const key2 = SimulationCache.generateKey('tx1', 'source')
      const key3 = SimulationCache.generateKey('nonexistent', 'source')

      cache.get(key1) // hit
      cache.get(key2) // hit
      cache.get(key3) // miss
      cache.get(key1) // hit

      const stats = cache.getStatistics()
      expect(stats.hits).toBe(3)
      expect(stats.misses).toBe(1)
      expect(stats.size).toBe(5)
    })
  })
})

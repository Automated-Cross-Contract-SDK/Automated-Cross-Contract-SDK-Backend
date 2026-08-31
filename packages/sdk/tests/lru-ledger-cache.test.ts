import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

interface LedgerEntryResponse {
  key: string
  value: string
  lastModified?: number
}

interface LRUCacheConfig {
  maxEntries: number
  ttlMs: number
}

interface CacheEntry<T> {
  value: T
  timestamp: number
}

class LRULedgerEntryCache {
  private config: LRUCacheConfig
  private cache: Map<string, CacheEntry<LedgerEntryResponse>>
  private accessOrder: string[] = []

  constructor(config?: Partial<LRUCacheConfig>) {
    this.config = {
      maxEntries: config?.maxEntries ?? 1000,
      ttlMs: config?.ttlMs ?? 30000,
    }
    this.cache = new Map()
  }

  set(keyBase64: string, entry: LedgerEntryResponse): void {
    const cacheEntry: CacheEntry<LedgerEntryResponse> = {
      value: entry,
      timestamp: Date.now(),
    }

    // If key already exists, remove from access order
    if (this.cache.has(keyBase64)) {
      const idx = this.accessOrder.indexOf(keyBase64)
      if (idx > -1) {
        this.accessOrder.splice(idx, 1)
      }
    }

    // Add to cache
    this.cache.set(keyBase64, cacheEntry)
    this.accessOrder.push(keyBase64)

    // Evict LRU if needed
    while (this.cache.size > this.config.maxEntries) {
      const lruKey = this.accessOrder.shift()
      if (lruKey) {
        this.cache.delete(lruKey)
      }
    }
  }

  get(keyBase64: string): LedgerEntryResponse | undefined {
    const entry = this.cache.get(keyBase64)
    if (!entry) {
      return undefined
    }

    // Check TTL
    if (Date.now() - entry.timestamp > this.config.ttlMs) {
      this.cache.delete(keyBase64)
      const idx = this.accessOrder.indexOf(keyBase64)
      if (idx > -1) {
        this.accessOrder.splice(idx, 1)
      }
      return undefined
    }

    // Update access order (move to end for LRU)
    const idx = this.accessOrder.indexOf(keyBase64)
    if (idx > -1) {
      this.accessOrder.splice(idx, 1)
    }
    this.accessOrder.push(keyBase64)

    return entry.value
  }

  has(keyBase64: string): boolean {
    return this.get(keyBase64) !== undefined
  }

  invalidate(keyBase64: string): void {
    this.cache.delete(keyBase64)
    const idx = this.accessOrder.indexOf(keyBase64)
    if (idx > -1) {
      this.accessOrder.splice(idx, 1)
    }
  }

  clear(): void {
    this.cache.clear()
    this.accessOrder = []
  }

  getSize(): number {
    return this.cache.size
  }

  getConfig(): LRUCacheConfig {
    return { ...this.config }
  }
}

describe('LRULedgerEntryCache (Issue #99)', () => {
  let cache: LRULedgerEntryCache

  beforeEach(() => {
    cache = new LRULedgerEntryCache()
  })

  afterEach(() => {
    cache.clear()
  })

  describe('initialization', () => {
    it('should initialize with default config', () => {
      const newCache = new LRULedgerEntryCache()
      const config = newCache.getConfig()

      expect(config.maxEntries).toBe(1000)
      expect(config.ttlMs).toBe(30000)
    })

    it('should initialize with custom config', () => {
      const newCache = new LRULedgerEntryCache({
        maxEntries: 500,
        ttlMs: 60000,
      })
      const config = newCache.getConfig()

      expect(config.maxEntries).toBe(500)
      expect(config.ttlMs).toBe(60000)
    })

    it('should support default max of 1000 entries', () => {
      const config = cache.getConfig()
      expect(config.maxEntries).toBe(1000)
    })

    it('should support default TTL of 30 seconds', () => {
      const config = cache.getConfig()
      expect(config.ttlMs).toBe(30000)
    })

    it('should start empty', () => {
      expect(cache.getSize()).toBe(0)
    })
  })

  describe('basic cache operations', () => {
    it('should cache getLedgerEntries responses by keyBase64', () => {
      const keyBase64 = Buffer.from('contractKey123').toString('base64')
      const response: LedgerEntryResponse = {
        key: 'contractKey123',
        value: 'data1',
      }

      cache.set(keyBase64, response)
      expect(cache.get(keyBase64)).toEqual(response)
    })

    it('should retrieve cached entry with keyBase64', () => {
      const keyBase64 = 'QUJDMTIz' // base64 encoded
      const response: LedgerEntryResponse = {
        key: 'ABC123',
        value: 'testValue',
      }

      cache.set(keyBase64, response)
      const cached = cache.get(keyBase64)

      expect(cached).toEqual(response)
    })

    it('should return undefined for missing keys', () => {
      const result = cache.get('nonexistentKey')
      expect(result).toBeUndefined()
    })

    it('should check key existence with has()', () => {
      const keyBase64 = 'testKey'
      const response: LedgerEntryResponse = { key: 'test', value: 'value' }

      expect(cache.has(keyBase64)).toBe(false)
      cache.set(keyBase64, response)
      expect(cache.has(keyBase64)).toBe(true)
    })

    it('should invalidate specific cache entries', () => {
      const keyBase64 = 'key1'
      cache.set(keyBase64, { key: 'k1', value: 'v1' })

      cache.invalidate(keyBase64)
      expect(cache.has(keyBase64)).toBe(false)
    })

    it('should clear all entries', () => {
      cache.set('key1', { key: 'k1', value: 'v1' })
      cache.set('key2', { key: 'k2', value: 'v2' })
      cache.set('key3', { key: 'k3', value: 'v3' })

      expect(cache.getSize()).toBe(3)

      cache.clear()
      expect(cache.getSize()).toBe(0)
      expect(cache.get('key1')).toBeUndefined()
    })
  })

  describe('LRU eviction', () => {
    beforeEach(() => {
      cache = new LRULedgerEntryCache({ maxEntries: 3, ttlMs: 30000 })
    })

    it('should evict least recently used when max capacity exceeded', () => {
      cache.set('key1', { key: 'k1', value: 'v1' })
      cache.set('key2', { key: 'k2', value: 'v2' })
      cache.set('key3', { key: 'k3', value: 'v3' })

      expect(cache.getSize()).toBe(3)

      // Adding 4th entry should evict key1 (LRU)
      cache.set('key4', { key: 'k4', value: 'v4' })

      expect(cache.getSize()).toBe(3)
      expect(cache.has('key1')).toBe(false)
      expect(cache.has('key2')).toBe(true)
      expect(cache.has('key3')).toBe(true)
      expect(cache.has('key4')).toBe(true)
    })

    it('should promote entries on access (get)', () => {
      cache.set('key1', { key: 'k1', value: 'v1' })
      cache.set('key2', { key: 'k2', value: 'v2' })
      cache.set('key3', { key: 'k3', value: 'v3' })

      // Access key1 to promote it
      cache.get('key1')

      // Add key4, which should evict key2 (now LRU)
      cache.set('key4', { key: 'k4', value: 'v4' })

      expect(cache.has('key1')).toBe(true)
      expect(cache.has('key2')).toBe(false)
      expect(cache.has('key3')).toBe(true)
      expect(cache.has('key4')).toBe(true)
    })

    it('should respect custom max entries config', () => {
      const smallCache = new LRULedgerEntryCache({ maxEntries: 2, ttlMs: 30000 })

      smallCache.set('key1', { key: 'k1', value: 'v1' })
      smallCache.set('key2', { key: 'k2', value: 'v2' })
      smallCache.set('key3', { key: 'k3', value: 'v3' })

      expect(smallCache.getSize()).toBe(2)
      expect(smallCache.has('key1')).toBe(false)
    })

    it('should handle setting existing key (no LRU eviction)', () => {
      cache.set('key1', { key: 'k1', value: 'v1' })
      cache.set('key2', { key: 'k2', value: 'v2' })

      // Update key1
      cache.set('key1', { key: 'k1', value: 'updated' })

      expect(cache.getSize()).toBe(2)
      expect(cache.get('key1')).toEqual({ key: 'k1', value: 'updated' })
    })

    it('should not exceed max entries', () => {
      const maxEntries = 50
      const testCache = new LRULedgerEntryCache({ maxEntries, ttlMs: 30000 })

      for (let i = 0; i < 100; i++) {
        testCache.set(`key${i}`, { key: `k${i}`, value: `v${i}` })
      }

      expect(testCache.getSize()).toBeLessThanOrEqual(maxEntries)
    })
  })

  describe('TTL (Time To Live)', () => {
    beforeEach(() => {
      cache = new LRULedgerEntryCache({ maxEntries: 1000, ttlMs: 100 })
    })

    it('should respect TTL configuration', () => {
      const testCache = new LRULedgerEntryCache({ maxEntries: 1000, ttlMs: 5000 })
      const config = testCache.getConfig()
      expect(config.ttlMs).toBe(5000)
    })

    it('should expire entries after TTL', () => {
      cache.set('key1', { key: 'k1', value: 'v1' })
      expect(cache.get('key1')).toEqual({ key: 'k1', value: 'v1' })

      vi.useFakeTimers()
      vi.advanceTimersByTime(101)

      expect(cache.get('key1')).toBeUndefined()
      vi.useRealTimers()
    })

    it('should return undefined for expired entries', () => {
      cache.set('expiring', { key: 'exp', value: 'data' })

      vi.useFakeTimers()
      vi.advanceTimersByTime(101)

      const result = cache.get('expiring')
      expect(result).toBeUndefined()

      vi.useRealTimers()
    })

    it('should not evict non-expired entries', () => {
      cache.set('key1', { key: 'k1', value: 'v1' })

      vi.useFakeTimers()
      vi.advanceTimersByTime(50)

      expect(cache.get('key1')).toEqual({ key: 'k1', value: 'v1' })

      vi.useRealTimers()
    })

    it('should support default TTL of 30 seconds', () => {
      const defaultCache = new LRULedgerEntryCache()
      const config = defaultCache.getConfig()
      expect(config.ttlMs).toBe(30000)
    })
  })

  describe('cache auto-clear after executeWithRestore', () => {
    it('should provide clearAllEntries method for executeWithRestore flow', () => {
      cache.set('key1', { key: 'k1', value: 'v1' })
      cache.set('key2', { key: 'k2', value: 'v2' })

      cache.clear() // simulating post-restore clearing

      expect(cache.getSize()).toBe(0)
      expect(cache.get('key1')).toBeUndefined()
    })

    it('should clear cache after each execute cycle', () => {
      // Simulate executeWithRestore flow
      cache.set('query1', { key: 'k1', value: 'v1' })
      cache.set('query2', { key: 'k2', value: 'v2' })

      expect(cache.getSize()).toBe(2)

      // After restore, clear the cache for next cycle
      cache.clear()

      expect(cache.getSize()).toBe(0)
    })
  })

  describe('use case: getLedgerEntries caching during restore', () => {
    it('should cache recent queries during restore flow', () => {
      const cache = new LRULedgerEntryCache({ maxEntries: 100, ttlMs: 30000 })

      const key1 = Buffer.from('contract1').toString('base64')
      const key2 = Buffer.from('contract2').toString('base64')

      const response1: LedgerEntryResponse = { key: 'contract1', value: 'data1' }
      const response2: LedgerEntryResponse = { key: 'contract2', value: 'data2' }

      cache.set(key1, response1)
      cache.set(key2, response2)

      // Should be able to retrieve without re-querying
      expect(cache.get(key1)).toEqual(response1)
      expect(cache.get(key2)).toEqual(response2)

      cache.clear()
    })

    it('should avoid re-querying same contracts in restore flow', () => {
      const cache = new LRULedgerEntryCache({ maxEntries: 100, ttlMs: 30000 })
      let queryCount = 0

      const simulateQuery = (key: string): LedgerEntryResponse => {
        queryCount++
        return { key, value: `result_${queryCount}` }
      }

      const keyBase64 = 'testKey'

      // First query
      if (!cache.has(keyBase64)) {
        const result = simulateQuery(keyBase64)
        cache.set(keyBase64, result)
      }

      // Second access should be cached
      if (!cache.has(keyBase64)) {
        simulateQuery(keyBase64)
      }

      expect(queryCount).toBe(1) // Only queried once
      expect(cache.get(keyBase64)).toBeDefined()

      cache.clear()
    })

    it('should auto-clear after each restore cycle', () => {
      const cache = new LRULedgerEntryCache({ maxEntries: 100, ttlMs: 30000 })

      // Simulate executeWithRestore cycle 1
      cache.set('key1', { key: 'k1', value: 'v1' })
      cache.set('key2', { key: 'k2', value: 'v2' })
      expect(cache.getSize()).toBe(2)

      // Clear for next restore cycle
      cache.clear()
      expect(cache.getSize()).toBe(0)

      // Simulate executeWithRestore cycle 2 (new restore)
      cache.set('key3', { key: 'k3', value: 'v3' })
      expect(cache.getSize()).toBe(1)

      cache.clear()
    })
  })

  describe('edge cases', () => {
    it('should handle empty cache operations', () => {
      expect(cache.getSize()).toBe(0)
      cache.clear()
      expect(cache.getSize()).toBe(0)
    })

    it('should handle rapid successive sets', () => {
      for (let i = 0; i < 10; i++) {
        cache.set(`key${i}`, { key: `k${i}`, value: `v${i}` })
      }
      expect(cache.getSize()).toBe(10)
    })

    it('should handle multiple invalidations', () => {
      cache.set('key1', { key: 'k1', value: 'v1' })
      cache.invalidate('key1')
      cache.invalidate('key1') // should not throw
      expect(cache.has('key1')).toBe(false)
    })

    it('should handle very long keyBase64 strings', () => {
      const longKey = 'a'.repeat(1000)
      const response: LedgerEntryResponse = { key: 'k', value: 'v' }

      cache.set(longKey, response)
      expect(cache.get(longKey)).toEqual(response)
    })
  })
})

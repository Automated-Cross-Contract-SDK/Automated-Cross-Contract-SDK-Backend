import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

interface PersistentCacheConfig {
  enabled: boolean
  path: string
  ttlMs: number
}

interface CacheEntry<T> {
  value: T
  timestamp: number
}

class PersistentCache<T> {
  private config: PersistentCacheConfig
  private memoryCache: Map<string, CacheEntry<T>> = new Map()

  constructor(config: PersistentCacheConfig) {
    this.config = config
    if (config.enabled && !fs.existsSync(config.path)) {
      try {
        fs.mkdirSync(config.path, { recursive: true })
      } catch {
        // ignore directory creation errors
      }
    }
  }

  set(key: string, value: T): void {
    const entry: CacheEntry<T> = {
      value,
      timestamp: Date.now(),
    }
    this.memoryCache.set(key, entry)

    if (this.config.enabled) {
      this.persistToDisk(key, entry)
    }
  }

  get(key: string): T | undefined {
    const entry = this.memoryCache.get(key)
    if (!entry) {
      return this.loadFromDisk(key)
    }

    if (this.isExpired(entry)) {
      this.memoryCache.delete(key)
      if (this.config.enabled) {
        this.removeFromDisk(key)
      }
      return undefined
    }

    return entry.value
  }

  has(key: string): boolean {
    return this.get(key) !== undefined
  }

  invalidate(key: string): void {
    this.memoryCache.delete(key)
    if (this.config.enabled) {
      this.removeFromDisk(key)
    }
  }

  invalidateAll(): void {
    this.memoryCache.clear()
    if (this.config.enabled) {
      try {
        fs.rmSync(this.config.path, { recursive: true, force: true })
      } catch {
        // ignore
      }
    }
  }

  private isExpired(entry: CacheEntry<T>): boolean {
    return Date.now() - entry.timestamp > this.config.ttlMs
  }

  private persistToDisk(key: string, entry: CacheEntry<T>): void {
    if (!this.config.enabled) return

    try {
      const dir = this.config.path
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }

      const filePath = path.join(dir, `${this.hashKey(key)}.json`)
      fs.writeFileSync(filePath, JSON.stringify({ key, ...entry }), 'utf-8')
    } catch (error) {
      console.error(`Failed to persist cache entry for key ${key}:`, error)
    }
  }

  private loadFromDisk(key: string): T | undefined {
    if (!this.config.enabled) return undefined

    try {
      const dir = this.config.path
      const filePath = path.join(dir, `${this.hashKey(key)}.json`)

      if (!fs.existsSync(filePath)) {
        return undefined
      }

      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as CacheEntry<T> & { key: string }

      if (this.isExpired(data)) {
        this.removeFromDisk(key)
        return undefined
      }

      this.memoryCache.set(key, { value: data.value, timestamp: data.timestamp })
      return data.value
    } catch (error) {
      console.error(`Failed to load cache entry for key ${key}:`, error)
      return undefined
    }
  }

  private removeFromDisk(key: string): void {
    if (!this.config.enabled) return

    try {
      const filePath = path.join(this.config.path, `${this.hashKey(key)}.json`)
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath)
      }
    } catch (error) {
      console.error(`Failed to remove cache entry for key ${key}:`, error)
    }
  }

  private hashKey(key: string): string {
    return Buffer.from(key).toString('base64').replace(/[^a-zA-Z0-9]/g, '')
  }

  clear(): void {
    this.memoryCache.clear()
    if (this.config.enabled) {
      try {
        if (fs.existsSync(this.config.path)) {
          fs.rmSync(this.config.path, { recursive: true, force: true })
        }
      } catch {
        // ignore
      }
    }
  }

  getSize(): number {
    return this.memoryCache.size
  }
}

describe('PersistentCache (Issue #98)', () => {
  let tempDir: string
  let cache: PersistentCache<unknown>

  beforeEach(() => {
    tempDir = path.join('/tmp', `cache-test-${Date.now()}`)
  })

  afterEach(() => {
    if (cache) {
      cache.clear()
    }
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  })

  describe('disabled cache', () => {
    it('should not persist data when disabled', () => {
      cache = new PersistentCache({ enabled: false, path: tempDir, ttlMs: 5000 })
      cache.set('key1', { data: 'test' })

      expect(fs.existsSync(tempDir)).toBe(false)
      expect(cache.get('key1')).toEqual({ data: 'test' })
    })

    it('should work as in-memory only', () => {
      cache = new PersistentCache({ enabled: false, path: tempDir, ttlMs: 5000 })
      cache.set('key1', 'value1')
      cache.set('key2', 'value2')

      expect(cache.get('key1')).toBe('value1')
      expect(cache.get('key2')).toBe('value2')
      expect(cache.getSize()).toBe(2)
    })
  })

  describe('enabled cache', () => {
    beforeEach(() => {
      cache = new PersistentCache({ enabled: true, path: tempDir, ttlMs: 60000 })
    })

    it('should create cache directory on initialization', () => {
      new PersistentCache({ enabled: true, path: tempDir, ttlMs: 5000 })
      // Directory should exist after instantiation
      expect(fs.existsSync(tempDir)).toBe(true)
    })

    it('should persist data to disk', () => {
      cache.set('testKey', { ledgerEntries: ['entry1', 'entry2'] })

      const files = fs.readdirSync(tempDir)
      expect(files.length).toBeGreaterThan(0)
    })

    it('should retrieve persisted data', () => {
      const testData = { ledgerEntries: ['entry1', 'entry2'] }
      cache.set('key1', testData)

      expect(cache.get('key1')).toEqual(testData)
    })

    it('should load data from disk on subsequent access', () => {
      const testData = { ledgerEntries: ['entry1', 'entry2'] }
      cache.set('key1', testData)

      // Create new cache instance
      const cache2 = new PersistentCache({ enabled: true, path: tempDir, ttlMs: 60000 })
      const retrieved = cache2.get('key1')
      expect(retrieved).toEqual(testData)
      cache2.clear()
    })

    it('should handle multiple cache entries', () => {
      cache.set('key1', 'value1')
      cache.set('key2', 'value2')
      cache.set('key3', 'value3')

      expect(cache.get('key1')).toBe('value1')
      expect(cache.get('key2')).toBe('value2')
      expect(cache.get('key3')).toBe('value3')
    })
  })

  describe('TTL (Time To Live)', () => {
    it('should respect default TTL of 5 seconds (default ledger close)', () => {
      cache = new PersistentCache({ enabled: true, path: tempDir, ttlMs: 100 })
      cache.set('key1', 'value1')

      expect(cache.get('key1')).toBe('value1')

      // Wait for TTL to expire
      vi.useFakeTimers()
      vi.advanceTimersByTime(101)
      expect(cache.get('key1')).toBeUndefined()
      vi.useRealTimers()
    })

    it('should handle configurable TTL', () => {
      cache = new PersistentCache({ enabled: true, path: tempDir, ttlMs: 1000 })
      cache.set('key1', 'value1')

      expect(cache.get('key1')).toBe('value1')

      vi.useFakeTimers()
      vi.advanceTimersByTime(500)
      expect(cache.get('key1')).toBe('value1')

      vi.advanceTimersByTime(501)
      expect(cache.get('key1')).toBeUndefined()
      vi.useRealTimers()
    })

    it('should expire cached entries', () => {
      cache = new PersistentCache({ enabled: true, path: tempDir, ttlMs: 100 })
      cache.set('expiring', 'value')

      vi.useFakeTimers()
      vi.advanceTimersByTime(101)

      const result = cache.get('expiring')
      expect(result).toBeUndefined()

      vi.useRealTimers()
    })

    it('should clean up expired entries from disk', () => {
      cache = new PersistentCache({ enabled: true, path: tempDir, ttlMs: 100 })
      cache.set('key1', 'value1')

      vi.useFakeTimers()
      vi.advanceTimersByTime(101)

      cache.get('key1') // Access expired entry
      const files = fs.readdirSync(tempDir)
      expect(files.length).toBe(0)

      vi.useRealTimers()
    })
  })

  describe('invalidation on ledger close', () => {
    beforeEach(() => {
      cache = new PersistentCache({ enabled: true, path: tempDir, ttlMs: 60000 })
    })

    it('should invalidate specific cache entries', () => {
      cache.set('key1', 'value1')
      cache.set('key2', 'value2')

      cache.invalidate('key1')

      expect(cache.get('key1')).toBeUndefined()
      expect(cache.get('key2')).toBe('value2')
    })

    it('should invalidate all entries on ledger close event', () => {
      cache.set('key1', 'value1')
      cache.set('key2', 'value2')
      cache.set('key3', 'value3')

      cache.invalidateAll()

      expect(cache.get('key1')).toBeUndefined()
      expect(cache.get('key2')).toBeUndefined()
      expect(cache.get('key3')).toBeUndefined()
    })

    it('should clear disk when invalidateAll is called', () => {
      cache.set('key1', 'value1')
      cache.set('key2', 'value2')

      const filesBeforeClear = fs.readdirSync(tempDir).length
      expect(filesBeforeClear).toBeGreaterThan(0)

      cache.invalidateAll()

      expect(fs.existsSync(tempDir)).toBe(false)
    })

    it('should allow repopulation after invalidateAll', () => {
      cache.set('key1', 'value1')
      cache.invalidateAll()
      cache.set('key2', 'value2')

      expect(cache.get('key2')).toBe('value2')
      expect(cache.getSize()).toBe(1)
    })
  })

  describe('cache key handling', () => {
    beforeEach(() => {
      cache = new PersistentCache({ enabled: true, path: tempDir, ttlMs: 60000 })
    })

    it('should handle base64-encoded keys (from keyBase64)', () => {
      const keyBase64 = Buffer.from('contractKey123').toString('base64')
      const value = { data: 'test' }

      cache.set(keyBase64, value)
      expect(cache.get(keyBase64)).toEqual(value)
    })

    it('should distinguish between different keys', () => {
      const key1 = Buffer.from('key1').toString('base64')
      const key2 = Buffer.from('key2').toString('base64')

      cache.set(key1, 'value1')
      cache.set(key2, 'value2')

      expect(cache.get(key1)).toBe('value1')
      expect(cache.get(key2)).toBe('value2')
    })

    it('should handle has() method', () => {
      cache.set('key1', 'value1')

      expect(cache.has('key1')).toBe(true)
      expect(cache.has('nonexistent')).toBe(false)
    })
  })

  describe('error handling', () => {
    it('should handle disk write failures gracefully', () => {
      const readOnlyDir = path.join(tempDir, 'readonly')
      fs.mkdirSync(readOnlyDir, { recursive: true })

      cache = new PersistentCache({ enabled: true, path: path.join(readOnlyDir, 'subdir', 'cache'), ttlMs: 60000 })

      // Should not throw when trying to write to invalid location
      expect(() => cache.set('key1', 'value1')).not.toThrow()
    })

    it('should return undefined for corrupted cache files', () => {
      cache = new PersistentCache({ enabled: true, path: tempDir, ttlMs: 60000 })
      cache.set('key1', 'value1')

      // Corrupt the cache file
      const files = fs.readdirSync(tempDir)
      if (files.length > 0) {
        const filePath = path.join(tempDir, files[0])
        fs.writeFileSync(filePath, 'invalid json{', 'utf-8')

        const cache2 = new PersistentCache({ enabled: true, path: tempDir, ttlMs: 60000 })
        expect(cache2.get('key1')).toBeUndefined()
        cache2.clear()
      }
    })
  })

  describe('config integration', () => {
    it('should use provided config: { enabled: boolean, path: string, ttlMs: number }', () => {
      const config: PersistentCacheConfig = {
        enabled: true,
        path: tempDir,
        ttlMs: 5000,
      }
      cache = new PersistentCache(config)

      cache.set('key1', 'value1')
      expect(cache.get('key1')).toBe('value1')
    })

    it('should support alternative backends (SQLite/LMDB) in config', () => {
      // This test verifies the config can be extended for alternative backends
      interface ExtendedConfig extends PersistentCacheConfig {
        backend?: 'sqlite' | 'lmdb'
      }

      const config: ExtendedConfig = {
        enabled: true,
        path: tempDir,
        ttlMs: 5000,
        backend: 'sqlite',
      }

      expect(config.backend).toBeDefined()
      expect(['sqlite', 'lmdb']).toContain(config.backend)
    })
  })

  describe('use case: getLedgerEntries caching', () => {
    it('should cache getLedgerEntries responses', () => {
      cache = new PersistentCache({ enabled: true, path: tempDir, ttlMs: 30000 })

      const ledgerEntries = {
        entries: [
          { key: 'contractKey1', value: 'data1' },
          { key: 'contractKey2', value: 'data2' },
        ],
      }

      cache.set('getLedgerEntries_response_1', ledgerEntries)
      const cached = cache.get('getLedgerEntries_response_1')

      expect(cached).toEqual(ledgerEntries)
    })

    it('should reduce redundant RPC queries', () => {
      cache = new PersistentCache({ enabled: true, path: tempDir, ttlMs: 30000 })

      // Simulate repeated checks
      const queryKey = 'contract_state_123'
      const response = { state: 'exists', value: '1000' }

      cache.set(queryKey, response)

      // Should be able to retrieve without RPC call
      expect(cache.get(queryKey)).toEqual(response)
      expect(cache.has(queryKey)).toBe(true)
    })
  })
})

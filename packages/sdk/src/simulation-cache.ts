import { SimulationCheckResult } from './types.js'

/**
 * Simple hash function using base64 encoding for cross-platform compatibility
 */
function hashKey(input: string): string {
  let hash = 0
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash = hash & hash // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16).padStart(8, '0')
}

/**
 * Configuration for simulation result caching
 */
export interface SimulationCacheConfig {
  enabled: boolean
  maxSize: number
  ttlMs: number
  /**
   * Per-network overrides keyed by network passphrase. Values are merged over
   * the top-level settings, so each network can have its own capacity/TTL.
   */
  perNetwork?: Record<string, Partial<Omit<SimulationCacheConfig, 'perNetwork'>>>
}

export const DEFAULT_SIMULATION_CACHE_CONFIG: Omit<SimulationCacheConfig, 'perNetwork'> = {
  enabled: true,
  maxSize: 1000,
  ttlMs: 60000,
}

/**
 * Resolves the effective cache settings for a network passphrase, applying
 * `perNetwork` overrides on top of the shared settings and defaults.
 * Invalid capacities (non-finite or < 1) fall back to the default.
 */
export function resolveSimulationCacheConfig(
  config: Partial<SimulationCacheConfig> | undefined,
  networkPassphrase: string,
): Omit<SimulationCacheConfig, 'perNetwork'> {
  const { perNetwork, ...shared } = config ?? {}
  const merged = { ...DEFAULT_SIMULATION_CACHE_CONFIG, ...shared, ...perNetwork?.[networkPassphrase] }
  if (!Number.isFinite(merged.maxSize) || merged.maxSize < 1) merged.maxSize = DEFAULT_SIMULATION_CACHE_CONFIG.maxSize
  if (!Number.isFinite(merged.ttlMs) || merged.ttlMs < 0) merged.ttlMs = DEFAULT_SIMULATION_CACHE_CONFIG.ttlMs
  merged.maxSize = Math.floor(merged.maxSize)
  return merged
}

/**
 * Cached simulation result with metadata
 */
interface CacheEntry {
  result: SimulationCheckResult
  expiresAt: number
  accessCount: number
  lastAccessedAt: number
}

/**
 * Statistics about cache performance
 */
export interface CacheStatistics {
  hits: number
  misses: number
  evictions: number
  size: number
  hitRate: number
}

/**
 * In-memory LRU cache for simulation results
 * Implements least-recently-used eviction and TTL-based auto-expiration
 */
export class SimulationCache {
  private cache: Map<string, CacheEntry> = new Map()
  private readonly maxSize: number
  private readonly ttlMs: number
  private stats = { hits: 0, misses: 0, evictions: 0 }

  constructor(maxSize: number = 1000, ttlMs: number = 60000) {
    this.maxSize = Math.max(1, Math.floor(maxSize))
    this.ttlMs = ttlMs
  }

  /** Maximum number of entries this cache will hold. */
  getCapacity(): number {
    return this.maxSize
  }

  /**
   * Generate a cache key from transaction parameters
   * @param txXDR Transaction XDR
   * @param source Source account (optional)
   * @param ledgerSequence Ledger sequence number (optional)
   * @returns Cache key
   */
  static generateKey(txXDR: string, source?: string, ledgerSequence?: number): string {
    const combined = `${txXDR}|${source || ''}|${ledgerSequence || ''}`
    return hashKey(combined)
  }

  /**
   * Get a cached simulation result
   * @param key Cache key
   * @returns Cached result or undefined
   */
  get(key: string): SimulationCheckResult | undefined {
    const entry = this.cache.get(key)

    if (!entry) {
      this.stats.misses++
      return undefined
    }

    // Check if entry has expired
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key)
      this.stats.misses++
      return undefined
    }

    // Update LRU tracking (re-insert so Map order stays least -> most recent)
    entry.accessCount++
    entry.lastAccessedAt = Date.now()
    this.cache.delete(key)
    this.cache.set(key, entry)

    this.stats.hits++
    return entry.result
  }

  /**
   * Set a simulation result in the cache
   * @param key Cache key
   * @param result Simulation result to cache
   */
  set(key: string, result: SimulationCheckResult): void {
    // If cache is full, evict least recently used entry
    if (
      this.cache.size >= this.maxSize &&
      !this.cache.has(key)
    ) {
      this.evictLRU()
    }

    const now = Date.now()
    this.cache.delete(key)
    this.cache.set(key, {
      result,
      expiresAt: now + this.ttlMs,
      accessCount: 0,
      lastAccessedAt: now,
    })
  }

  /**
   * Evict the least recently used entry
   */
  private evictLRU(): void {
    // Map iteration order is insertion order, and get/set re-insert on access,
    // so the first key is always the least recently used one (O(1)).
    const lruKey = this.cache.keys().next()
    if (!lruKey.done) {
      this.cache.delete(lruKey.value)
      this.stats.evictions++
    }
  }

  /**
   * Clear all expired entries from the cache
   */
  clearExpired(): void {
    const now = Date.now()
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key)
      }
    }
  }

  /**
   * Clear all entries from the cache
   */
  clear(): void {
    this.cache.clear()
    this.stats = { hits: 0, misses: 0, evictions: 0 }
  }

  /**
   * Invalidate a specific cache entry
   * @param key Cache key to invalidate
   */
  invalidate(key: string): void {
    this.cache.delete(key)
  }

  /**
   * Invalidate all cache entries
   */
  invalidateAll(): void {
    this.cache.clear()
  }

  /**
   * Get cache statistics
   */
  getStatistics(): CacheStatistics {
    this.clearExpired() // Clean up before reporting

    const total = this.stats.hits + this.stats.misses
    const hitRate = total > 0 ? (this.stats.hits / total) * 100 : 0

    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      evictions: this.stats.evictions,
      size: this.cache.size,
      hitRate,
    }
  }

  /**
   * Get the current cache size
   */
  getSize(): number {
    return this.cache.size
  }

  /**
   * Check if a key exists and is not expired
   */
  has(key: string): boolean {
    const entry = this.cache.get(key)
    if (!entry) return false

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key)
      return false
    }

    return true
  }

  /**
   * Reset statistics without clearing the cache
   */
  resetStatistics(): void {
    this.stats = { hits: 0, misses: 0, evictions: 0 }
  }
}

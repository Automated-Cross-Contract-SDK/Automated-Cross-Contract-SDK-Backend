import QuickLRU from 'quick-lru'
import { createHash } from 'node:crypto'
import type { FootprintKeys } from './footprint-parser.js'

/**
 * Configuration for the footprint extraction cache.
 */
export interface FootprintCacheConfig {
  /** Maximum number of cached entries (default: 500). */
  maxSize: number
}

/**
 * Cache entry with ledger sequence tracking.
 */
interface CacheEntry {
  result: FootprintKeys | null
  ledgerSequence: number | undefined
}

/**
 * Statistics about the footprint cache performance.
 */
export interface FootprintCacheStatistics {
  hits: number
  misses: number
  size: number
  hitRate: number
}

/**
 * Computes a SHA-256 hash of the given XDR string for use as a cache key.
 * Using a fixed-length cryptographic hash avoids unbounded key growth
 * when XDR payloads are large (multi-MB).
 */
function hashXDR(xdr: string): string {
  return createHash('sha256').update(xdr).digest('hex')
}

/**
 * Bounded LRU cache for `extractFootprintFromTransaction` results.
 *
 * Motivation: parsing Stellar transaction XDR into footprint keys is a
 * CPU-intensive operation that involves full XDR deserialization through
 * the Stellar SDK.  When the same transaction is passed to multiple SDK
 * methods (e.g. `simulate` and `checkTransaction`), caching avoids
 * redundant parsing.
 *
 * The cache is keyed by the SHA-256 hash of the raw XDR string, so lookups
 * are O(1) regardless of XDR size.  Eviction is handled automatically by
 * the underlying `quick-lru` store when the configured `maxSize` is reached.
 *
 * ## Ledger-close invalidation
 *
 * Cached footprint keys are only valid for the current ledger.  Call
 * `invalidateAll()` whenever a new ledger closes to ensure stale entries
 * are not served.
 */
export class FootprintCache {
  private cache: QuickLRU<string, CacheEntry>
  private stats = { hits: 0, misses: 0 }

  constructor(config: FootprintCacheConfig = { maxSize: 500 }) {
    this.cache = new QuickLRU({ maxSize: config.maxSize })
  }

  /**
   * Retrieve a cached footprint for the given transaction XDR.
   * Returns `undefined` on a cache miss.
   */
  get(txXDR: string): FootprintKeys | null | undefined {
    const key = hashXDR(txXDR)
    if (this.cache.has(key)) {
      this.stats.hits++
      const entry = this.cache.get(key)
      return entry?.result
    }
    this.stats.misses++
    return undefined
  }

  /**
   * Store a footprint result for the given transaction XDR.
   * @param txXDR Transaction XDR
   * @param result Footprint keys result
   * @param ledgerSequence Optional ledger sequence number for TTL tracking
   */
  set(txXDR: string, result: FootprintKeys | null, ledgerSequence?: number): void {
    const key = hashXDR(txXDR)
    this.cache.set(key, { result, ledgerSequence })
  }

  /**
   * Flush entries older than 1 ledger when a new ledger closes.
   * Entries are considered stale if their ledger sequence is <= closedLedgerSequence - 1.
   * This provides automatic invalidation on top of the time-based TTL.
   * @param closedLedgerSequence The sequence number of the newly closed ledger
   */
  onLedgerClose(closedLedgerSequence: number): void {
    const staleThreshold = closedLedgerSequence - 1
    const keys = Array.from(this.cache.keys())
    for (const key of keys) {
      const entry = this.cache.get(key)
      if (entry?.ledgerSequence !== undefined && entry.ledgerSequence <= staleThreshold) {
        this.cache.delete(key)
      }
    }
  }

  /**
   * Invalidate all cached entries.
   * Call this on every ledger close to avoid serving stale footprint data.
   */
  invalidateAll(): void {
    this.cache.clear()
  }

  /**
   * Invalidate the cached entry for a specific transaction XDR.
   */
  invalidate(txXDR: string): void {
    const key = hashXDR(txXDR)
    this.cache.delete(key)
  }

  /**
   * Clear all entries and reset statistics.
   */
  clear(): void {
    this.cache.clear()
    this.stats = { hits: 0, misses: 0 }
  }

  /**
   * Return current cache statistics.
   */
  getStatistics(): FootprintCacheStatistics {
    const total = this.stats.hits + this.stats.misses
    const hitRate = total > 0 ? (this.stats.hits / total) * 100 : 0
    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      size: this.cache.size,
      hitRate,
    }
  }

  /**
   * Return the number of entries currently in the cache.
   */
  getSize(): number {
    return this.cache.size
  }

  /**
   * Check whether an entry exists for the given XDR.
   */
  has(txXDR: string): boolean {
    return this.cache.has(hashXDR(txXDR))
  }
}

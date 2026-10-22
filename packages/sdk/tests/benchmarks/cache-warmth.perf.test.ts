import { describe, it, expect, bench } from 'vitest'
import { SimulationCache, resolveSimulationCacheConfig } from '../../src/simulation-cache.js'
import type { SimulationCheckResult } from '../../src/types.js'

const NETWORKS = ['Test SDF Network ; September 2015', 'Public Global Stellar Network ; September 2015']
const ACCOUNTS = Array.from({ length: 20 }, (_, i) => `G${i.toString().padStart(55, 'A')}`)
const TXS = Array.from({ length: 50 }, (_, i) => `AAAA${i.toString(36).padStart(200, 'x')}`)
const RESULT = { needsRestoration: false } as unknown as SimulationCheckResult

function newCaches() {
  return new Map(NETWORKS.map(n => {
    const cfg = resolveSimulationCacheConfig({ maxSize: 2000 }, n)
    return [n, new SimulationCache(cfg.maxSize, cfg.ttlMs)] as const
  }))
}

/** Runs every (network, account, tx) lookup once, populating on miss. */
function sweep(caches: ReturnType<typeof newCaches>) {
  for (const [, cache] of caches) {
    for (const account of ACCOUNTS) {
      for (const tx of TXS) {
        const key = SimulationCache.generateKey(tx, account)
        if (!cache.get(key)) cache.set(key, RESULT)
      }
    }
  }
}

describe('simulation cache: cold vs warm across networks and accounts', () => {
  it('cold pass misses everything, warm pass hits everything, per network', () => {
    const caches = newCaches()
    sweep(caches)
    for (const cache of caches.values()) expect(cache.getStatistics().hits).toBe(0)
    sweep(caches)
    for (const cache of caches.values()) {
      const stats = cache.getStatistics()
      expect(stats.hits).toBe(ACCOUNTS.length * TXS.length)
      expect(stats.hitRate).toBe(50)
    }
  })

  it('distinct accounts do not share entries', () => {
    expect(SimulationCache.generateKey(TXS[0], ACCOUNTS[0]))
      .not.toBe(SimulationCache.generateKey(TXS[0], ACCOUNTS[1]))
  })

  it('undersized caches stay bounded and degrade to misses', () => {
    const cache = new SimulationCache(10, 60_000)
    for (const tx of TXS) cache.set(SimulationCache.generateKey(tx), RESULT)
    expect(cache.getSize()).toBe(10)
    expect(cache.getStatistics().evictions).toBe(TXS.length - 10)
  })
})

describe.skipIf(!process.env.BENCH)('cache warmth bench', () => {
  bench('cold sweep', () => sweep(newCaches()))
  const warm = newCaches()
  sweep(warm)
  bench('warm sweep', () => sweep(warm))
})

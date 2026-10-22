import { describe, it, expect } from 'vitest'
import { resolveSimulationCacheConfig, SimulationCache } from '@soroban-resurrect/rpc'

describe('per-network simulation cache config', () => {
  const testnet = 'Test SDF Network ; September 2015'
  it('applies per-network overrides over shared settings', () => {
    const cfg = { maxSize: 500, perNetwork: { [testnet]: { maxSize: 50 } } }
    expect(resolveSimulationCacheConfig(cfg, testnet).maxSize).toBe(50)
    expect(resolveSimulationCacheConfig(cfg, 'other').maxSize).toBe(500)
  })
  it('falls back to defaults for invalid capacity', () => {
    expect(resolveSimulationCacheConfig({ maxSize: -1 }, testnet).maxSize).toBe(1000)
  })
  it('evicts least recently used entry first', () => {
    const c = new SimulationCache(2, 60_000)
    const r = {} as any
    c.set('a', r); c.set('b', r); c.get('a'); c.set('c', r)
    expect(c.has('a')).toBe(true)
    expect(c.has('b')).toBe(false)
  })
})

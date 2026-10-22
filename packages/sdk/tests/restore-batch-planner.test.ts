import { describe, it, expect } from 'vitest'
import { planRestoreBatches, RESTORE_TX_OVERHEAD_BYTES } from '../src/restore-batch-planner.js'
import { resolveSimulationCacheConfig, SimulationCache } from '../src/simulation-cache.js'
import type { ArchivedKey } from '../src/types.js'

const key = (size: number) => ({ keyBase64: 'x'.repeat(size) }) as unknown as ArchivedKey
const keys = (n: number, size = 10) => Array.from({ length: n }, () => key(size))

describe('planRestoreBatches', () => {
  it('returns no batches for no keys', () => {
    expect(planRestoreBatches([])).toEqual([])
  })
  it('splits on XDR size', () => {
    const b = planRestoreBatches(keys(10, 100), { maxXdrBytes: RESTORE_TX_OVERHEAD_BYTES + 300 })
    expect(b.map(x => x.length)).toEqual([3, 3, 3, 1])
  })
  it('splits on key count cap', () => {
    expect(planRestoreBatches(keys(7), { maxKeysPerBatch: 3 }).map(x => x.length)).toEqual([3, 3, 1])
  })
  it('splits on fee budget', () => {
    const b = planRestoreBatches(keys(5), { feePerKeyStroops: 1000, maxFeePerBatchStroops: 2500 })
    expect(b.map(x => x.length)).toEqual([2, 2, 1])
  })
  it('keeps an oversized key in its own batch rather than dropping it', () => {
    const b = planRestoreBatches([key(10), key(5000), key(10)], { maxXdrBytes: 1000 })
    expect(b.map(x => x.length)).toEqual([1, 1, 1])
  })
  it('ignores invalid limits', () => {
    expect(planRestoreBatches(keys(5), { maxKeysPerBatch: 0, maxFeePerBatchStroops: NaN })).toHaveLength(1)
  })
})

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

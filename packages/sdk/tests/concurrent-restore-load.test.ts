/**
 * Load test: many restore batches executed concurrently against a mock RPC
 * with artificial (jittered) latency. Asserts the in-flight limit is honoured
 * and results are never interleaved/corrupted across batches.
 */
import { describe, it, expect } from 'vitest'
import { SorobanResurrect } from '../src/soroban-resurrect.js'
import type { RestoreBatchResult } from '../src/types.js'

const CONFIG = {
  rpcUrl: 'https://soroban-testnet.stellar.org',
  networkPassphrase: 'Test SDF Network ; September 2015',
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

function makeBatches(n: number): RestoreBatchResult[] {
  return Array.from({ length: n }, (_, i) => ({
    batchIndex: i,
    transactionXDR: `xdr-${i}`,
    keysRestored: (i % 7) + 1,
    status: 'pending' as const,
  }))
}

/** Replace the RPC submit step with a mock that has jittered latency. */
function mockRpc(client: SorobanResurrect, failing: Set<string> = new Set()) {
  const stats = { active: 0, maxActive: 0, calls: 0 }
  ;(client as any).submitSignedTransaction = async (txXdr: string) => {
    stats.calls++
    stats.active++
    stats.maxActive = Math.max(stats.maxActive, stats.active)
    try {
      await sleep(1 + (txXdr.length * 7) % 9) // deterministic jitter, 1-9ms
      if (failing.has(txXdr)) throw new Error(`rpc failure for ${txXdr}`)
      return `hash-${txXdr}`
    } finally {
      stats.active--
    }
  }
  return stats
}

describe('concurrent restore batches – load', () => {
  const sign = async (x: string) => x

  it.each([1, 4, 16])('never exceeds concurrency limit (%i) and keeps results intact', async limit => {
    const client = new SorobanResurrect(CONFIG)
    const stats = mockRpc(client)
    const batches = makeBatches(200)

    const res = await client.executeRestoreBatchesConcurrent(batches, sign, limit)

    expect(stats.calls).toBe(200)
    expect(stats.maxActive).toBeLessThanOrEqual(limit)
    expect(res.success).toBe(true)
    expect(res.concurrencyUsed).toBe(limit)
    expect(res.batches).toHaveLength(200)
    res.batches.forEach((b, i) => {
      expect(b.batchIndex).toBe(i)
      expect(b.txHash).toBe(`hash-xdr-${i}`)
      expect(b.status).toBe('success')
    })
    expect(res.totalKeysRestored).toBe(batches.reduce((s, b) => s + b.keysRestored, 0))
  }, 30_000)

  it('isolates failures to their own batch without corrupting others', async () => {
    const client = new SorobanResurrect(CONFIG)
    const failing = new Set(['xdr-3', 'xdr-50', 'xdr-99'])
    mockRpc(client, failing)
    const batches = makeBatches(100)

    const res = await client.executeRestoreBatchesConcurrent(batches, sign, 8)

    expect(res.success).toBe(false)
    expect(res.failedBatchCount).toBe(3)
    expect(res.failedBatchIndices).toEqual([3, 50, 99])
    res.batches.forEach((b, i) => {
      if (failing.has(`xdr-${i}`)) {
        expect(b.status).toBe('failed')
        expect(b.error).toContain(`xdr-${i}`)
        expect(b.txHash).toBeUndefined()
      } else {
        expect(b.status).toBe('success')
        expect(b.txHash).toBe(`hash-xdr-${i}`)
      }
    })
    const expectedKeys = batches
      .filter((_, i) => !failing.has(`xdr-${i}`))
      .reduce((s, b) => s + b.keysRestored, 0)
    expect(res.totalKeysRestored).toBe(expectedKeys)
  }, 30_000)

  it('handles several overlapping runs on one client without cross-talk', async () => {
    const client = new SorobanResurrect(CONFIG)
    mockRpc(client)
    const runs = await Promise.all(
      [0, 1, 2, 3].map(() => client.executeRestoreBatchesConcurrent(makeBatches(50), sign, 5)),
    )
    for (const r of runs) {
      expect(r.success).toBe(true)
      expect(r.batches.map(b => b.txHash)).toEqual(makeBatches(50).map(b => `hash-${b.transactionXDR}`))
    }
  }, 30_000)
})

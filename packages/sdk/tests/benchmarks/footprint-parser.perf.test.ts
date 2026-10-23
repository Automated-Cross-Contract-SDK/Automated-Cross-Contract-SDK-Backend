import { describe, it, expect } from 'vitest'
import { xdr } from '@stellar/stellar-sdk'
import { extractKeysFromFootprint, classifyLedgerKey, encodeLedgerKey } from '../../src/footprint-parser.js'

/**
 * Parser throughput and peak-memory measurements across footprint sizes.
 * Results are printed as a table; assertions use generous budgets so the
 * suite stays stable on slow CI runners while catching order-of-magnitude
 * regressions. Run with `node --expose-gc` for more accurate heap figures.
 */
const SIZES = [10, 100, 1_000, 5_000] as const
const ITERATIONS = 5

function buildFootprint(size: number): xdr.LedgerFootprint {
  const keys: xdr.LedgerKey[] = []
  for (let i = 0; i < size; i++) {
    const id = Buffer.alloc(32)
    id.writeUInt32BE(i)
    keys.push(
      i % 2 === 0
        ? xdr.LedgerKey.contractData(new xdr.LedgerKeyContractData({
            contract: xdr.ScAddress.scAddressTypeContract(id),
            key: xdr.ScVal.scvU32(i),
            durability: xdr.ContractDataDurability.persistent(),
          }))
        : xdr.LedgerKey.contractCode(new xdr.LedgerKeyContractCode({ hash: id })),
    )
  }
  const half = Math.floor(size / 2)
  return new xdr.LedgerFootprint({ readOnly: keys.slice(0, half), readWrite: keys.slice(half) })
}

function parse(footprint: xdr.LedgerFootprint): number {
  const { all } = extractKeysFromFootprint(footprint)
  for (const key of all) {
    classifyLedgerKey(key)
    encodeLedgerKey(key)
  }
  return all.length
}

interface Measurement { size: number; keysPerSec: number; peakHeapMB: number; msPerRun: number }

function measure(size: number): Measurement {
  // Round-trip through XDR so each run parses wire bytes, as the SDK does.
  const wire = buildFootprint(size).toXDR()
  const gc = (globalThis as any).gc as (() => void) | undefined
  gc?.()
  const baseHeap = process.memoryUsage().heapUsed
  let peakHeap = baseHeap
  const start = performance.now()
  for (let i = 0; i < ITERATIONS; i++) {
    expect(parse(xdr.LedgerFootprint.fromXDR(wire))).toBe(size)
    peakHeap = Math.max(peakHeap, process.memoryUsage().heapUsed)
  }
  const elapsed = performance.now() - start
  return {
    size,
    msPerRun: elapsed / ITERATIONS,
    keysPerSec: Math.round((size * ITERATIONS) / (elapsed / 1000)),
    peakHeapMB: Math.max(0, peakHeap - baseHeap) / 1024 / 1024,
  }
}

describe('Footprint parser throughput & memory', () => {
  const results: Measurement[] = []

  it.each(SIZES)('parses a %i-key footprint', size => {
    const m = measure(size)
    results.push(m)
    expect(m.keysPerSec).toBeGreaterThan(1_000)
    expect(m.peakHeapMB).toBeLessThan(256)
  })

  it('scales roughly linearly with footprint size', () => {
    console.table(results.map(r => ({
      keys: r.size,
      'ms/run': r.msPerRun.toFixed(2),
      'keys/sec': r.keysPerSec,
      'peak heap Δ (MB)': r.peakHeapMB.toFixed(2),
    })))
    const small = results.find(r => r.size === 1_000)!
    const large = results.find(r => r.size === 5_000)!
    // 5x more keys should not cost more than ~25x the time (no quadratic blow-up).
    expect(large.msPerRun / Math.max(small.msPerRun, 0.01)).toBeLessThan(25)
  })

  it('handles an empty footprint', () => {
    expect(parse(new xdr.LedgerFootprint({ readOnly: [], readWrite: [] }))).toBe(0)
  })
})


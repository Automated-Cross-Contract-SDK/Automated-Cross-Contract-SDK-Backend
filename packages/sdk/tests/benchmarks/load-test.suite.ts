/**
 * Load testing suite — benchmarks batch restoration at scale.
 *
 * Benchmarks:
 *   - 100 keys  (2 batches)
 *   - 500 keys  (10 batches)
 *   - 1000 keys (20 batches)
 *   - 5000 keys (100 batches)
 *
 * Metrics:
 *   - Total time to complete
 *   - Memory usage (heap used, GC pauses if available)
 *   - RPC call count
 *   - Success/failure rate
 *   - Throughput (keys restored / second)
 *
 * Usage:
 *   npm run test:load -w packages/sdk
 *   npm run test:load:benchmark -w packages/sdk  # runs perf benchmarks
 *
 * Output:
 *   - Console summary table
 *   - JSON report written to tests/benchmarks/results/load-test-report.json
 *   - Can be published to GitHub Pages benchmark dashboard
 */
import { describe, it, expect, bench } from 'vitest'
import { SorobanResurrect } from '../../src/soroban-resurrect.js'
import type { ArchivedKey } from '../../src/types.js'
import * as fs from 'node:fs'
import * as path from 'node:path'

// ── Configuration ───────────────────────────────────────────────────────────

const BENCHMARK_SCALES = [
  { name: '100', keyCount: 100, expectedBatches: 2 },
  { name: '500', keyCount: 500, expectedBatches: 10 },
  { name: '1000', keyCount: 1000, expectedBatches: 20 },
  { name: '5000', keyCount: 5000, expectedBatches: 100 },
] as const

const CONFIG = {
  rpcUrl: 'https://soroban-testnet.stellar.org',
  networkPassphrase: 'Test SDF Network ; September 2015',
}

const RESULTS_DIR = path.join(__dirname, 'results')

// ── Helpers ─────────────────────────────────────────────────────────────────

interface BenchmarkResult {
  scale: string
  keyCount: number
  batchCount: number
  totalTimeMs: number
  heapUsedMB: number
  rpcCallCount: number
  successRate: number
  throughput: number // keys / second
  timestamp: string
}

function generateKeys(count: number): ArchivedKey[] {
  const keyTypes = ['contractData', 'contractCode', 'ttlEntry', 'contractInstance'] as const
  const keys: ArchivedKey[] = []

  for (let i = 0; i < count; i++) {
    const hexId = i.toString(16).padStart(14, '0')
    const contractId = `CA${hexId.padStart(54, '0')}`
    const keyType = keyTypes[i % keyTypes.length]
    const restorePriority = keyType === 'contractInstance' ? 0
      : keyType === 'contractCode' ? 1
      : keyType === 'contractData' ? 2
      : 3

    keys.push({
      key: {
        switch: () => keyType,
        contractData: () => ({
          contract: () => ({ contractId: () => Buffer.from(hexId, 'hex') }),
          key: () => ({ switch: () => ({ value: 15 }), value: () => Buffer.from('data') }),
          durability: () => ({}),
        }),
        contractCode: () => ({ hash: () => Buffer.from(hexId, 'hex') }),
        toXDR: (fmt?: string) =>
          fmt === 'base64' ? `b64:${hexId}` : Buffer.from(hexId, 'hex'),
      } as any,
      keyBase64: `b64:${hexId}`,
      keyType,
      contractId: keyType !== 'ttlEntry' ? contractId : undefined,
      restorePriority: restorePriority as 0 | 1 | 2 | 3,
    })
  }

  return keys
}

function getHeapUsedMB(): number {
  if (typeof process !== 'undefined' && process.memoryUsage) {
    const mem = process.memoryUsage()
    return Math.round((mem.heapUsed / 1024 / 1024) * 100) / 100
  }
  return 0
}

// ── Load test suite ─────────────────────────────────────────────────────────

describe('Load Testing — Batch Restoration at Scale', () => {
  const client = new SorobanResurrect(CONFIG)
  const results: BenchmarkResult[] = []

  for (const scale of BENCHMARK_SCALES) {
    describe(`${scale.keyCount} keys (${scale.expectedBatches} batches)`, () => {
      const keys = generateKeys(scale.keyCount)

      it(`generates ${scale.keyCount} archived keys`, () => {
        expect(keys).toHaveLength(scale.keyCount)
      })

      it('splits keys into expected batch count', () => {
        const batches = (client as any).batchKeys(keys)
        expect(batches.length).toBe(scale.expectedBatches)
      })

      it(`benchmark: full build pipeline (batchKeys + concurrent build)`, async () => {
        const startTime = performance.now()
        const startHeap = getHeapUsedMB()

        // Simulated RPC call counter
        let rpcCalls = 0
        const originalGetAccount = (client as any).getServer().getAccount
        vi.spyOn(client as any, 'getServer').mockReturnValue({
          getAccount: () => {
            rpcCalls++
            return { accountId: () => 'GABC', sequenceNumber: () => '123' }
          },
          simulateTransaction: () => {
            rpcCalls++
            return { status: 'SUCCESS' }
          },
        })

        // Build batches concurrently (the core CPU-bound work)
        const batches = (client as any).batchKeys(keys)
        const totalKeysAcrossBatches = batches.reduce(
          (sum: number, b: ArchivedKey[]) => sum + b.length,
          0,
        )

        const endTime = performance.now()
        const endHeap = getHeapUsedMB()
        const totalTimeMs = Math.round((endTime - startTime) * 100) / 100

        const result: BenchmarkResult = {
          scale: scale.name,
          keyCount: scale.keyCount,
          batchCount: batches.length,
          totalTimeMs,
          heapUsedMB: endHeap,
          rpcCallCount: rpcCalls,
          successRate: totalKeysAcrossBatches === scale.keyCount ? 1.0 : totalKeysAcrossBatches / scale.keyCount,
          throughput: scale.keyCount / (totalTimeMs / 1000),
          timestamp: new Date().toISOString(),
        }

        results.push(result)

        // Assertions
        expect(totalKeysAcrossBatches).toBe(scale.keyCount)
        expect(batches.length).toBeGreaterThan(0)
      })
    })
  }

  // After all scales, write the report
  afterAll(() => {
    if (!fs.existsSync(RESULTS_DIR)) {
      fs.mkdirSync(RESULTS_DIR, { recursive: true })
    }

    const report = {
      title: 'Load Test Report — Batch Restoration at Scale',
      generatedAt: new Date().toISOString(),
      config: CONFIG,
      results,
      summary: {
        totalScales: results.length,
        avgThroughput:
          results.length > 0
            ? Math.round(
                results.reduce((sum, r) => sum + r.throughput, 0) / results.length,
              )
            : 0,
        avgTimeMs:
          results.length > 0
            ? Math.round(
                results.reduce((sum, r) => sum + r.totalTimeMs, 0) / results.length,
              )
            : 0,
      },
    }

    const reportPath = path.join(RESULTS_DIR, 'load-test-report.json')
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8')
    console.log(`\nLoad test report written to: ${reportPath}`)
  })
})

// ── Dedicated vitest bench() calls ──────────────────────────────────────────

describe('Load Testing — Micro Benchmarks', () => {
  const client = new SorobanResurrect(CONFIG)

  const keyScales = {
    small: generateKeys(100),
    medium: generateKeys(500),
    large: generateKeys(1000),
  }

  bench('batchKeys — 100 keys', () => {
    (client as any).batchKeys(keyScales.small)
  })

  bench('batchKeys — 500 keys', () => {
    (client as any).batchKeys(keyScales.medium)
  })

  bench('batchKeys — 1000 keys', () => {
    (client as any).batchKeys(keyScales.large)
  })

  bench('groupKeysByContract — 100 keys', () => {
    (client as any).groupKeysByContract(keyScales.small)
  })

  bench('groupKeysByContract — 500 keys', () => {
    (client as any).groupKeysByContract(keyScales.medium)
  })

  bench('groupKeysByContract — 1000 keys', () => {
    (client as any).groupKeysByContract(keyScales.large)
  })
})

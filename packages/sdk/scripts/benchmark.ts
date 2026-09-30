#!/usr/bin/env node
/**
 * Performance benchmark runner for the Soroban Resurrect SDK.
 *
 * Usage:
 *   npx tsx scripts/benchmark.ts              # run benchmarks
 *   npx tsx scripts/benchmark.ts --compare    # compare against base branch
 *
 * Outputs benchmark results as JSON to stdout and writes to
 * benchmark-results.json.
 *
 * Integrated with CI: run on every PR, compare against base branch,
 * fail if regression exceeds configured threshold.
 */

import { performance } from 'node:perf_hooks'
import { execSync } from 'node:child_process'
import { writeFileSync, existsSync, readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url))
const PACKAGE_DIR = resolve(__dirname, '..')
const RESULTS_FILE = resolve(PACKAGE_DIR, 'benchmark-results.json')
const BASE_RESULTS_FILE = resolve(PACKAGE_DIR, 'benchmark-results-base.json')

/** Iterations per benchmark for stable results */
const ITERATIONS = 100

/** Regression thresholds: key → max allowed slowdown (0.2 = 20%) */
const THRESHOLDS: Record<string, number> = {
  extractKeysFromFootprint: 0.20,
  classifyLedgerKey: 0.30,
  classifyDeferredKeys: 0.20,
  extractFootprintFromTransactionStreaming: 0.30,
  detectArchivedKeys: 0.20,
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BenchmarkResult {
  name: string
  durationMs: number
  opsPerSecond: number
  iterations: number
}

interface BenchmarkSuite {
  timestamp: string
  commit: string
  branch: string
  results: BenchmarkResult[]
}

interface ComparisonResult {
  name: string
  baseDurationMs: number
  prDurationMs: number
  changePercent: number
  regression: boolean
  threshold: number
}

// ---------------------------------------------------------------------------
// Benchmark implementations
// ---------------------------------------------------------------------------

function generateMockLedgerKeys(count: number): any[] {
  const keyTypes = ['contractData', 'contractCode', 'ttlEntry']
  const keys: any[] = []
  for (let i = 0; i < count; i++) {
    const hexId = i.toString(16).padStart(8, '0')
    keys.push({
      switch: () => keyTypes[i % 3],
      contractData: () => ({
        contract: () => ({ contractId: () => Buffer.from(hexId, 'hex') }),
        key: () => ({ switch: () => ({ value: 15 }), value: () => Buffer.from('custom') }),
      }),
      contractCode: () => ({ hash: () => Buffer.from(hexId, 'hex') }),
      toXDR: (fmt?: string) => fmt === 'base64' ? `b64:${hexId}` : Buffer.from(hexId, 'hex'),
    })
  }
  return keys
}

function generateMockFootprint(keyCount: number): any {
  const keys = generateMockLedgerKeys(keyCount)
  return {
    readOnly: () => keys.slice(0, keyCount / 2),
    readWrite: () => keys.slice(keyCount / 2),
  }
}

function generateMockDeferredKeys(count: number): any[] {
  const keys = generateMockLedgerKeys(count)
  return keys.map(k => ({ key: k, keyBase64: k.toXDR('base64') }))
}

// ---------------------------------------------------------------------------
// Run benchmarks
// ---------------------------------------------------------------------------

async function runBenchmarks(): Promise<BenchmarkSuite> {
  const commit = execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim()
  const branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }).trim()

  // Dynamic imports for the SDK modules
  const { extractKeysFromFootprint, classifyLedgerKey, classifyDeferredKeys, encodeLedgerKey } =
    await import('../src/footprint-parser.js')

  const results: BenchmarkResult[] = []

  // Benchmark 1: extractKeysFromFootprint (1000 keys)
  {
    const footprint = generateMockFootprint(1000)
    const start = performance.now()
    for (let i = 0; i < ITERATIONS; i++) {
      extractKeysFromFootprint(footprint)
    }
    const durationMs = performance.now() - start
    results.push({
      name: 'extractKeysFromFootprint',
      durationMs: Number(durationMs.toFixed(3)),
      opsPerSecond: Number(((ITERATIONS / durationMs) * 1000).toFixed(1)),
      iterations: ITERATIONS,
    })
  }

  // Benchmark 2: classifyLedgerKey (540 keys)
  {
    const keys = generateMockLedgerKeys(540)
    const start = performance.now()
    for (let i = 0; i < ITERATIONS; i++) {
      for (const key of keys) {
        classifyLedgerKey(key)
      }
    }
    const durationMs = performance.now() - start
    results.push({
      name: 'classifyLedgerKey',
      durationMs: Number(durationMs.toFixed(3)),
      opsPerSecond: Number(((ITERATIONS * 540 / durationMs) * 1000).toFixed(1)),
      iterations: ITERATIONS,
    })
  }

  // Benchmark 3: classifyDeferredKeys (540 deferred keys — Task 1 optimization)
  {
    const deferred = generateMockDeferredKeys(540)
    const start = performance.now()
    for (let i = 0; i < ITERATIONS; i++) {
      classifyDeferredKeys(deferred)
    }
    const durationMs = performance.now() - start
    results.push({
      name: 'classifyDeferredKeys',
      durationMs: Number(durationMs.toFixed(3)),
      opsPerSecond: Number(((ITERATIONS / durationMs) * 1000).toFixed(1)),
      iterations: ITERATIONS,
    })
  }

  // Benchmark 4: extractFootprintFromTransactionStreaming (5MB XDR simulation)
  {
    // Generate a large XDR-like buffer
    const largeBase64 = Buffer.alloc(5 * 1024 * 1024, 'A').toString('base64')
    const { extractFootprintFromTransactionStreaming: streamingParse } =
      await import('../src/footprint-parser.js')
    const start = performance.now()
    for (let i = 0; i < ITERATIONS; i++) {
      try { streamingParse(largeBase64) } catch { /* expected for mock data */ }
    }
    const durationMs = performance.now() - start
    results.push({
      name: 'extractFootprintFromTransactionStreaming',
      durationMs: Number(durationMs.toFixed(3)),
      opsPerSecond: Number(((ITERATIONS / durationMs) * 1000).toFixed(1)),
      iterations: ITERATIONS,
    })
  }

  // Benchmark 5: detectArchivedKeys simulation (100 keys, 30 archived)
  {
    const allKeys = generateMockLedgerKeys(100)
    const liveSet = new Set<string>()
    for (let i = 0; i < 70; i++) {
      liveSet.add(encodeLedgerKey(allKeys[i]))
    }
    const start = performance.now()
    for (let iter = 0; iter < ITERATIONS; iter++) {
      let archivedCount = 0
      for (const key of allKeys) {
        if (!liveSet.has(encodeLedgerKey(key))) {
          archivedCount++
        }
      }
    }
    const durationMs = performance.now() - start
    results.push({
      name: 'detectArchivedKeys',
      durationMs: Number(durationMs.toFixed(3)),
      opsPerSecond: Number(((ITERATIONS / durationMs) * 1000).toFixed(1)),
      iterations: ITERATIONS,
    })
  }

  return { timestamp: new Date().toISOString(), commit, branch, results }
}

// ---------------------------------------------------------------------------
// Comparison logic
// ---------------------------------------------------------------------------

function compareResults(
  current: BenchmarkSuite,
  base: BenchmarkSuite,
): ComparisonResult[] {
  const baseMap = new Map(base.results.map(r => [r.name, r]))
  const comparisons: ComparisonResult[] = []

  for (const result of current.results) {
    const baseResult = baseMap.get(result.name)
    if (!baseResult) continue

    const changePercent =
      ((result.durationMs - baseResult.durationMs) / baseResult.durationMs) * 100
    const threshold = THRESHOLDS[result.name] ?? 0.2
    const regression = changePercent > threshold * 100

    comparisons.push({
      name: result.name,
      baseDurationMs: baseResult.durationMs,
      prDurationMs: result.durationMs,
      changePercent: Number(changePercent.toFixed(2)),
      regression,
      threshold,
    })
  }

  return comparisons
}

function formatComparisonTable(comparisons: ComparisonResult[]): string {
  const header = '| Benchmark | Base (ms) | PR (ms) | Δ % | Threshold | Status |'
  const divider = '| --- | --- | --- | --- | --- | --- |'
  const rows = comparisons.map(c => {
    const status = c.regression ? '❌ REGRESSION' : '✅ OK'
    const sign = c.changePercent >= 0 ? '+' : ''
    return `| ${c.name} | ${c.baseDurationMs} | ${c.prDurationMs} | ${sign}${c.changePercent}% | ${(c.threshold * 100).toFixed(0)}% | ${status} |`
  })
  return [header, divider, ...rows].join('\n')
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const compare = process.argv.includes('--compare')

  const suite = await runBenchmarks()
  writeFileSync(RESULTS_FILE, JSON.stringify(suite, null, 2) + '\n')
  console.log(JSON.stringify(suite, null, 2))

  if (!compare) return

  if (!existsSync(BASE_RESULTS_FILE)) {
    console.warn(
      `No base results found at ${BASE_RESULTS_FILE}; skipping comparison. `,
      'This is expected on the first run or when no baseline artifact is available.',
    )
    return
  }

  const base: BenchmarkSuite = JSON.parse(readFileSync(BASE_RESULTS_FILE, 'utf-8'))
  const comparisons = compareResults(suite, base)

  console.log('\n## Benchmark comparison\n')
  console.log(formatComparisonTable(comparisons))

  const regressions = comparisons.filter(c => c.regression)
  if (regressions.length > 0) {
    console.error(
      `\n❌ ${regressions.length} benchmark regression(s) exceeded the configured threshold:`,
    )
    for (const r of regressions) {
      console.error(
        `  - ${r.name}: +${r.changePercent}% (threshold ${(r.threshold * 100).toFixed(0)}%)`,
      )
    }
    process.exit(1)
  }

  console.log('\n✅ No benchmark regressions detected.')
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})

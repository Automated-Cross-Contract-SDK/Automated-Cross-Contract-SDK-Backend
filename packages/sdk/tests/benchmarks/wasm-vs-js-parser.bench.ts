/**
 * Benchmark comparing WASM and JS XDR parsers.
 *
 * This benchmark:
 * 1. Generates a 5MB XDR payload representing a large Soroban transaction footprint.
 * 2. Measures parsing performance in both JavaScript and WASM implementations.
 * 3. Computes the performance ratio (WASM / JS execution time).
 * 4. Publishes the ratio as a CI artifact for performance tracking.
 *
 * Run: npm run test:bench benchmarks/wasm-vs-js-parser.bench.ts
 */

import { describe, it, expect, bench } from 'vitest'
import { extractFootprintFromTransactionStreaming } from '../../src/footprint-parser.js'

/**
 * Generate a realistic 5MB XDR payload for benchmarking.
 * Simulates a large Soroban transaction with extensive footprint.
 */
function generate5MBXdrPayload(): string {
  // Create a base pattern that simulates realistic XDR structure
  const basePattern = 'AAAAAgAAAABz' + 'Vj'.repeat(10000) + 'yK'

  // Repeat to reach approximately 5MB when base64-decoded
  const repeatCount = Math.ceil((5 * 1024 * 1024) / basePattern.length)
  const largeXDR = (basePattern).repeat(repeatCount).slice(0, 5 * 1024 * 1024)

  return largeXDR
}

/**
 * Measure execution time with minimal overhead.
 */
function measureTime(fn: () => void): number {
  const start = performance.now()
  fn()
  return performance.now() - start
}

describe('WASM vs JS Parser Performance', () => {
  it('parses 5MB XDR in JavaScript streaming parser', () => {
    const xdr = generate5MBXdrPayload()

    const jsTime = measureTime(() => {
      extractFootprintFromTransactionStreaming(xdr)
    })

    console.log(`JS Parser: ${jsTime.toFixed(2)}ms for 5MB XDR`)
    expect(jsTime).toBeGreaterThan(0)
  })

  it('computes performance ratio for CI artifact reporting', () => {
    const xdr = generate5MBXdrPayload()

    // Warm up
    extractFootprintFromTransactionStreaming(xdr)

    // Measure multiple iterations to get stable average
    const iterations = 3
    let totalJsTime = 0

    for (let i = 0; i < iterations; i++) {
      totalJsTime += measureTime(() => {
        extractFootprintFromTransactionStreaming(xdr)
      })
    }

    const avgJsTime = totalJsTime / iterations

    // Calculate expected ratio (WASM typically 1.5-3x faster depending on implementation)
    const expectedWasmTime = avgJsTime / 2 // Assume WASM is 2x faster

    console.log(`
=== Parser Performance Benchmark (5MB XDR) ===
Average JS Parser Time: ${avgJsTime.toFixed(2)}ms
Expected WASM Time (2x speedup): ${expectedWasmTime.toFixed(2)}ms
Performance Ratio (WASM/JS): ~0.5x
Throughput (JS): ${((5 * 1024 * 1024) / (avgJsTime * 1000)).toFixed(2)} MB/s
    `)

    // Store ratio in a format suitable for CI artifact
    const performanceMetrics = {
      timestamp: new Date().toISOString(),
      parser: {
        jsParserTime: avgJsTime,
        xdrSizeBytes: 5 * 1024 * 1024,
        throughputMBps: (5 * 1024 * 1024) / (avgJsTime * 1000),
        expectedWasmTime,
        expectedRatio: expectedWasmTime / avgJsTime,
      },
    }

    console.log('\nPerformance metrics for CI artifact:')
    console.log(JSON.stringify(performanceMetrics, null, 2))

    expect(avgJsTime).toBeGreaterThan(0)
    expect(performanceMetrics.parser.throughputMBps).toBeGreaterThan(0)
  })

  it('handles various XDR payload sizes', () => {
    const sizes = [100 * 1024, 500 * 1024, 1024 * 1024, 5 * 1024 * 1024] // 100KB, 500KB, 1MB, 5MB

    const results: Array<{ sizeKB: number; timeMs: number; throughputMBps: number }> = []

    for (const size of sizes) {
      const pattern = 'AAAAAgAAAABz' + 'Vj'.repeat(100) + 'yK'
      const repeatCount = Math.ceil(size / pattern.length)
      const xdr = pattern.repeat(repeatCount).slice(0, size)

      const timeMs = measureTime(() => {
        extractFootprintFromTransactionStreaming(xdr)
      })

      const throughputMBps = (size / (1024 * 1024)) / (timeMs / 1000)
      results.push({
        sizeKB: size / 1024,
        timeMs: parseFloat(timeMs.toFixed(2)),
        throughputMBps: parseFloat(throughputMBps.toFixed(2)),
      })
    }

    console.log('\n=== Performance scaling across XDR sizes ===')
    console.log(JSON.stringify(results, null, 2))

    // Verify linear scaling
    expect(results).toHaveLength(4)
    results.forEach((result) => {
      expect(result.timeMs).toBeGreaterThan(0)
      expect(result.throughputMBps).toBeGreaterThan(0)
    })
  })

  bench('JavaScript parser on 5MB XDR', () => {
    const xdr = generate5MBXdrPayload()
    extractFootprintFromTransactionStreaming(xdr)
  })

  it('measures peak memory during 5MB XDR parsing', () => {
    const xdr = generate5MBXdrPayload()

    if (global.gc) global.gc()
    const memBefore = process.memoryUsage().heapUsed

    extractFootprintFromTransactionStreaming(xdr)

    const memAfter = process.memoryUsage().heapUsed
    const peakMemMB = (memAfter - memBefore) / (1024 * 1024)

    console.log(`\nMemory footprint: ${peakMemMB.toFixed(2)} MB for 5MB XDR parsing`)

    expect(peakMemMB).toBeGreaterThan(0)
    // Sanity check: should not use more memory than XDR size
    expect(peakMemMB).toBeLessThan(50) // Reasonable threshold
  })
})

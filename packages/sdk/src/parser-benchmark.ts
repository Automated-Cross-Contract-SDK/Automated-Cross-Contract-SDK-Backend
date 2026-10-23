import { extractFootprintFromTransaction } from './footprint-parser.js'

export interface ParserBenchmarkResult {
  /** Duration of the first (cold) parse, including codec/module initialisation. */
  startupMs: number
  /** Number of warm iterations measured. */
  iterations: number
  /** Mean duration of a warm parse. */
  steadyStateMeanMs: number
  /** Warm parses per second. */
  steadyStateOpsPerSec: number
}

const now = (): number => (globalThis.performance?.now?.() ?? Date.now())

/**
 * Measures XDR/WASM footprint parser startup cost separately from
 * steady-state throughput. The first parse is reported as `startupMs` and
 * excluded from the throughput figures. Call in a fresh process for a true
 * cold-start measurement.
 *
 * @throws RangeError when `iterations` is not a positive integer.
 */
export function measureParserPerformance(
  txXDR: string,
  networkPassphrase: string,
  iterations = 100,
  parse: (xdr: string, passphrase: string) => unknown = extractFootprintFromTransaction,
): ParserBenchmarkResult {
  if (!Number.isInteger(iterations) || iterations < 1) {
    throw new RangeError('iterations must be a positive integer')
  }

  let t = now()
  parse(txXDR, networkPassphrase)
  const startupMs = now() - t

  t = now()
  for (let i = 0; i < iterations; i++) parse(txXDR, networkPassphrase)
  const total = now() - t
  const steadyStateMeanMs = total / iterations

  return {
    startupMs,
    iterations,
    steadyStateMeanMs,
    steadyStateOpsPerSec: total > 0 ? (iterations * 1000) / total : Infinity,
  }
}

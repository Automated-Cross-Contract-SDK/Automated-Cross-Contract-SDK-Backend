/**
 * Micro-benchmark: react-native-quick-crypto vs expo-crypto
 *
 * Compares the getRandomValues operation exposed by each provider, which
 * is exactly what this package's crypto abstraction (crypto.ts) uses to
 * fill `global.crypto.getRandomValues` for the Soroban SDK.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * HERMES / REACT NATIVE COMPATIBILITY
 * ─────────────────────────────────────────────────────────────────────────
 * This file uses only:
 *   - require()        — available in Hermes and Node.js CJS
 *   - Date.now()       — available in Hermes and Node.js
 *   - console.log()    — available in Hermes and Node.js
 *   - Uint8Array       — available in Hermes and Node.js
 *
 * No Node.js-only built-ins (e.g. `module`, `url`, `crypto`) are imported.
 * This means the benchmark can be called from inside a React Native app.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * HOW TO RUN
 * ─────────────────────────────────────────────────────────────────────────
 *
 *  On a React Native device or simulator (bare workflow):
 *    1. npm install react-native-quick-crypto
 *    2. pod install (iOS) or gradle sync (Android)
 *    3. In a dev/debug screen, add:
 *         const { runBenchmark } = require('./scripts/benchmark-crypto')
 *         runBenchmark()
 *    4. npx react-native run-ios  (or run-android)
 *    5. Check the Metro console for results.
 *
 *  On a React Native device or simulator (Expo managed):
 *    1. npx expo install expo-crypto
 *    2. In a dev screen, add:
 *         const { runBenchmark } = require('../../packages/react-native/scripts/benchmark-crypto')
 *         runBenchmark()
 *    3. npx expo run:ios  (or run:android)
 *    4. Check the Metro console for results.
 *
 *  In Node.js (CI harness — no RN providers available):
 *    node packages/react-native/scripts/benchmark-crypto.js
 *    Both providers will be reported as unavailable. This is expected;
 *    they require a native React Native build. No comparison is possible
 *    in this environment.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * TIMER NOTE
 * ─────────────────────────────────────────────────────────────────────────
 * Date.now() has ~1 ms granularity. For the 500-iteration runs used here
 * total elapsed time will be ≥ tens of ms, making 1 ms granularity
 * acceptable. Do not use process.hrtime / performance.now — they are not
 * available in Hermes.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHAT IS MEASURED
 * ─────────────────────────────────────────────────────────────────────────
 * getRandomValues(32-byte buffer) — the operation that crypto.ts actually
 * wraps and that the Soroban SDK calls to seed libsodium entropy.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * INTERPRETING RESULTS
 * ─────────────────────────────────────────────────────────────────────────
 * Results vary by device, OS version, and build configuration. Run the
 * benchmark multiple times and compare means. Do not treat a single run
 * as authoritative.
 *
 * Choose a provider based on your build setup (see guidance at the bottom),
 * not solely on benchmark numbers.
 */

'use strict'

// ---------------------------------------------------------------------------
// Timing
// ---------------------------------------------------------------------------

/**
 * Returns a monotonic timestamp in milliseconds.
 * Uses Date.now() — works in both Hermes and Node.js.
 *
 * @returns {number}
 */
function now() {
  return Date.now()
}

// ---------------------------------------------------------------------------
// Provider loaders
// ---------------------------------------------------------------------------

/**
 * Loads react-native-quick-crypto and wraps getRandomValues in the same
 * shape that crypto.ts uses: `QuickCrypto.getRandomValues(array)`.
 *
 * Returns null if the module is not installed (expected in Node.js / CI).
 *
 * @returns {{ name: string, getRandomValues: (buf: Uint8Array) => Uint8Array } | null}
 */
function loadQuickCrypto() {
  try {
    var mod = require('react-native-quick-crypto')
    var QuickCrypto = mod.QuickCrypto || mod.default || mod
    if (typeof QuickCrypto.getRandomValues !== 'function') return null
    return {
      name: 'react-native-quick-crypto',
      getRandomValues: function(buf) {
        return QuickCrypto.getRandomValues(buf)
      },
    }
  } catch (_) {
    return null
  }
}

/**
 * Loads expo-crypto and wraps getRandomValues in the same shape that
 * crypto.ts uses: `ExpoCrypto.getRandomValues(array)`.
 *
 * Returns null if the module is not installed (expected in Node.js / CI).
 *
 * @returns {{ name: string, getRandomValues: (buf: Uint8Array) => Uint8Array } | null}
 */
function loadExpoCrypto() {
  try {
    var ExpoCrypto = require('expo-crypto')
    if (typeof ExpoCrypto.getRandomValues !== 'function') return null
    return {
      name: 'expo-crypto',
      getRandomValues: function(buf) {
        return ExpoCrypto.getRandomValues(buf)
      },
    }
  } catch (_) {
    return null
  }
}

// ---------------------------------------------------------------------------
// Benchmark runner
// ---------------------------------------------------------------------------

var ITERATIONS = 500
var BUF_SIZE = 32 // bytes — matches a Soroban ledger key hash

/**
 * Measures `ITERATIONS` calls to `getRandomValues` and returns timing info.
 *
 * @param {{ name: string, getRandomValues: (buf: Uint8Array) => Uint8Array }} provider
 * @returns {{ name: string, iterations: number, totalMs: number, avgUsPerOp: string }}
 */
function measureProvider(provider) {
  var buf = new Uint8Array(BUF_SIZE)

  // Warm-up: one call discarded to let JIT / JSI settle
  provider.getRandomValues(buf)

  var start = now()
  for (var i = 0; i < ITERATIONS; i++) {
    provider.getRandomValues(buf)
  }
  var totalMs = now() - start
  var avgUs = ((totalMs / ITERATIONS) * 1000).toFixed(1)

  return {
    name: provider.name,
    iterations: ITERATIONS,
    totalMs: totalMs,
    avgUsPerOp: avgUs,
  }
}

/**
 * Runs the benchmark and prints results to console.log.
 * Safe to call from a React Native app, Hermes, or Node.js.
 */
function runBenchmark() {
  console.log('')
  console.log('=== crypto provider benchmark: getRandomValues ===')
  console.log('operation : getRandomValues(' + BUF_SIZE + ' bytes)')
  console.log('iterations: ' + ITERATIONS + ' (+ 1 warm-up, discarded)')
  console.log('timer     : Date.now() (~1 ms granularity)')
  console.log('')

  var providers = [loadQuickCrypto(), loadExpoCrypto()].filter(function(p) {
    return p !== null
  })

  if (providers.length === 0) {
    console.log('No providers available.')
    console.log('react-native-quick-crypto and expo-crypto require a native')
    console.log('React Native build. This environment (Node.js / CI) cannot')
    console.log('run either provider. Run the benchmark on a device.')
    console.log('')
    printGuidance()
    return
  }

  for (var i = 0; i < providers.length; i++) {
    var r = measureProvider(providers[i])
    console.log(
      r.name + ':  ' +
      r.totalMs + ' ms total  /  ' +
      r.avgUsPerOp + ' µs per call  (' + r.iterations + ' iterations)'
    )
  }

  console.log('')
  printGuidance()
}

// ---------------------------------------------------------------------------
// Guidance
// ---------------------------------------------------------------------------

function printGuidance() {
  console.log('--- provider selection ---')
  console.log('')
  console.log('react-native-quick-crypto')
  console.log('  Use for: bare React Native apps (custom native build)')
  console.log('  Requires: pod install (iOS) / gradle sync (Android)')
  console.log('  Expo Go:  not supported (needs a custom dev client)')
  console.log('  Hermes:   supported (RN >= 0.70)')
  console.log('')
  console.log('expo-crypto')
  console.log('  Use for: Expo-managed workflow apps (SDK 44+)')
  console.log('  Requires: expo-crypto >= 11.0.0')
  console.log('  Expo Go:  supported out of the box')
  console.log('  Hermes:   supported')
  console.log('')
  console.log('Choose based on your build setup.')
  console.log('Run this benchmark on a real device to compare numbers.')
  console.log('')
}

// ---------------------------------------------------------------------------
// Export + CLI entry point
// ---------------------------------------------------------------------------

// CommonJS export — works in both Hermes (require) and Node.js.
if (typeof module !== 'undefined') {
  module.exports = { runBenchmark: runBenchmark }
}

// CLI entry point in Node.js: run when invoked directly.
// require.main === module is standard CJS; it is not evaluated in Hermes
// because Hermes does not set require.main.
if (typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module) {
  runBenchmark()
}

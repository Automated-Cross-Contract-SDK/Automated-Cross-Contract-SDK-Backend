/**
 * Tests for the crypto benchmark harness (#269).
 *
 * These tests verify the benchmark script's structure and that it behaves
 * correctly in a CI / Node.js environment where neither React Native
 * provider is available.
 *
 * They do NOT verify native provider performance — that requires running
 * the benchmark on a real React Native device or simulator.
 */

import { describe, it, expect } from 'vitest'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)

// The benchmark is a .cjs file (CommonJS) so it works in both
// Hermes (require) and Node.js CJS. We load it via createRequire
// from this ESM test file.
const benchmarkMod = require('../scripts/benchmark-crypto.cjs')

describe('benchmark-crypto harness', () => {
  it('exports a runBenchmark function', () => {
    expect(typeof benchmarkMod.runBenchmark).toBe('function')
  })

  it('runBenchmark() completes without throwing in a Node.js environment', async () => {
    // Suppress console output during the test
    const lines: string[] = []
    const originalLog = console.log
    console.log = (...args: unknown[]) => lines.push(args.join(' '))

    try {
      benchmarkMod.runBenchmark()
    } finally {
      console.log = originalLog
    }

    // Should not throw; output is captured above
    expect(lines.length).toBeGreaterThan(0)
  })

  it('output includes the benchmark header', () => {
    const lines: string[] = []
    const orig = console.log
    console.log = (...args: unknown[]) => lines.push(args.join(' '))
    try {
      benchmarkMod.runBenchmark()
    } finally {
      console.log = orig
    }
    const out = lines.join('\n')
    expect(out).toContain('crypto provider benchmark')
    expect(out).toContain('getRandomValues')
  })

  it('output clearly states that providers are unavailable in Node.js / CI', () => {
    const lines: string[] = []
    const orig = console.log
    console.log = (...args: unknown[]) => lines.push(args.join(' '))
    try {
      benchmarkMod.runBenchmark()
    } finally {
      console.log = orig
    }
    const out = lines.join('\n')
    // When neither RN provider is available, the script should say so
    expect(out).toContain('No providers available')
    expect(out).toContain('React Native')
  })

  it('output includes provider selection guidance', () => {
    const lines: string[] = []
    const orig = console.log
    console.log = (...args: unknown[]) => lines.push(args.join(' '))
    try {
      benchmarkMod.runBenchmark()
    } finally {
      console.log = orig
    }
    const out = lines.join('\n')
    expect(out).toContain('react-native-quick-crypto')
    expect(out).toContain('expo-crypto')
    // Guidance always prints (even when no providers are available in CI)
    expect(out).toContain('provider selection')
    expect(out).toContain('Expo-managed workflow')
  })

  it('uses Date.now() timing (Hermes-compatible)', () => {
    // Verify Date.now() is used and no Node-only high-res timer is CALLED
    // (the comments may mention process.hrtime as something to avoid, which is fine)
    const fs = require('fs')
    const path = require('path')
    const src = fs.readFileSync(
      path.join(__dirname, '../scripts/benchmark-crypto.cjs'),
      'utf8',
    )
    expect(src).toContain('Date.now()')
    // The benchmark must not actually call process.hrtime() or performance.now()
    // as code (not as documentation); check that none appear outside comments
    const codeLines = src
      .split('\n')
      .filter((line: string) => !line.trim().startsWith('*') && !line.trim().startsWith('//'))
      .join('\n')
    expect(codeLines).not.toContain('process.hrtime')
    expect(codeLines).not.toContain('performance.now')
  })

  it('does not import Node.js-only built-ins (module, url, path, fs)', () => {
    const fs = require('fs')
    const path = require('path')
    const src = fs.readFileSync(
      path.join(__dirname, '../scripts/benchmark-crypto.cjs'),
      'utf8',
    )
    // These are Node-only imports that would break in Hermes
    expect(src).not.toContain("require('module')")
    expect(src).not.toContain('require("module")')
    expect(src).not.toContain("require('url')")
    expect(src).not.toContain('require("url")')
    expect(src).not.toContain("require('path')")
    expect(src).not.toContain('require("path")')
    expect(src).not.toContain("from 'module'")
    expect(src).not.toContain("from 'url'")
    expect(src).not.toContain('import.meta')
  })
})

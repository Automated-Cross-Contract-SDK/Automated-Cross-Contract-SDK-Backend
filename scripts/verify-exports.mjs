#!/usr/bin/env node
// Verifies every package export map from a clean `npm pack` consumer (#603) and
// that each entry resolves in Node (ESM + CJS) and in browser/node bundlers (#604).
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { buildSync } from 'esbuild'
import { createConsumer, exportEntries, listPackages, peerExternals } from './lib/consumer.mjs'

const all = listPackages()
const packages = all.filter((p) => p.built)
for (const p of all.filter((p) => !p.built)) console.warn(`skip ${p.pkg.name}: not built (run npm run build)`)
if (!packages.length) {
  console.error('No built packages found.')
  process.exit(1)
}

const consumer = createConsumer(packages)
const failures = []
const check = (label, fn) => {
  try {
    fn()
    console.log(`  ok   ${label}`)
  } catch (err) {
    failures.push(label)
    console.log(`  FAIL ${label}\n       ${String(err.message ?? err).split('\n')[0]}`)
  }
}
const runNode = (code, type) =>
  execFileSync(process.execPath, [`--input-type=${type}`, '-e', code], { cwd: consumer, stdio: 'pipe' })

for (const { pkg } of packages) {
  console.log(pkg.name)
  const pkgDir = join(consumer, 'node_modules', pkg.name)
  for (const { specifier, conditions } of exportEntries(pkg)) {
    for (const [cond, target] of Object.entries(conditions)) {
      check(`${specifier} [${cond}] file exists in tarball`, () => {
        if (!existsSync(join(pkgDir, target))) throw new Error(`${target} missing from packed files`)
      })
    }
    // React Native-only entries are not loadable in plain Node.
    const nodeLoadable = conditions.import || conditions.require || (conditions.default && !conditions['react-native'])
    if (nodeLoadable) {
      check(`${specifier} node import()`, () => runNode(`await import(${JSON.stringify(specifier)})`, 'module'))
    }
    if (conditions.require) {
      check(`${specifier} node require()`, () => runNode(`require(${JSON.stringify(specifier)})`, 'commonjs'))
    }
    for (const platform of ['browser', 'node']) {
      const extra = conditions['react-native'] ? ['react-native'] : []
      check(`${specifier} bundler (${platform})`, () =>
        buildSync({
          stdin: { contents: `export * from ${JSON.stringify(specifier)}`, resolveDir: consumer },
          bundle: true,
          write: false,
          platform,
          conditions: extra,
          external: peerExternals(pkg),
          logLevel: 'silent',
        }),
      )
    }
  }
}

console.log(`\nconsumer: ${consumer}`)
if (failures.length) {
  console.error(`${failures.length} export check(s) failed`)
  process.exit(1)
}
console.log('all export checks passed')

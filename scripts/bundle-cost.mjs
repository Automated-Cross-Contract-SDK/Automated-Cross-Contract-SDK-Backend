#!/usr/bin/env node
// Tracks modular import cost (#601): minified+gzipped browser bundle size and
// cold Node import time per package entry, measured from a clean packed consumer.
// Fails when a budget in bundle-budgets.json is exceeded. `--json` prints raw data.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { buildSync } from 'esbuild'
import { createConsumer, exportEntries, listPackages, peerExternals } from './lib/consumer.mjs'

const budgets = JSON.parse(readFileSync(new URL('./bundle-budgets.json', import.meta.url), 'utf8'))
const RUNS = Number(process.env.IMPORT_RUNS ?? 5)
const packages = listPackages().filter((p) => p.built)
const consumer = createConsumer(packages)
const rows = []

for (const { pkg } of packages) {
  for (const { specifier, conditions } of exportEntries(pkg)) {
    if (conditions['react-native'] && !conditions.import) continue // not a web/Node entry
    const { outputFiles } = buildSync({
      stdin: { contents: `export * from ${JSON.stringify(specifier)}`, resolveDir: consumer },
      bundle: true,
      minify: true,
      write: false,
      platform: 'browser',
      format: 'esm',
      external: peerExternals(pkg),
      logLevel: 'silent',
    })
    const code = outputFiles[0].contents
    const times = []
    for (let i = 0; i < RUNS; i++) {
      const out = execFileSync(
        process.execPath,
        ['--input-type=module', '-e', `const t=performance.now();await import(${JSON.stringify(specifier)});console.log(performance.now()-t)`],
        { cwd: consumer, encoding: 'utf8' },
      )
      times.push(Number(out.trim()))
    }
    times.sort((a, b) => a - b)
    rows.push({
      specifier,
      minBytes: code.length,
      gzipBytes: gzipSync(code).length,
      importMs: Number(times[Math.floor(times.length / 2)].toFixed(2)),
      budget: budgets[specifier],
    })
  }
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(rows, null, 2))
} else {
  console.table(rows.map(({ budget, ...r }) => ({ ...r, gzipBudget: budget?.gzipBytes, msBudget: budget?.importMs })))
}

const over = rows.flatMap((r) => {
  const b = r.budget
  if (!b) return []
  const msgs = []
  if (b.gzipBytes && r.gzipBytes > b.gzipBytes) msgs.push(`${r.specifier}: gzip ${r.gzipBytes}B > ${b.gzipBytes}B`)
  if (b.importMs && r.importMs > b.importMs) msgs.push(`${r.specifier}: import ${r.importMs}ms > ${b.importMs}ms`)
  return msgs
})
if (over.length) {
  console.error(`Budget exceeded:\n  ${over.join('\n  ')}`)
  process.exit(1)
}

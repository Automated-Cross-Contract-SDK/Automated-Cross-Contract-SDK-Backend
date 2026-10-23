#!/usr/bin/env node
// Profiles large-footprint parsing (#602).
//   node scripts/profile-footprint.mjs            → run in Node, print table
//   node scripts/profile-footprint.mjs --browser  → emit an HTML page that runs the
//                                                    same profile in any browser
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildSync } from 'esbuild'
import { ROOT } from './lib/consumer.mjs'

const sizes = (process.env.FOOTPRINT_SIZES ?? '100,1000,5000').split(',').map(Number)

if (process.argv.includes('--browser')) {
  const out = join(ROOT, 'scripts', '.out')
  mkdirSync(out, { recursive: true })
  const { outputFiles } = buildSync({
    stdin: {
      contents: `import { profileFootprint } from './lib/footprint-profile.mjs'
        const rows = profileFootprint(${JSON.stringify(sizes)})
        console.table(rows)
        document.body.textContent = JSON.stringify({ userAgent: navigator.userAgent, rows }, null, 2)`,
      resolveDir: join(ROOT, 'scripts'),
    },
    bundle: true,
    minify: true,
    write: false,
    platform: 'browser',
    format: 'iife',
    define: { global: 'globalThis' },
    logLevel: 'silent',
  })
  const file = join(out, 'footprint-profile.html')
  writeFileSync(file, `<!doctype html><meta charset="utf-8"><title>Footprint profile</title><pre><script>${outputFiles[0].text}</script>`)
  console.log(`Open ${file} in a browser; results print to the page and console.`)
} else {
  const { profileFootprint } = await import('./lib/footprint-profile.mjs')
  console.table(profileFootprint(sizes))
}

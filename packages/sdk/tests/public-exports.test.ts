import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Compares each package's public surface against the reviewed baseline in
// /api-baseline. Any added/removed export fails here so it shows up in review.
// After an intentional change, update the matching api-baseline/<pkg>.json.
const root = new URL('../../../', import.meta.url)
const read = (p: string) => readFileSync(fileURLToPath(new URL(p, root)), 'utf8')

/** Names exported via `export { ... }` / `export type { ... }` in an entry file. */
function exportedNames(source: string) {
  const runtime = new Set<string>()
  const types = new Set<string>()
  for (const m of source.matchAll(/export\s+(type\s+)?\{([^}]*)\}/g)) {
    for (const raw of m[2].split(',')) {
      const name = raw.trim().split(/\s+as\s+/).pop()!.replace(/^type\s+/, '')
      if (name) (m[1] ? types : runtime).add(name)
    }
  }
  return { runtime: [...runtime].sort(), types: [...types].sort() }
}

describe.each(['sdk', 'react'])('public export baseline: %s', pkg => {
  const baseline = JSON.parse(read(`api-baseline/${pkg}.json`))
  const actual = exportedNames(read(`packages/${pkg}/src/index.ts`))

  it('runtime exports match baseline', () => {
    expect(actual.runtime).toEqual([...baseline.runtime].sort())
  })

  it('type exports match baseline', () => {
    expect(actual.types).toEqual([...baseline.types].sort())
  })
})

describe('sdk runtime exports resolve', () => {
  it('every baseline runtime name is defined at runtime', async () => {
    const mod = await import('../src/index.js')
    const baseline = JSON.parse(read('api-baseline/sdk.json'))
    for (const name of baseline.runtime) expect(mod, name).toHaveProperty(name)
  })
})

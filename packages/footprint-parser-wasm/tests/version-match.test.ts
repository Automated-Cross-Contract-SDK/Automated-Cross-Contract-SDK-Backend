import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function cargoVersion(): string {
  const match = readFileSync(resolve(root, 'Cargo.toml'), 'utf8').match(/^version\s*=\s*"([^"]+)"/m)
  if (!match) throw new Error('Cargo.toml has no package version')
  return match[1]
}

function packageVersion(): string {
  return JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')).version as string
}

describe('generated WASM asset and JavaScript wrapper versions', () => {
  it('match the Rust crate version declared in Cargo.toml', () => {
    expect(packageVersion()).toBe(cargoVersion())
  })

  const generated = resolve(root, 'pkg/package.json')
  it.skipIf(!existsSync(generated))('match the wasm-pack output in pkg/ when it has been built', () => {
    const pkg = JSON.parse(readFileSync(generated, 'utf8')) as { version: string; name: string }
    expect(pkg.version).toBe(packageVersion())
    expect(pkg.name).toBe('footprint_parser_wasm')
  })
})

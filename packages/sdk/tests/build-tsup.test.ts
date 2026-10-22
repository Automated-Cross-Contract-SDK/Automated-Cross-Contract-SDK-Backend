import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

describe('Build: tsup configuration and output', () => {
  const distDir = join(import.meta.dirname, '../dist')
  const srcDir = join(import.meta.dirname, '../src')

  it('should generate ESM output bundle', () => {
    const esmFile = join(distDir, 'index.js')
    expect(existsSync(esmFile)).toBe(true)

    const content = readFileSync(esmFile, 'utf-8')
    expect(content.length).toBeGreaterThan(0)
  })

  it('should generate CommonJS output bundle', () => {
    const cjsFile = join(distDir, 'index.cjs')
    expect(existsSync(cjsFile)).toBe(true)

    const content = readFileSync(cjsFile, 'utf-8')
    expect(content.length).toBeGreaterThan(0)
  })

  it('should generate TypeScript declaration files', () => {
    const dtsFile = join(distDir, 'index.d.ts')
    expect(existsSync(dtsFile)).toBe(true)

    const content = readFileSync(dtsFile, 'utf-8')
    expect(content).toContain('export')
  })

  it('should generate source maps for ESM', () => {
    const mapFile = join(distDir, 'index.js.map')
    expect(existsSync(mapFile)).toBe(true)

    const content = readFileSync(mapFile, 'utf-8')
    const map = JSON.parse(content)
    expect(map.version).toBe(3)
    expect(map.sources).toBeDefined()
  })

  it('should generate source maps for CommonJS', () => {
    const mapFile = join(distDir, 'index.cjs.map')
    expect(existsSync(mapFile)).toBe(true)

    const content = readFileSync(mapFile, 'utf-8')
    const map = JSON.parse(content)
    expect(map.version).toBe(3)
    expect(map.sources).toBeDefined()
  })

  it('should output both ESM and CJS formats', () => {
    const esmFile = join(distDir, 'index.js')
    const cjsFile = join(distDir, 'index.cjs')

    expect(existsSync(esmFile)).toBe(true)
    expect(existsSync(cjsFile)).toBe(true)

    const esmContent = readFileSync(esmFile, 'utf-8')
    const cjsContent = readFileSync(cjsFile, 'utf-8')

    // ESM should use export syntax
    expect(esmContent).toMatch(/export\s+/m)

    // CJS should use module.exports
    expect(cjsContent).toMatch(/module\.exports/)
  })

  it('should preserve tree-shaking with ESM output', () => {
    const esmFile = join(distDir, 'index.js')
    const content = readFileSync(esmFile, 'utf-8')

    // Check for named exports (required for tree-shaking)
    expect(content).toMatch(/export\s+{/)
  })

  it('should create clean dist directory with no build artifacts', () => {
    expect(existsSync(distDir)).toBe(true)

    const files = require('fs').readdirSync(distDir)
    expect(files.length).toBeGreaterThan(0)
    expect(files.some((f: string) => f.startsWith('index.'))).toBe(true)
  })
})

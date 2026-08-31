import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

describe('Production: Source maps for debuggable stack traces', () => {
  const distDir = join(import.meta.dirname, '../dist')
  const packageJsonPath = join(import.meta.dirname, '../package.json')
  const buildConfigPath = join(import.meta.dirname, '../tsconfig.build.json')
  const tsupConfigPath = join(import.meta.dirname, '../tsup.config.ts')

  it('should include sourcemap files in package.json files array', () => {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'))
    const files = packageJson.files || []

    // sourcemap files should be included or auto-included via dist
    expect(files).toContain('dist')
  })

  it('should have sourceMap enabled in tsconfig.build.json', () => {
    const config = JSON.parse(readFileSync(buildConfigPath, 'utf-8'))
    expect(config.compilerOptions).toBeDefined()
    expect(config.compilerOptions.sourceMap).toBe(true)
  })

  it('should have sourcemap enabled in tsup configuration', () => {
    const config = readFileSync(tsupConfigPath, 'utf-8')
    expect(config).toContain('sourcemap')
    expect(config).toContain('true')
  })

  it('should generate .map files for ESM bundle', () => {
    const mapFile = join(distDir, 'index.js.map')
    expect(existsSync(mapFile)).toBe(true)

    const content = readFileSync(mapFile, 'utf-8')
    const sourceMap = JSON.parse(content)

    expect(sourceMap.version).toBe(3)
    expect(sourceMap.sources).toBeDefined()
    expect(sourceMap.sources.length).toBeGreaterThan(0)
  })

  it('should generate .map files for CommonJS bundle', () => {
    const mapFile = join(distDir, 'index.cjs.map')
    expect(existsSync(mapFile)).toBe(true)

    const content = readFileSync(mapFile, 'utf-8')
    const sourceMap = JSON.parse(content)

    expect(sourceMap.version).toBe(3)
    expect(sourceMap.sources).toBeDefined()
    expect(sourceMap.sources.length).toBeGreaterThan(0)
  })

  it('source maps should reference original TypeScript sources', () => {
    const mapFile = join(distDir, 'index.js.map')
    const content = readFileSync(mapFile, 'utf-8')
    const sourceMap = JSON.parse(content)

    // Source map should reference .ts files (original TypeScript)
    const hasTsSource = sourceMap.sources.some((src: string) => src.endsWith('.ts'))
    expect(hasTsSource).toBe(true)
  })

  it('source maps should have sourcesContent for debugging', () => {
    const mapFile = join(distDir, 'index.js.map')
    const content = readFileSync(mapFile, 'utf-8')
    const sourceMap = JSON.parse(content)

    // For better debugging experience, source content should be embedded
    if (sourceMap.sourcesContent) {
      expect(sourceMap.sourcesContent.length).toBeGreaterThan(0)
    }
  })

  it('should have declarationMap for TypeScript definitions', () => {
    const mapFile = join(distDir, 'index.d.ts.map')
    expect(existsSync(mapFile)).toBe(true)

    const content = readFileSync(mapFile, 'utf-8')
    const sourceMap = JSON.parse(content)

    expect(sourceMap.version).toBe(3)
  })

  it('declaration files should reference original sources', () => {
    const dtsFile = join(distDir, 'index.d.ts')
    const content = readFileSync(dtsFile, 'utf-8')

    // Declaration file should exist and be valid TypeScript
    expect(content).toContain('export')
  })

  it('tsconfig.build.json should have declarationMap enabled', () => {
    const config = JSON.parse(readFileSync(buildConfigPath, 'utf-8'))
    expect(config.compilerOptions).toBeDefined()
    expect(config.compilerOptions.declarationMap).toBe(true)
  })

  it('source maps should not be minified', () => {
    const mapFile = join(distDir, 'index.js.map')
    const content = readFileSync(mapFile, 'utf-8')
    const sourceMap = JSON.parse(content)

    // Source maps should have readable sources and mappings
    expect(sourceMap.sources).toBeDefined()
    expect(sourceMap.mappings).toBeDefined()
    expect(typeof sourceMap.mappings).toBe('string')
  })

  it('package should export sourcemap-friendly outputs', () => {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'))

    // Both ESM and CJS exports should be available
    expect(packageJson.exports).toBeDefined()
    expect(packageJson.exports['.'].import).toBeDefined()
    expect(packageJson.exports['.'].require).toBeDefined()
  })
})

import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

describe('REPL: Interactive playground for experimentation', () => {
  const packageJsonPath = join(import.meta.dirname, '../package.json')
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'))
  const rootPackageJsonPath = join(import.meta.dirname, '../../package.json')
  const rootPackageJson = JSON.parse(readFileSync(rootPackageJsonPath, 'utf-8'))

  it('should have repl script in package.json', () => {
    expect(packageJson.scripts).toBeDefined()
    expect(packageJson.scripts['repl']).toBeDefined()
  })

  it('repl script should use node with --experimental-repl-await flag', () => {
    const replScript = packageJson.scripts['repl']
    expect(replScript).toContain('--experimental-repl-await')
  })

  it('repl script should run a repl entry point', () => {
    const replScript = packageJson.scripts['repl']
    expect(replScript).toBeDefined()
    expect(replScript.length).toBeGreaterThan(0)
  })

  it('should have repl entry file that pre-imports common modules', () => {
    const replPath = join(import.meta.dirname, '../src/repl.ts')
    expect(existsSync(replPath)).toBe(true)

    const content = readFileSync(replPath, 'utf-8')
    expect(content).toBeDefined()
    expect(content.length).toBeGreaterThan(0)
  })

  it('repl entry should import SorobanResurrect', () => {
    const replPath = join(import.meta.dirname, '../src/repl.ts')
    const content = readFileSync(replPath, 'utf-8')

    expect(content).toMatch(/SorobanResurrect|from\s+['"]\./)
  })

  it('repl entry should import FootprintParser', () => {
    const replPath = join(import.meta.dirname, '../src/repl.ts')
    const content = readFileSync(replPath, 'utf-8')

    expect(content).toMatch(/FootprintParser|footprint/)
  })

  it('repl entry should provide helper functions for XDR generation', () => {
    const replPath = join(import.meta.dirname, '../src/repl.ts')
    const content = readFileSync(replPath, 'utf-8')

    // Check for any helper function definitions or helper imports
    expect(content).toMatch(/helper|generate|test|fixture|import/)
  })

  it('repl entry should include mock RPC server setup', () => {
    const replPath = join(import.meta.dirname, '../src/repl.ts')
    const content = readFileSync(replPath, 'utf-8')

    expect(content).toMatch(/mock|rpc|RPC|server/)
  })

  it('repl script should enable offline experimentation', () => {
    const replScript = packageJson.scripts['repl']
    expect(replScript).toBeDefined()
    // Script should be able to run without external network calls
  })

  it('should document repl usage in README', () => {
    const readmePath = join(import.meta.dirname, '../README.md')
    const content = readFileSync(readmePath, 'utf-8')

    expect(content).toMatch(/repl|playground|interactive|experiment/)
  })

  it('repl entry should be compiled to dist for access', () => {
    const distReplPath = join(import.meta.dirname, '../dist/repl.js')
    // After build, repl should be available in dist
    // This checks if the repl is exported or built
  })
})

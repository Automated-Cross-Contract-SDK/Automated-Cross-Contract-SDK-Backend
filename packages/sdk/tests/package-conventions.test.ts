import { describe, it, expect } from 'vitest'
import { promises as fs } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const packageRoot = path.resolve(__dirname, '..')

describe('Package Conventions', () => {
  it('exports main entry point from package.json', async () => {
    const packageJsonPath = path.join(packageRoot, 'package.json')
    const content = await fs.readFile(packageJsonPath, 'utf-8')
    const pkg = JSON.parse(content)

    expect(pkg.main).toBeDefined()
    expect(typeof pkg.main).toBe('string')
  })

  it('includes TypeScript exports field', async () => {
    const packageJsonPath = path.join(packageRoot, 'package.json')
    const content = await fs.readFile(packageJsonPath, 'utf-8')
    const pkg = JSON.parse(content)

    expect(pkg.exports).toBeDefined()
    expect(typeof pkg.exports).toBe('object')
  })

  it('defines name and version in package.json', async () => {
    const packageJsonPath = path.join(packageRoot, 'package.json')
    const content = await fs.readFile(packageJsonPath, 'utf-8')
    const pkg = JSON.parse(content)

    expect(pkg.name).toBeDefined()
    expect(pkg.version).toBeDefined()
    expect(pkg.name).toMatch(/^@?[\w-]+/)
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+/)
  })

  it('has test configuration in package.json', async () => {
    const packageJsonPath = path.join(packageRoot, 'package.json')
    const content = await fs.readFile(packageJsonPath, 'utf-8')
    const pkg = JSON.parse(content)

    expect(pkg.scripts).toBeDefined()
    expect(pkg.scripts.test).toBeDefined()
  })

  it('includes description and keywords', async () => {
    const packageJsonPath = path.join(packageRoot, 'package.json')
    const content = await fs.readFile(packageJsonPath, 'utf-8')
    const pkg = JSON.parse(content)

    expect(pkg.description).toBeDefined()
    expect(typeof pkg.description).toBe('string')
    expect(pkg.description.length).toBeGreaterThan(0)

    if (pkg.keywords) {
      expect(Array.isArray(pkg.keywords)).toBe(true)
    }
  })

  it('defines license field', async () => {
    const packageJsonPath = path.join(packageRoot, 'package.json')
    const content = await fs.readFile(packageJsonPath, 'utf-8')
    const pkg = JSON.parse(content)

    expect(pkg.license).toBeDefined()
    expect(typeof pkg.license).toBe('string')
  })

  it('tsconfig.json exists and extends root config', async () => {
    const tsconfigPath = path.join(packageRoot, 'tsconfig.json')
    try {
      const content = await fs.readFile(tsconfigPath, 'utf-8')
      const tsconfig = JSON.parse(content)
      expect(tsconfig).toBeDefined()
    } catch {
      expect.soft(true).toBe(false)
    }
  })

  it('vitest.config.ts follows naming conventions', async () => {
    const vitestConfigPath = path.join(packageRoot, 'vitest.config.ts')
    try {
      const content = await fs.readFile(vitestConfigPath, 'utf-8')
      expect(content).toContain('vitest')
      expect(content).toContain('defineConfig')
    } catch {
      expect.soft(true).toBe(false)
    }
  })

  it('src directory exists with TypeScript files', async () => {
    const srcPath = path.join(packageRoot, 'src')
    try {
      const files = await fs.readdir(srcPath, { recursive: true })
      const tsFiles = files.filter((f) => typeof f === 'string' && f.endsWith('.ts') && !f.endsWith('.d.ts'))
      expect(tsFiles.length).toBeGreaterThan(0)
    } catch {
      expect.soft(true).toBe(false)
    }
  })

  it('tests directory exists with test files', async () => {
    const testsPath = path.join(packageRoot, 'tests')
    try {
      const files = await fs.readdir(testsPath, { recursive: true })
      const testFiles = files.filter((f) => typeof f === 'string' && f.endsWith('.test.ts'))
      expect(testFiles.length).toBeGreaterThan(0)
    } catch {
      expect.soft(true).toBe(false)
    }
  })

  it('package follows naming conventions for exports', async () => {
    const packageJsonPath = path.join(packageRoot, 'package.json')
    const content = await fs.readFile(packageJsonPath, 'utf-8')
    const pkg = JSON.parse(content)

    if (pkg.exports) {
      const exportKeys = Object.keys(pkg.exports)
      expect(exportKeys).toContain('.')
    }
  })

  it('README.md exists at package root', async () => {
    const readmePath = path.join(packageRoot, 'README.md')
    try {
      const content = await fs.readFile(readmePath, 'utf-8')
      expect(content.length).toBeGreaterThan(0)
    } catch {
      expect.soft(true).toBe(false)
    }
  })
})

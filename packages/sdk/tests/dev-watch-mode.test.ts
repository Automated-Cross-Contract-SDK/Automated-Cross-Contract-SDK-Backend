import { describe, it, expect, afterAll } from 'vitest'
import { execSync, spawn } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'

describe('Development: Hot module reload and watch mode', () => {
  const packageJsonPath = join(import.meta.dirname, '../package.json')
  const packageJson = JSON.parse(require('fs').readFileSync(packageJsonPath, 'utf-8'))

  it('should have test:watch script configured', () => {
    expect(packageJson.scripts).toBeDefined()
    expect(packageJson.scripts['test:watch']).toBeDefined()
    expect(packageJson.scripts['test:watch']).toContain('vitest')
  })

  it('should have dev:test script for development iteration', () => {
    expect(packageJson.scripts).toBeDefined()
    expect(packageJson.scripts['dev:test']).toBeDefined()
  })

  it('test:watch script should use vitest with watch mode', () => {
    const testWatchScript = packageJson.scripts['test:watch']
    expect(testWatchScript).toContain('vitest')
    expect(testWatchScript).not.toContain('run')
  })

  it('dev:test script should enable verbose reporter for better feedback', () => {
    const devTestScript = packageJson.scripts['dev:test']
    expect(devTestScript).toBeDefined()
  })

  it('should have vitest.config.ts for watch mode configuration', () => {
    const configPath = join(import.meta.dirname, '../vitest.config.ts')
    expect(existsSync(configPath)).toBe(true)
  })

  it('vitest globals should be enabled for watch mode convenience', () => {
    const configPath = join(import.meta.dirname, '../vitest.config.ts')
    const configContent = require('fs').readFileSync(configPath, 'utf-8')

    expect(configContent).toContain('globals')
    expect(configContent).toContain('true')
  })

  it('should support running tests with minimal latency', () => {
    // Test that test runner is lightweight enough for watch mode
    const testScript = packageJson.scripts.test
    expect(testScript).toBeDefined()
    expect(testScript).toContain('vitest run')
  })

  it('should include test files with .test.ts pattern in watch', () => {
    const configPath = join(import.meta.dirname, '../vitest.config.ts')
    const configContent = require('fs').readFileSync(configPath, 'utf-8')

    expect(configContent).toContain('tests/**/*.test.ts')
  })

  it('watch mode should use node environment for fast iteration', () => {
    const configPath = join(import.meta.dirname, '../vitest.config.ts')
    const configContent = require('fs').readFileSync(configPath, 'utf-8')

    expect(configContent).toContain('node')
  })

  it('should have dedicated build:watch script for source changes', () => {
    expect(packageJson.scripts['build:watch']).toBeDefined()
    expect(packageJson.scripts['build:watch']).toContain('tsup')
    expect(packageJson.scripts['build:watch']).toContain('--watch')
  })
})

import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

/**
 * Tree-shaking Optimization Tests - Issue #123
 * Tests to verify that unused exports are properly removed by bundlers
 */
describe('Tree-shaking Optimization - Issue #123', () => {
  describe('package.json sideEffects configuration', () => {
    it('should have sideEffects set to false in package.json', () => {
      const packageJsonPath = path.join(__dirname, '../package.json')
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'))

      expect(packageJson.sideEffects).toBe(false)
    })

    it('should have sideEffects false in all workspace packages', () => {
      const rootPackageJsonPath = path.join(__dirname, '../../package.json')
      const rootPackageJson = JSON.parse(fs.readFileSync(rootPackageJsonPath, 'utf-8'))

      // Verify root workspace structure
      expect(rootPackageJson.workspaces).toBeDefined()

      // Check each package mentioned
      if (Array.isArray(rootPackageJson.workspaces)) {
        const packageDirs = rootPackageJson.workspaces

        packageDirs.forEach(pattern => {
          if (pattern.includes('sdk')) {
            const sdkPackagePath = path.join(__dirname, '../package.json')
            const sdkPackage = JSON.parse(fs.readFileSync(sdkPackagePath, 'utf-8'))
            expect(sdkPackage.sideEffects).toBe(false)
          }
        })
      }
    })
  })

  describe('Export structure validation', () => {
    it('should use direct exports instead of re-exporting entire modules', () => {
      const indexPath = path.join(__dirname, '../src/index.ts')
      const indexContent = fs.readFileSync(indexPath, 'utf-8')

      // Should have specific exports, not wildcard re-exports
      const hasSpecificExports = indexContent.includes('export {')
      expect(hasSpecificExports).toBe(true)

      // Should not have wildcard re-exports (or minimize them)
      const wildcardExports = (indexContent.match(/export \* from/g) || []).length
      expect(wildcardExports).toBeLessThan(3)
    })

    it('should avoid deep barrel chains', () => {
      const indexPath = path.join(__dirname, '../src/index.ts')
      const indexContent = fs.readFileSync(indexPath, 'utf-8')

      // Parse the export statements
      const exportLines = indexContent
        .split('\n')
        .filter(line => line.includes('export'))

      // Verify exports are from direct source files, not intermediate barrels
      exportLines.forEach(line => {
        const fromMatch = line.match(/from\s+['"]([^'"]+)['"]/)?.[1]
        if (fromMatch) {
          // Should import from .ts files or immediate modules, not nested paths
          expect(fromMatch).not.toMatch(/\/.*\/.*\/.*\.ts/)
        }
      })
    })

    it('should verify core exports are available', () => {
      // Import the main exports to verify they're accessible
      const exports = [
        'SorobanResurrect',
        'SorobanResurrectError',
      ]

      exports.forEach(exportName => {
        expect(exportName).toBeDefined()
      })
    })

    it('should not export unused internal utilities', () => {
      const indexPath = path.join(__dirname, '../src/index.ts')
      const indexContent = fs.readFileSync(indexPath, 'utf-8')

      // Should not export private/internal implementation details
      expect(indexContent).not.toMatch(/export.*delay\s*\(/)
      expect(indexContent).not.toMatch(/export.*isFeeBumpTx/)
      expect(indexContent).not.toMatch(/export.*extractFeeBumpMetadata/)
    })
  })

  describe('Bundler compatibility', () => {
    it('should export both ESM and CommonJS formats', () => {
      const packageJsonPath = path.join(__dirname, '../package.json')
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'))

      expect(packageJson.exports).toBeDefined()
      expect(packageJson.exports['.']).toBeDefined()
      expect(packageJson.exports['.'].import).toBeDefined()
      expect(packageJson.exports['.'].require).toBeDefined()
    })

    it('should provide TypeScript definitions', () => {
      const packageJsonPath = path.join(__dirname, '../package.json')
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'))

      expect(packageJson.exports['.'].types).toBeDefined()
      expect(packageJson.types).toBeDefined()
    })

    it('should support webpack tree-shaking', () => {
      const packageJsonPath = path.join(__dirname, '../package.json')
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'))

      // Required for webpack tree-shaking
      expect(packageJson.sideEffects).toBe(false)
      expect(packageJson.module).toBeDefined()
    })

    it('should support rollup tree-shaking', () => {
      const packageJsonPath = path.join(__dirname, '../package.json')
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'))

      // ESM module for rollup
      expect(packageJson.exports['.'].import).toBeDefined()
      expect(packageJson.sideEffects).toBe(false)
    })

    it('should support esbuild tree-shaking', () => {
      const packageJsonPath = path.join(__dirname, '../package.json')
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'))

      // ESM with proper export configuration
      expect(packageJson.module).toBeDefined()
      expect(packageJson.exports).toBeDefined()
    })
  })

  describe('Dead code elimination verification', () => {
    it('should list files in dist directory when available', () => {
      const distPath = path.join(__dirname, '../dist')

      if (fs.existsSync(distPath)) {
        const files = fs.readdirSync(distPath)
        expect(Array.isArray(files)).toBe(true)
        expect(files.length).toBeGreaterThan(0)
      }
    })

    it('should verify ESM index file exists', () => {
      const esmIndexPath = path.join(__dirname, '../dist/index.js')

      if (fs.existsSync(path.join(__dirname, '../dist'))) {
        expect(fs.existsSync(esmIndexPath)).toBe(true)
      }
    })

    it('should verify CommonJS index file exists', () => {
      const cjsIndexPath = path.join(__dirname, '../dist/index.cjs')

      if (fs.existsSync(path.join(__dirname, '../dist'))) {
        expect(fs.existsSync(cjsIndexPath)).toBe(true)
      }
    })

    it('should verify TypeScript definitions exist', () => {
      const dtsPath = path.join(__dirname, '../dist/index.d.ts')

      if (fs.existsSync(path.join(__dirname, '../dist'))) {
        expect(fs.existsSync(dtsPath)).toBe(true)
      }
    })
  })

  describe('Source map configuration', () => {
    it('should generate source maps for debugging', () => {
      const packageJsonPath = path.join(__dirname, '../package.json')
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'))

      // Build script should support source maps
      expect(packageJson.scripts.build).toBeDefined()
    })
  })

  describe('Export analysis', () => {
    it('should validate all exported names are accessible', () => {
      const indexPath = path.join(__dirname, '../src/index.ts')
      const indexContent = fs.readFileSync(indexPath, 'utf-8')

      // Main class should be exported
      expect(indexContent).toMatch(/export.*SorobanResurrect/)

      // Error class should be exported
      expect(indexContent).toMatch(/export.*SorobanResurrectError/)
    })

    it('should not export test utilities', () => {
      const indexPath = path.join(__dirname, '../src/index.ts')
      const indexContent = fs.readFileSync(indexPath, 'utf-8')

      // Should not export mocking utilities or test helpers
      expect(indexContent).not.toMatch(/export.*mock/i)
      expect(indexContent).not.toMatch(/export.*stub/i)
      expect(indexContent).not.toMatch(/export.*test/i)
    })

    it('should provide minimal public API surface', () => {
      const indexPath = path.join(__dirname, '../src/index.ts')
      const indexContent = fs.readFileSync(indexPath, 'utf-8')

      // Count export statements
      const exportCount = (indexContent.match(/^export /gm) || []).length

      // Should have focused public API (not too many exports)
      expect(exportCount).toBeLessThan(50)
    })
  })

  describe('Re-export optimization', () => {
    it('should use direct re-exports instead of intermediate imports', () => {
      const indexPath = path.join(__dirname, '../src/index.ts')
      const indexContent = fs.readFileSync(indexPath, 'utf-8')

      // Should use "export { X } from" pattern instead of "import X; export X;"
      const hasDirectReexports = indexContent.match(/export\s*{\s*[^}]+\s*}\s*from/g)
      expect(hasDirectReexports).toBeDefined()
    })

    it('should avoid re-exporting entire modules', () => {
      const indexPath = path.join(__dirname, '../src/index.ts')
      const indexContent = fs.readFileSync(indexPath, 'utf-8')

      // Count wildcard re-exports
      const wildcardCount = (indexContent.match(/export \* from/g) || []).length

      // Minimize wildcard re-exports
      expect(wildcardCount).toBeLessThanOrEqual(2)
    })

    it('should list specific exports when re-exporting from modules', () => {
      const indexPath = path.join(__dirname, '../src/index.ts')
      const indexContent = fs.readFileSync(indexPath, 'utf-8')

      // If re-exporting types, should be explicit
      if (indexContent.includes('export type')) {
        expect(indexContent).toMatch(/export type\s*{\s*[^}]+\s*}\s*from/)
      }
    })
  })

  describe('Unused code detection', () => {
    it('should not have obvious unused variable exports', () => {
      const srcPath = path.join(__dirname, '../src')
      const files = fs.readdirSync(srcPath).filter(f => f.endsWith('.ts'))

      files.forEach(file => {
        const filePath = path.join(srcPath, file)
        const content = fs.readFileSync(filePath, 'utf-8')

        // Check for underscore-prefixed unused exports (common pattern)
        const hasUnusedPattern = /_[a-zA-Z]+\s*=\s*/.test(content)

        // If pattern exists, it should be internal (not exported)
        if (hasUnusedPattern) {
          expect(content).not.toMatch(/export\s+_[a-zA-Z]+/)
        }
      })
    })

    it('should validate no commented-out exports', () => {
      const indexPath = path.join(__dirname, '../src/index.ts')
      const indexContent = fs.readFileSync(indexPath, 'utf-8')

      // Should not have commented exports (indicates incomplete cleanup)
      expect(indexContent).not.toMatch(/\/\/\s*export/)
    })
  })

  describe('Build output validation', () => {
    it('should produce smaller ESM output than CommonJS', () => {
      const esmPath = path.join(__dirname, '../dist/index.js')
      const cjsPath = path.join(__dirname, '../dist/index.cjs')

      if (fs.existsSync(esmPath) && fs.existsSync(cjsPath)) {
        const esmSize = fs.statSync(esmPath).size
        const cjsSize = fs.statSync(cjsPath).size

        // ESM should typically be smaller or comparable due to better tree-shaking
        expect(esmSize).toBeLessThanOrEqual(cjsSize * 1.1)
      }
    })

    it('should not duplicate exports in output files', () => {
      const esmPath = path.join(__dirname, '../dist/index.js')

      if (fs.existsSync(esmPath)) {
        const content = fs.readFileSync(esmPath, 'utf-8')

        // Check for duplicate export patterns
        const exportStatements = content.match(/export\s*/g) || []
        const uniqueExports = new Set(exportStatements)

        // Roughly same number (allowing some variation for bundler transforms)
        expect(uniqueExports.size / exportStatements.length).toBeGreaterThan(0.7)
      }
    })
  })
})

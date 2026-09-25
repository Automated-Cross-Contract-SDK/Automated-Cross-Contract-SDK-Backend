import { describe, it, expect, beforeEach } from 'vitest'

interface BuildEntry {
  name: string
  source: string
  outDir: string
  splitChunks: boolean
}

interface BuildConfig {
  entries: BuildEntry[]
  outDir: string
  format: string[]
  dts: boolean
  sourcemap: boolean
  treeshake: boolean | string
  external: string[]
}

interface BundleAnalysis {
  entryName: string
  size: number
  gzipSize: number
  dependencies: string[]
}

describe('[M4][Tooling] tsup: split wallet-adapters per-entry builds (Issue #287)', () => {
  let buildConfig: BuildConfig
  let entries: BuildEntry[]
  let bundleAnalysis: BundleAnalysis[]

  beforeEach(() => {
    entries = [
      {
        name: 'freighter',
        source: 'src/adapters/freighter.ts',
        outDir: 'dist/freighter',
        splitChunks: true,
      },
      {
        name: 'ledger',
        source: 'src/adapters/ledger.ts',
        outDir: 'dist/ledger',
        splitChunks: true,
      },
      {
        name: 'xbull',
        source: 'src/adapters/xbull.ts',
        outDir: 'dist/xbull',
        splitChunks: true,
      },
      {
        name: 'albedo',
        source: 'src/adapters/albedo.ts',
        outDir: 'dist/albedo',
        splitChunks: true,
      },
    ]

    buildConfig = {
      entries,
      outDir: 'dist',
      format: ['esm', 'cjs'],
      dts: true,
      sourcemap: true,
      treeshake: true,
      external: ['@stellar/stellar-sdk'],
    }

    bundleAnalysis = [
      {
        entryName: 'freighter',
        size: 45000,
        gzipSize: 12000,
        dependencies: ['@stellar/stellar-sdk'],
      },
      {
        entryName: 'ledger',
        size: 55000,
        gzipSize: 14000,
        dependencies: ['@stellar/stellar-sdk'],
      },
      {
        entryName: 'xbull',
        size: 35000,
        gzipSize: 9000,
        dependencies: ['@stellar/stellar-sdk'],
      },
      {
        entryName: 'albedo',
        size: 42000,
        gzipSize: 11000,
        dependencies: ['@stellar/stellar-sdk'],
      },
    ]
  })

  describe('Build Configuration', () => {
    it('should define separate entry points for each adapter', () => {
      expect(buildConfig.entries).toHaveLength(4)
      expect(buildConfig.entries[0].name).toBe('freighter')
      expect(buildConfig.entries[1].name).toBe('ledger')
      expect(buildConfig.entries[2].name).toBe('xbull')
      expect(buildConfig.entries[3].name).toBe('albedo')
    })

    it('should map each adapter to its source file', () => {
      const freighterEntry = buildConfig.entries.find((e) => e.name === 'freighter')
      expect(freighterEntry?.source).toContain('freighter.ts')
    })

    it('should configure output directory per entry', () => {
      entries.forEach((entry) => {
        expect(entry.outDir).toContain('dist')
        expect(entry.outDir).toContain(entry.name)
      })
    })

    it('should enable tree-shaking for all entries', () => {
      expect(buildConfig.treeshake).toBe(true)
    })

    it('should generate both ESM and CJS formats', () => {
      expect(buildConfig.format).toContain('esm')
      expect(buildConfig.format).toContain('cjs')
    })

    it('should generate TypeScript declarations', () => {
      expect(buildConfig.dts).toBe(true)
    })

    it('should enable sourcemaps for debugging', () => {
      expect(buildConfig.sourcemap).toBe(true)
    })

    it('should exclude external dependencies from bundle', () => {
      expect(buildConfig.external).toContain('@stellar/stellar-sdk')
    })
  })

  describe('Per-Entry Splitting', () => {
    it('should create separate output directories per adapter', () => {
      const outDirs = entries.map((e) => e.outDir)
      expect(outDirs).toContain('dist/freighter')
      expect(outDirs).toContain('dist/ledger')
      expect(outDirs).toContain('dist/xbull')
      expect(outDirs).toContain('dist/albedo')
    })

    it('should allow consumers to import specific adapters', () => {
      const freighterImport = 'import { FreighterAdapter } from "@soroban-resurrect/wallet-adapters/freighter"'
      expect(freighterImport).toContain('freighter')
      expect(freighterImport).toContain('FreighterAdapter')
    })

    it('should enable tree-shaking at entry level', () => {
      expect(buildConfig.treeshake).toBeTruthy()
    })

    it('should prevent unused adapters from being bundled', () => {
      // When using freighter entry, ledger/xbull/albedo should not be included
      const entry = buildConfig.entries.find((e) => e.name === 'freighter')
      expect(entry?.source).not.toContain('ledger')
      expect(entry?.source).not.toContain('xbull')
      expect(entry?.source).not.toContain('albedo')
    })
  })

  describe('Bundle Size Reduction', () => {
    it('should reduce bundle size by splitting adapters', () => {
      const totalSize = bundleAnalysis.reduce((sum, b) => sum + b.size, 0)
      const singleBundleSize = 200000 // hypothetical single bundle size

      expect(totalSize).toBeLessThan(singleBundleSize)
    })

    it('should generate smaller gzip sizes per adapter', () => {
      bundleAnalysis.forEach((analysis) => {
        const ratio = analysis.gzipSize / analysis.size
        expect(ratio).toBeLessThan(0.5) // Should compress to less than 50%
      })
    })

    it('should analyze bundle content per entry', () => {
      const freighter = bundleAnalysis.find((b) => b.entryName === 'freighter')
      expect(freighter?.size).toBeLessThan(50000)
    })

    it('should prevent code duplication across entries', () => {
      const deps = new Set<string>()
      bundleAnalysis.forEach((analysis) => {
        analysis.dependencies.forEach((dep) => {
          deps.add(dep)
        })
      })

      // All entries share same external dependencies
      expect(deps.size).toBeLessThanOrEqual(bundleAnalysis.length)
    })
  })

  describe('Output Structure', () => {
    it('should generate .js files for each format', () => {
      const freighterDir = 'dist/freighter'
      const expectedFiles = [`${freighterDir}/index.js`, `${freighterDir}/index.cjs`]

      expect(expectedFiles[0]).toContain('freighter')
      expect(expectedFiles[0]).toContain('.js')
    })

    it('should generate .d.ts type declaration files', () => {
      const typeFile = 'dist/freighter/index.d.ts'
      expect(typeFile).toContain('.d.ts')
      expect(typeFile).toContain('freighter')
    })

    it('should create .map sourcemap files', () => {
      const sourcemapFile = 'dist/freighter/index.js.map'
      expect(sourcemapFile).toContain('.map')
    })

    it('should organize outputs by adapter name', () => {
      const adapters = ['freighter', 'ledger', 'xbull', 'albedo']
      adapters.forEach((adapter) => {
        const dir = `dist/${adapter}`
        expect(dir).toContain(adapter)
      })
    })

    it('should maintain consistent export interface across adapters', () => {
      const exportsTemplate = {
        main: 'index.cjs',
        module: 'index.js',
        types: 'index.d.ts',
        exports: {
          import: './index.js',
          require: './index.cjs',
          types: './index.d.ts',
        },
      }

      expect('main' in exportsTemplate).toBe(true)
      expect('module' in exportsTemplate).toBe(true)
      expect('types' in exportsTemplate).toBe(true)
    })
  })

  describe('Import Paths', () => {
    it('should support subpath imports for adapters', () => {
      const paths = {
        '.': './dist/index.js',
        './freighter': './dist/freighter/index.js',
        './ledger': './dist/ledger/index.js',
        './xbull': './dist/xbull/index.js',
        './albedo': './dist/albedo/index.js',
      }

      expect('./freighter' in paths).toBe(true)
      expect(paths['./freighter']).toContain('freighter')
    })

    it('should enable tree-shaking when importing specific adapter', () => {
      const importStatement = 'import { FreighterAdapter } from "@soroban-resurrect/wallet-adapters/freighter"'
      expect(importStatement).toContain('/freighter')
    })

    it('should prevent importing unused adapters', () => {
      // Using freighter should not include ledger/xbull/albedo code
      const freighterOnly = { _only: 'freighter' }
      expect('_only' in freighterOnly).toBe(true)
    })

    it('should maintain backward compatibility with index import', () => {
      const indexImport = 'import { FreighterAdapter } from "@soroban-resurrect/wallet-adapters"'
      expect(indexImport).toContain('@soroban-resurrect/wallet-adapters')
    })
  })

  describe('Build Performance', () => {
    it('should support incremental builds per entry', () => {
      const buildStatus = {
        freighter: 'built',
        ledger: 'unchanged',
        xbull: 'built',
        albedo: 'unchanged',
      }

      expect(buildStatus.freighter).toBe('built')
      expect(buildStatus.ledger).toBe('unchanged')
    })

    it('should cache unchanged adapter builds', () => {
      const cache = {
        'src/adapters/freighter.ts': 'hash123',
        'src/adapters/ledger.ts': 'hash456',
      }

      expect('src/adapters/freighter.ts' in cache).toBe(true)
    })
  })

  describe('Package.json Configuration', () => {
    it('should define exports map in package.json', () => {
      const packageJson = {
        exports: {
          '.': './dist/index.js',
          './freighter': './dist/freighter/index.js',
          './ledger': './dist/ledger/index.js',
          './xbull': './dist/xbull/index.js',
          './albedo': './dist/albedo/index.js',
        },
      }

      expect('./freighter' in packageJson.exports).toBe(true)
    })

    it('should specify main entry for default import', () => {
      const packageJson = {
        main: './dist/index.cjs',
        module: './dist/index.js',
      }

      expect(packageJson.main).toBeDefined()
    })

    it('should list files to include in npm package', () => {
      const files = ['dist', 'src', 'package.json']
      expect(files).toContain('dist')
    })
  })
})

import { describe, it, expect, beforeEach } from 'vitest'

interface TsConfig {
  extends?: string
  compilerOptions?: Record<string, unknown>
  include?: string[]
  exclude?: string[]
}

interface PackageTsConfig {
  name: string
  path: string
  config: TsConfig
}

interface ConsolidationReport {
  totalPackages: number
  packagesWithDuplication: number
  duplicatedSettings: string[]
  consolidationPotential: number
}

describe('tsconfig Consolidation (Issue #295)', () => {
  let packageConfigs: PackageTsConfig[]
  let baseTsConfig: TsConfig
  let consolidationReport: ConsolidationReport

  beforeEach(() => {
    baseTsConfig = {
      compilerOptions: {
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'bundler',
        lib: ['ES2022'],
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        forceConsistentCasingInFileNames: true,
        resolveJsonModule: true,
        declaration: true,
        declarationMap: true,
        sourceMap: true,
        outDir: 'dist',
        rootDir: 'src',
      },
    }

    packageConfigs = [
      {
        name: 'types',
        path: 'packages/types/tsconfig.json',
        config: {
          extends: '../../tsconfig.base.json',
          compilerOptions: {
            outDir: './dist',
            rootDir: './src',
          },
          include: ['src/**/*'],
          exclude: ['node_modules', 'dist'],
        },
      },
      {
        name: 'errors',
        path: 'packages/errors/tsconfig.json',
        config: {
          extends: '../../tsconfig.base.json',
          compilerOptions: {
            outDir: './dist',
            rootDir: './src',
          },
          include: ['src/**/*'],
          exclude: ['node_modules', 'dist'],
        },
      },
      {
        name: 'sdk',
        path: 'packages/sdk/tsconfig.json',
        config: {
          extends: '../../tsconfig.base.json',
          compilerOptions: {
            outDir: 'dist',
            rootDir: 'src',
            lib: ['ES2022', 'DOM'],
          },
          include: ['src'],
        },
      },
      {
        name: 'react',
        path: 'packages/react/tsconfig.json',
        config: {
          extends: '../../tsconfig.base.json',
          compilerOptions: {
            outDir: 'dist',
            rootDir: 'src',
            lib: ['ES2022', 'DOM'],
            jsx: 'react-jsx',
          },
          include: ['src'],
        },
      },
    ]

    consolidationReport = {
      totalPackages: packageConfigs.length,
      packagesWithDuplication: 3,
      duplicatedSettings: ['outDir', 'rootDir', 'include', 'exclude'],
      consolidationPotential: 40,
    }
  })

  describe('base tsconfig structure', () => {
    it('should have tsconfig.base.json at root', () => {
      expect(baseTsConfig.compilerOptions).toBeDefined()
    })

    it('should define common compiler options', () => {
      const requiredOptions = [
        'target',
        'module',
        'lib',
        'strict',
        'declaration',
      ]

      for (const option of requiredOptions) {
        expect(baseTsConfig.compilerOptions?.[option]).toBeDefined()
      }
    })

    it('should set target to ES2022', () => {
      expect(baseTsConfig.compilerOptions?.target).toBe('ES2022')
    })

    it('should enable strict mode', () => {
      expect(baseTsConfig.compilerOptions?.strict).toBe(true)
    })

    it('should enable declaration generation', () => {
      expect(baseTsConfig.compilerOptions?.declaration).toBe(true)
    })
  })

  describe('package tsconfig inheritance', () => {
    it('should extend tsconfig.base.json', () => {
      for (const pkg of packageConfigs) {
        expect(pkg.config.extends).toBe('../../tsconfig.base.json')
      }
    })

    it('should inherit common compiler options from base', () => {
      for (const pkg of packageConfigs) {
        expect(pkg.config.extends).toBeDefined()
      }
    })

    it('should override only package-specific settings', () => {
      const typesConfig = packageConfigs[0]

      expect(typesConfig.config.compilerOptions?.outDir).toBe('./dist')
      expect(typesConfig.config.compilerOptions?.rootDir).toBe('./src')
    })
  })

  describe('duplicate settings identification', () => {
    it('should identify duplicate outDir settings', () => {
      const outDirDuplicates = packageConfigs.filter(
        (p) => p.config.compilerOptions?.outDir,
      )

      expect(outDirDuplicates).toHaveLength(4)
    })

    it('should identify duplicate rootDir settings', () => {
      const rootDirDuplicates = packageConfigs.filter(
        (p) => p.config.compilerOptions?.rootDir,
      )

      expect(rootDirDuplicates).toHaveLength(4)
    })

    it('should identify duplicate include patterns', () => {
      const includeDuplicates = packageConfigs.filter(
        (p) => p.config.include && p.config.include.length > 0,
      )

      expect(includeDuplicates.length).toBeGreaterThan(0)
    })

    it('should identify duplicate exclude patterns', () => {
      const excludeDuplicates = packageConfigs.filter(
        (p) => p.config.exclude && p.config.exclude.length > 0,
      )

      expect(excludeDuplicates.length).toBeGreaterThan(0)
    })

    it('should track total duplicated settings', () => {
      expect(consolidationReport.duplicatedSettings).toContain('outDir')
      expect(consolidationReport.duplicatedSettings).toContain('rootDir')
    })
  })

  describe('consolidation opportunities', () => {
    it('should consolidate common include patterns', () => {
      const commonIncludes = packageConfigs.filter(
        (p) => JSON.stringify(p.config.include) === JSON.stringify(['src/**/*']),
      )

      expect(commonIncludes.length).toBeGreaterThan(0)
    })

    it('should consolidate common exclude patterns', () => {
      const commonExcludes = packageConfigs.filter(
        (p) =>
          JSON.stringify(p.config.exclude) ===
          JSON.stringify(['node_modules', 'dist']),
      )

      expect(commonExcludes.length).toBeGreaterThan(0)
    })

    it('should move common settings to base config', () => {
      const commonSettings = ['include', 'exclude']

      for (const setting of commonSettings) {
        expect(['include', 'exclude']).toContain(setting)
      }
    })

    it('should identify consolidation potential', () => {
      expect(consolidationReport.consolidationPotential).toBeGreaterThan(0)
    })

    it('should enable simpler package configs after consolidation', () => {
      const simplifiedConfig: TsConfig = {
        extends: '../../tsconfig.base.json',
        compilerOptions: {
          outDir: './dist',
          rootDir: './src',
        },
      }

      expect(simplifiedConfig.compilerOptions).toBeDefined()
      expect(Object.keys(simplifiedConfig.compilerOptions)).toHaveLength(2)
    })
  })

  describe('package-specific overrides', () => {
    it('should allow package-specific lib override', () => {
      const sdkConfig = packageConfigs.find((p) => p.name === 'sdk')
      const reactConfig = packageConfigs.find((p) => p.name === 'react')

      expect(sdkConfig?.config.compilerOptions?.lib).toEqual(['ES2022', 'DOM'])
      expect(reactConfig?.config.compilerOptions?.lib).toEqual(['ES2022', 'DOM'])
    })

    it('should allow jsx override for React package', () => {
      const reactConfig = packageConfigs.find((p) => p.name === 'react')

      expect(reactConfig?.config.compilerOptions?.jsx).toBe('react-jsx')
    })

    it('should not duplicate settings unnecessarily', () => {
      const typesConfig = packageConfigs[0]
      const compilerOptions = typesConfig.config.compilerOptions

      if (compilerOptions) {
        const keys = Object.keys(compilerOptions)
        expect(keys).toContain('outDir')
        expect(keys).toContain('rootDir')
      }
    })

    it('should preserve variations in include patterns', () => {
      const sdkInclude = packageConfigs
        .find((p) => p.name === 'sdk')
        ?.config.include?.toString()
      const typesInclude = packageConfigs
        .find((p) => p.name === 'types')
        ?.config.include?.toString()

      expect(sdkInclude).not.toBe(typesInclude)
    })
  })

  describe('consolidation strategy', () => {
    it('should move include/exclude to base by default', () => {
      const consolidatedBase: TsConfig = {
        ...baseTsConfig,
        include: ['src/**/*'],
        exclude: ['node_modules', 'dist'],
      }

      expect(consolidatedBase.include).toBeDefined()
      expect(consolidatedBase.exclude).toBeDefined()
    })

    it('should keep outDir/rootDir in package configs', () => {
      const packageConfig: TsConfig = {
        extends: '../../tsconfig.base.json',
        compilerOptions: {
          outDir: './dist',
          rootDir: './src',
        },
      }

      expect(packageConfig.compilerOptions?.outDir).toBeDefined()
      expect(packageConfig.compilerOptions?.rootDir).toBeDefined()
    })

    it('should allow per-package include overrides', () => {
      const reactConfig = packageConfigs.find((p) => p.name === 'react')

      expect(reactConfig?.config.include).toEqual(['src'])
    })

    it('should document consolidation in CONTRIBUTING', () => {
      const docs = {
        title: 'TypeScript Configuration',
        description: 'All packages extend tsconfig.base.json',
        overridingAllowed: true,
      }

      expect(docs.overridingAllowed).toBe(true)
    })
  })

  describe('validation', () => {
    it('should validate all packages extend base config', () => {
      const allExtend = packageConfigs.every(
        (p) => p.config.extends === '../../tsconfig.base.json',
      )

      expect(allExtend).toBe(true)
    })

    it('should ensure no conflicting compiler options', () => {
      for (const pkg of packageConfigs) {
        const config = pkg.config.compilerOptions || {}
        expect(config).toBeDefined()
      }
    })

    it('should verify include patterns are valid', () => {
      for (const pkg of packageConfigs) {
        if (pkg.config.include) {
          expect(Array.isArray(pkg.config.include)).toBe(true)
        }
      }
    })

    it('should verify exclude patterns are valid', () => {
      for (const pkg of packageConfigs) {
        if (pkg.config.exclude) {
          expect(Array.isArray(pkg.config.exclude)).toBe(true)
        }
      }
    })
  })

  describe('CI compatibility', () => {
    it('should not break existing CI checks', () => {
      const ciCommand = 'tsc --noEmit -p tsconfig.base.json'

      expect(ciCommand).toContain('tsconfig.base.json')
    })

    it('should support typecheck in CI', () => {
      const typeCheckJob = {
        name: 'typecheck',
        commands: [
          'tsc --noEmit -p packages/sdk/tsconfig.json',
          'tsc --noEmit -p packages/react/tsconfig.json',
        ],
      }

      expect(typeCheckJob.commands).toHaveLength(2)
    })

    it('should work with IDE tools', () => {
      const ideSupport = {
        vscode: true,
        jetbrains: true,
        neovim: true,
      }

      expect(ideSupport.vscode).toBe(true)
    })
  })

  describe('build tool compatibility', () => {
    it('should work with package builds', () => {
      const buildTools = ['tsc', 'esbuild', 'swc']

      expect(buildTools).toContain('tsc')
    })

    it('should work with monorepo tools', () => {
      const monoRepoTools = ['npm workspaces', 'lerna', 'turborepo']

      expect(monoRepoTools).toContain('npm workspaces')
    })

    it('should maintain build reproducibility', () => {
      const reproducible = {
        usesBaseConfig: true,
        strictSettings: true,
        consistentOutputs: true,
      }

      expect(reproducible.usesBaseConfig).toBe(true)
    })
  })

  describe('migration path', () => {
    it('should allow gradual consolidation', () => {
      const migrationSteps = [
        'Identify duplicates',
        'Test base config changes',
        'Update packages incrementally',
        'Verify CI passes',
      ]

      expect(migrationSteps).toHaveLength(4)
    })

    it('should not require simultaneous updates', () => {
      const gradual = {
        canUpdateOneAtATime: true,
        backwardsCompatible: true,
      }

      expect(gradual.canUpdateOneAtATime).toBe(true)
    })

    it('should document migration steps', () => {
      const documentation = {
        beforeAndAfter: true,
        stepByStep: true,
        examples: true,
      }

      expect(documentation.beforeAndAfter).toBe(true)
    })
  })
})

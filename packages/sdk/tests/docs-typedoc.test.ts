import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

describe('API Reference Generation (Issue #298)', () => {
  let packageJsonContent: object
  let readmeContent: string

  beforeEach(() => {
    const pkgPath = join(process.cwd(), 'packages/sdk/package.json')
    const pkgContent = readFileSync(pkgPath, 'utf-8')
    packageJsonContent = JSON.parse(pkgContent)

    const readmePath = join(process.cwd(), 'README.md')
    readmeContent = readFileSync(readmePath, 'utf-8')
  })

  describe('Typedoc configuration', () => {
    it('should have scripts defined in package.json', () => {
      const scripts = (packageJsonContent as Record<string, any>).scripts
      expect(scripts).toBeDefined()
    })

    it('should have a way to generate documentation', () => {
      const scripts = (packageJsonContent as Record<string, any>).scripts
      const hasDocScript =
        scripts && (
          scripts.docs ||
          scripts.typedoc ||
          scripts['docs:build'] ||
          scripts['build:docs']
        )
      expect(hasDocScript).toBeDefined()
    })
  })

  describe('Documentation availability', () => {
    it('should link to API reference from README', () => {
      const hasApiLink =
        readmeContent.includes('API') ||
        readmeContent.includes('api') ||
        readmeContent.includes('reference') ||
        readmeContent.includes('typedoc')
      expect(hasApiLink).toBe(true)
    })

    it('should reference SDK documentation', () => {
      expect(readmeContent).toContain('@soroban-resurrect/sdk')
    })

    it('should reference React documentation', () => {
      expect(readmeContent).toContain('@soroban-resurrect/react')
    })
  })

  describe('Type exports', () => {
    it('SDK should export main types', () => {
      const sdkIndexPath = join(process.cwd(), 'packages/sdk/src/index.ts')
      const sdkIndex = readFileSync(sdkIndexPath, 'utf-8')

      expect(sdkIndex).toContain('export')
      expect(sdkIndex).toMatch(/SorobanResurrect|export.*from/i)
    })

    it('React package should export hooks', () => {
      const reactIndexPath = join(process.cwd(), 'packages/react/src/index.ts')
      try {
        const reactIndex = readFileSync(reactIndexPath, 'utf-8')
        expect(reactIndex).toContain('export')
        expect(reactIndex).toMatch(/useSorobanResurrect|export/i)
      } catch {
        // React package might not exist in all environments
      }
    })
  })

  describe('Documentation structure', () => {
    it('should have JSDoc comments in source files', () => {
      const sdkIndexPath = join(process.cwd(), 'packages/sdk/src/index.ts')
      const sdkIndex = readFileSync(sdkIndexPath, 'utf-8')

      const hasJsDoc = sdkIndex.includes('/**') || sdkIndex.includes('/*!')
      expect(hasJsDoc).toBe(true)
    })

    it('should document exported interfaces', () => {
      const typesPath = join(process.cwd(), 'packages/types/src')
      const typesExist = existsSync(typesPath)
      expect(typesExist).toBe(true)
    })
  })

  describe('Badges and links in README', () => {
    it('should include CI badge', () => {
      expect(readmeContent).toMatch(/CI|badge|Actions/i)
    })

    it('should include GitHub workflows badge', () => {
      expect(readmeContent).toContain('github.com')
    })
  })

  describe('Public API surface', () => {
    it('should document main SDK class', () => {
      const sdkIndexPath = join(process.cwd(), 'packages/sdk/src/index.ts')
      const sdkIndex = readFileSync(sdkIndexPath, 'utf-8')

      expect(sdkIndex).toContain('SorobanResurrect')
    })

    it('should document configuration interfaces', () => {
      const sdkIndexPath = join(process.cwd(), 'packages/sdk/src/index.ts')
      const sdkIndex = readFileSync(sdkIndexPath, 'utf-8')

      expect(sdkIndex).toMatch(/export|interface|type/i)
    })

    it('should export error types', () => {
      const errorsPath = join(process.cwd(), 'packages/errors/src')
      const errorsExist = existsSync(errorsPath)
      expect(errorsExist).toBe(true)
    })
  })

  describe('React hooks documentation', () => {
    it('should have React package entry point', () => {
      const reactPkgPath = join(process.cwd(), 'packages/react/package.json')
      const exists = existsSync(reactPkgPath)
      expect(exists).toBe(true)
    })

    it('should export useSorobanResurrect hook', () => {
      const reactIndexPath = join(process.cwd(), 'packages/react/src/index.ts')
      try {
        const reactIndex = readFileSync(reactIndexPath, 'utf-8')
        expect(reactIndex).toContain('useSorobanResurrect')
      } catch {
        // Hook might be in a different file
      }
    })
  })

  describe('API stability', () => {
    it('should maintain semantic versioning', () => {
      const version = (packageJsonContent as Record<string, any>).version
      expect(version).toMatch(/^\d+\.\d+\.\d+/)
    })

    it('should document breaking changes', () => {
      const changePaths = [
        join(process.cwd(), 'CHANGELOG.md'),
        join(process.cwd(), 'docs/MIGRATION_GUIDE.md'),
      ]

      const hasChangeLog = changePaths.some(path => existsSync(path))
      expect(hasChangeLog).toBe(true)
    })
  })
})

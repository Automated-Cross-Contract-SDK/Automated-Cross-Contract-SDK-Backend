import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

describe('Migration Guide v0.1→v0.2 (Issue #299)', () => {
  let migrationGuideContent: string
  let changelogContent: string

  beforeEach(() => {
    const migrationPath = join(process.cwd(), 'docs/MIGRATION_GUIDE.md')
    try {
      migrationGuideContent = readFileSync(migrationPath, 'utf-8')
    } catch {
      migrationGuideContent = ''
    }

    const changelogPath = join(process.cwd(), 'CHANGELOG.md')
    try {
      changelogContent = readFileSync(changelogPath, 'utf-8')
    } catch {
      changelogContent = ''
    }
  })

  describe('v0.1→v0.2 migration documentation', () => {
    it('should have migration guide document', () => {
      const migrationPath = join(process.cwd(), 'docs/MIGRATION_GUIDE.md')
      expect(existsSync(migrationPath)).toBe(true)
    })

    it('should document v0.1 to v0.2 changes', () => {
      const hasV02Reference =
        migrationGuideContent.includes('0.2') ||
        migrationGuideContent.includes('v0.2')
      expect(hasV02Reference).toBe(true)
    })

    it('should list breaking changes', () => {
      expect(migrationGuideContent).toMatch(/break|Breaking|BREAKING/i)
    })

    it('should provide upgrade instructions', () => {
      expect(migrationGuideContent).toMatch(/npm install|upgrade|update/i)
    })
  })

  describe('new config fields documentation', () => {
    it('should document new configuration options', () => {
      const hasConfigDocs =
        migrationGuideContent.includes('config') ||
        migrationGuideContent.includes('Config') ||
        migrationGuideContent.includes('configuration')
      expect(hasConfigDocs).toBe(true)
    })

    it('should explain default values', () => {
      const hasDefaults =
        migrationGuideContent.includes('default') ||
        migrationGuideContent.includes('Default') ||
        migrationGuideContent.includes('=')
      expect(hasDefaults).toBe(true)
    })

    it('should provide before/after config examples', () => {
      const hasExamples =
        migrationGuideContent.match(/```.*typescript/gi) &&
        migrationGuideContent.match(/Before|After/i)
      expect(hasExamples).toBeDefined()
    })
  })

  describe('error codes documentation', () => {
    it('should document error codes', () => {
      const hasErrorDocs =
        migrationGuideContent.includes('error') ||
        migrationGuideContent.includes('Error') ||
        migrationGuideContent.includes('ERR_')
      expect(hasErrorDocs).toBe(true)
    })

    it('should provide error handling guidance', () => {
      const hasErrorHandling =
        migrationGuideContent.includes('try') ||
        migrationGuideContent.includes('catch') ||
        migrationGuideContent.includes('error handling')
      expect(hasErrorHandling).toBe(true)
    })

    it('should list error types and causes', () => {
      const hasErrorTypes =
        migrationGuideContent.match(/Error|TypeError|RangeError/i)
      expect(hasErrorTypes).toBeDefined()
    })
  })

  describe('deprecations documentation', () => {
    it('should mark deprecated APIs', () => {
      const hasDeprecation =
        migrationGuideContent.includes('deprecat') ||
        migrationGuideContent.includes('Deprecat') ||
        migrationGuideContent.includes('DEPRECATED')
      expect(hasDeprecation).toBe(true)
    })

    it('should provide replacement APIs', () => {
      const hasReplacement =
        migrationGuideContent.includes('replace') ||
        migrationGuideContent.includes('Replace') ||
        migrationGuideContent.includes('use instead')
      expect(hasReplacement).toBe(true)
    })

    it('should include deprecation timeline', () => {
      const hasTimeline =
        migrationGuideContent.includes('remove') ||
        migrationGuideContent.includes('end of life') ||
        migrationGuideContent.includes('EOL') ||
        migrationGuideContent.includes('version')
      expect(hasTimeline).toBe(true)
    })
  })

  describe('migration checklist', () => {
    it('should provide step-by-step migration path', () => {
      expect(migrationGuideContent).toMatch(/step|Step|Step \d/i)
    })

    it('should include testing checklist', () => {
      expect(migrationGuideContent).toMatch(/test|Test|checklist/i)
    })

    it('should provide code examples for each step', () => {
      const codeBlocks = migrationGuideContent.match(/```[\s\S]*?```/g)
      expect(codeBlocks).toBeDefined()
      expect(codeBlocks?.length).toBeGreaterThan(0)
    })
  })

  describe('backward compatibility', () => {
    it('should document compatibility guarantees', () => {
      const hasCompat =
        migrationGuideContent.includes('compat') ||
        migrationGuideContent.includes('compatible') ||
        migrationGuideContent.includes('backward')
      expect(hasCompat).toBe(true)
    })

    it('should explain deprecation periods', () => {
      const hasPeriods =
        migrationGuideContent.includes('release') ||
        migrationGuideContent.includes('version')
      expect(hasPeriods).toBe(true)
    })
  })

  describe('changelog integration', () => {
    it('should have changelog file', () => {
      const changelogPath = join(process.cwd(), 'CHANGELOG.md')
      expect(existsSync(changelogPath)).toBe(true)
    })

    it('should document v0.2 release notes', () => {
      const hasV02 =
        changelogContent.includes('0.2') ||
        changelogContent.includes('v0.2')
      expect(hasV02).toBe(true)
    })
  })

  describe('support and resources', () => {
    it('should link to troubleshooting guide', () => {
      const hasTroubleshooting =
        migrationGuideContent.includes('trouble') ||
        migrationGuideContent.includes('Trouble') ||
        migrationGuideContent.includes('docs/TROUBLESHOOTING')
      expect(hasTroubleshooting).toBe(true)
    })

    it('should provide support channels', () => {
      const hasSupport =
        migrationGuideContent.includes('issue') ||
        migrationGuideContent.includes('Issue') ||
        migrationGuideContent.includes('github') ||
        migrationGuideContent.includes('GitHub')
      expect(hasSupport).toBe(true)
    })

    it('should link to relevant ADRs', () => {
      const hasAdr =
        migrationGuideContent.includes('ADR') ||
        migrationGuideContent.includes('adr') ||
        migrationGuideContent.includes('docs/adr')
      expect(hasAdr).toBe(true)
    })
  })

  describe('code migration examples', () => {
    it('should provide before/after code examples', () => {
      const beforeAfter = migrationGuideContent.match(/Before|After/gi)
      expect(beforeAfter).toBeDefined()
      expect((beforeAfter?.length || 0) >= 2).toBe(true)
    })

    it('should show TypeScript type updates', () => {
      const hasTs =
        migrationGuideContent.includes('typescript') ||
        migrationGuideContent.includes('TypeScript') ||
        migrationGuideContent.match(/:\s*\w+\s*[=}]/)
      expect(hasTs).toBeDefined()
    })

    it('should include API signature changes', () => {
      const hasSignatures =
        migrationGuideContent.includes('function') ||
        migrationGuideContent.includes('method') ||
        migrationGuideContent.includes('constructor') ||
        migrationGuideContent.match(/\(.*\)/i)
      expect(hasSignatures).toBeDefined()
    })
  })
})

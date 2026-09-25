import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

describe('Getting Started Quickstart (Issue #296)', () => {
  let readmeContent: string

  beforeEach(() => {
    const readmePath = join(process.cwd(), 'README.md')
    readmeContent = readFileSync(readmePath, 'utf-8')
  })

  describe('README quickstart section', () => {
    it('should include a quick start section', () => {
      expect(readmeContent).toContain('Quick Start')
    })

    it('should provide React quickstart example', () => {
      expect(readmeContent).toMatch(/React|react/i)
      expect(readmeContent).toContain('SorobanResurrectProvider')
    })

    it('should provide SDK usage example', () => {
      expect(readmeContent).toContain('SorobanResurrect')
      expect(readmeContent).toContain('checkAndPrepare')
    })

    it('should include example app reference', () => {
      expect(readmeContent).toContain('example')
      expect(readmeContent).toMatch(/example.*app|example.*application|npm run example/i)
    })

    it('should include installation instructions', () => {
      expect(readmeContent).toContain('npm')
      expect(readmeContent).toMatch(/npm\s+install|npm\s+run/i)
    })

    it('should have code examples with proper formatting', () => {
      const codeBlocks = readmeContent.match(/```[\s\S]*?```/g)
      expect(codeBlocks).toBeDefined()
      expect(codeBlocks?.length).toBeGreaterThan(0)
    })

    it('should include description of problem and solution', () => {
      expect(readmeContent).toContain('Problem')
      expect(readmeContent).toContain('Soroban')
    })
  })

  describe('5-minute quickstart path', () => {
    it('should have clear step-by-step instructions', () => {
      expect(readmeContent).toMatch(/step|Step|Setup|setup/i)
    })

    it('should link to example app', () => {
      expect(readmeContent).toMatch(/example|packages\/example/i)
    })

    it('should provide working code examples', () => {
      expect(readmeContent).toContain('executeWithRestore')
      expect(readmeContent).toContain('rpcUrl')
      expect(readmeContent).toContain('networkPassphrase')
    })

    it('should include error handling guidance', () => {
      const hasErrorHandling =
        readmeContent.includes('error') ||
        readmeContent.includes('Error') ||
        readmeContent.includes('try') ||
        readmeContent.includes('catch')
      expect(hasErrorHandling).toBe(true)
    })
  })

  describe('README badges and links', () => {
    it('should include CI/CD badges', () => {
      expect(readmeContent).toContain('badge')
      expect(readmeContent).toContain('CI')
    })

    it('should have links to documentation', () => {
      expect(readmeContent).toMatch(/\[.*\]\(.*\.md\)/g)
    })

    it('should reference packages table', () => {
      expect(readmeContent).toContain('Package')
      expect(readmeContent).toContain('Description')
    })
  })

  describe('development setup', () => {
    it('should include dev setup instructions', () => {
      expect(readmeContent).toContain('Development')
      expect(readmeContent).toContain('npm install')
    })

    it('should document build command', () => {
      expect(readmeContent).toContain('npm run build')
    })

    it('should document test command', () => {
      expect(readmeContent).toContain('npm run test')
    })

    it('should document example app startup', () => {
      expect(readmeContent).toContain('npm run example')
    })
  })
})

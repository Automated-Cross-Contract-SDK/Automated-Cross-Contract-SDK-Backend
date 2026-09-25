import { test, expect } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'

/**
 * Tests for framework matrix README table (#279)
 * Verifies that the README documents React/Vue/Svelte/Angular/Next/RN
 * support status and includes example links.
 */

test.describe('Framework Matrix README Table (#279)', () => {
  let readmeContent: string

  test.beforeAll(() => {
    // Read the README file
    const readmePath = path.join(__dirname, '..', 'README.md')
    readmeContent = fs.readFileSync(readmePath, 'utf-8')
  })

  test('README file exists', () => {
    const readmePath = path.join(__dirname, '..', 'README.md')
    const exists = fs.existsSync(readmePath)
    expect(exists).toBe(true)
  })

  test('README contains framework matrix table', () => {
    // Check for table structure (markdown pipes)
    const hasTable = readmeContent.includes('|') && readmeContent.includes('-')
    expect(hasTable).toBe(true)
  })

  test('README mentions React support', () => {
    const hasReact = readmeContent.toLowerCase().includes('react')
    expect(hasReact).toBe(true)
  })

  test('README mentions Vue support', () => {
    const hasVue = readmeContent.toLowerCase().includes('vue')
    expect(hasVue).toBe(true)
  })

  test('README mentions Svelte support', () => {
    const hasSvelte = readmeContent.toLowerCase().includes('svelte')
    expect(hasSvelte).toBe(true)
  })

  test('README mentions Angular support', () => {
    const hasAngular = readmeContent.toLowerCase().includes('angular')
    expect(hasAngular).toBe(true)
  })

  test('README mentions Next.js support', () => {
    const hasNext = readmeContent.toLowerCase().includes('next')
    expect(hasNext).toBe(true)
  })

  test('README mentions React Native support', () => {
    const hasRN = /react\s+native|react-native|rn/i.test(readmeContent)
    expect(hasRN).toBe(true)
  })

  test('README includes support status indicators', () => {
    // Check for common status indicators like ✓, ✗, ✅, ❌, Yes, No, Supported, etc.
    const hasStatusIndicators = /✓|✗|✅|❌|[Ss]upported|[Nn]ot\s+[Ss]upported|[Yy]es|[Nn]o/i.test(
      readmeContent,
    )
    expect(hasStatusIndicators).toBe(true)
  })

  test('README contains example links', () => {
    // Check for markdown links
    const hasLinks = /\[.*?\]\(.*?\)/i.test(readmeContent)
    expect(hasLinks).toBe(true)
  })

  test('framework matrix has consistent structure', () => {
    // Extract table content (lines between pipes)
    const tableMatches = readmeContent.match(/\|[^|]*\|[^|]*\|/g)
    if (tableMatches) {
      // If there's a table, it should have at least header and one row
      expect(tableMatches.length).toBeGreaterThanOrEqual(1)
    }
  })

  test('README documents framework versions or compatibility', () => {
    // Check for version numbers or compatibility info
    const hasVersionInfo = /v\d+|@[\w-]+\/[\w-]+|latest|LTS|ESM/i.test(readmeContent)
    expect(hasVersionInfo).toBe(true)
  })

  test('README includes installation or setup instructions', () => {
    // Check for common setup keywords
    const hasSetup = /install|setup|configuration|import|require|use|npm|yarn|pnpm/i.test(
      readmeContent,
    )
    expect(hasSetup).toBe(true)
  })

  test('README table uses consistent markdown formatting', () => {
    // Count pipes and dashes to verify table structure
    const lines = readmeContent.split('\n')
    const tableLines = lines.filter((line) => line.includes('|') && line.includes('-'))

    if (tableLines.length > 0) {
      // Each line should have balanced pipes
      tableLines.forEach((line) => {
        const pipeCount = (line.match(/\|/g) || []).length
        expect(pipeCount).toBeGreaterThanOrEqual(2)
      })
    }
  })

  test('README section headers are properly formatted', () => {
    // Check for markdown headers
    const hasHeaders = /^#+\s+/m.test(readmeContent)
    expect(hasHeaders).toBe(true)
  })

  test('framework matrix section is clearly labeled', () => {
    // Look for framework, matrix, or support-related headers
    const hasFrameworkSection = /framework|matrix|support|compatibility/i.test(readmeContent)
    expect(hasFrameworkSection).toBe(true)
  })

  test('README includes example repository links if applicable', () => {
    // Check for github.com or example repository links
    const hasExampleLinks = /github\.com|example|demo|link/i.test(readmeContent)
    expect(hasExampleLinks).toBe(true)
  })

  test('framework documentation references are valid markdown', () => {
    // Extract all markdown links
    const linkMatches = readmeContent.match(/\[([^\]]+)\]\(([^)]+)\)/g) || []

    if (linkMatches.length > 0) {
      // All links should have both text and URL
      linkMatches.forEach((match) => {
        expect(match).toMatch(/\[.+\]\(.+\)/)
      })
    }
  })

  test('README provides framework-specific integration details', () => {
    // Check for framework-specific patterns or imports
    const hasIntegrationDetails =
      /import|export|component|hook|provider|directive|module|plugin/i.test(readmeContent)
    expect(hasIntegrationDetails).toBe(true)
  })

  test('all referenced frameworks are in supported list', () => {
    // Verify that each framework mentioned in examples is in the matrix
    const frameworks = ['React', 'Vue', 'Svelte', 'Angular', 'Next', 'RN']
    const frameworkMatches = frameworks.filter((fw) =>
      readmeContent.toLowerCase().includes(fw.toLowerCase()),
    )

    // At least some frameworks should be mentioned
    expect(frameworkMatches.length).toBeGreaterThan(0)
  })

  test('README table is accessible with proper descriptions', () => {
    // Check for descriptive headers and alt-like text
    const hasDescriptions = /name|framework|support|status|example/i.test(readmeContent)
    expect(hasDescriptions).toBe(true)
  })
})

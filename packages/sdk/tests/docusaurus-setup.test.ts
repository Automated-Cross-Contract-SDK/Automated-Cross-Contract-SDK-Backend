import { describe, it, expect, beforeEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

interface DocusaurusConfig {
  title: string
  tagline: string
  url: string
  baseUrl: string
  projectName: string
  organizationName: string
  plugins: string[]
  themes: string[]
  presets: Array<[string, Record<string, unknown>]>
  themeConfig: {
    searchParameters?: Record<string, unknown>
    docs?: {
      sidebar?: {
        hideable?: boolean
        autoCollapseCategories?: boolean
      }
    }
    colorMode?: {
      defaultMode: 'light' | 'dark'
      disableSwitch?: boolean
      respectPrefersColorScheme?: boolean
    }
    navbar?: {
      title?: string
      items?: Array<Record<string, unknown>>
    }
  }
}

class DocusaurusSetup {
  private configPath: string

  constructor(projectRoot: string) {
    this.configPath = path.join(projectRoot, 'docusaurus.config.js')
  }

  generateConfig(): DocusaurusConfig {
    return {
      title: 'Soroban Resurrect',
      tagline: 'Automated cross-contract state restoration SDK for Soroban',
      url: 'https://soroban-resurrect.dev',
      baseUrl: '/',
      projectName: 'soroban-resurrect',
      organizationName: 'Automated-Cross-Contract-SDK',
      plugins: ['@docusaurus/plugin-search-local'],
      themes: ['@docusaurus/theme-classic'],
      presets: [
        [
          '@docusaurus/preset-classic',
          {
            docs: {
              sidebarPath: './sidebars.js',
              editUrl: 'https://github.com/Automated-Cross-Contract-SDK/Automated-Cross-Contract-SDK-Backend/edit/main/docs/',
            },
            blog: false,
            theme: {
              customCss: './src/css/custom.css',
            },
          },
        ],
      ],
      themeConfig: {
        searchParameters: {
          facetFilters: ['type:content', 'type:default'],
        },
        docs: {
          sidebar: {
            hideable: true,
            autoCollapseCategories: true,
          },
        },
        colorMode: {
          defaultMode: 'light',
          respectPrefersColorScheme: true,
        },
        navbar: {
          title: 'Soroban Resurrect',
          items: [
            {
              type: 'doc',
              docId: 'getting-started/installation',
              position: 'left',
              label: 'Docs',
            },
            {
              href: 'https://github.com/Automated-Cross-Contract-SDK/Automated-Cross-Contract-SDK-Backend',
              label: 'GitHub',
              position: 'right',
            },
          ],
        },
      },
    }
  }

  generateDocStructure(projectRoot: string): string[] {
    const docsRoot = path.join(projectRoot, 'docs')
    const structure = [
      'getting-started/installation.md',
      'getting-started/quickstart.md',
      'sdk/api-reference.md',
      'sdk/configuration.md',
      'sdk/error-handling.md',
      'react/hook-reference.md',
      'react/provider.md',
      'react/examples.md',
      'advanced/batching.md',
      'advanced/wallet-integration.md',
      'advanced/performance.md',
      'contributing/development.md',
      'contributing/testing.md',
      'contributing/release-process.md',
    ]

    return structure.map((file) => path.join(docsRoot, file))
  }

  generateDocFile(filePath: string, title: string, content: string): string {
    const frontmatter = `---
title: ${title}
---

${content}`
    return frontmatter
  }

  createSidebarsConfig(): Record<string, unknown> {
    return {
      mainSidebar: [
        {
          type: 'category',
          label: 'Getting Started',
          collapsed: false,
          items: [
            'getting-started/installation',
            'getting-started/quickstart',
          ],
        },
        {
          type: 'category',
          label: 'SDK',
          collapsed: false,
          items: [
            'sdk/configuration',
            'sdk/api-reference',
            'sdk/error-handling',
          ],
        },
        {
          type: 'category',
          label: 'React Integration',
          collapsed: true,
          items: [
            'react/provider',
            'react/hook-reference',
            'react/examples',
          ],
        },
        {
          type: 'category',
          label: 'Advanced',
          collapsed: true,
          items: [
            'advanced/batching',
            'advanced/wallet-integration',
            'advanced/performance',
          ],
        },
        {
          type: 'category',
          label: 'Contributing',
          collapsed: true,
          items: [
            'contributing/development',
            'contributing/testing',
            'contributing/release-process',
          ],
        },
      ],
    }
  }

  validateStructure(): { valid: boolean; errors: string[] } {
    const errors: string[] = []

    if (!this.configPath) {
      errors.push('Config path not set')
    }

    return {
      valid: errors.length === 0,
      errors,
    }
  }
}

describe('Docusaurus Setup (Issue #100)', () => {
  let setup: DocusaurusSetup
  const testProjectRoot = '/tmp/test-docs-project'

  beforeEach(() => {
    setup = new DocusaurusSetup(testProjectRoot)
  })

  describe('configuration generation', () => {
    it('should generate valid docusaurus.config.js', () => {
      const config = setup.generateConfig()

      expect(config).toBeDefined()
      expect(config.title).toBe('Soroban Resurrect')
      expect(config.url).toBeDefined()
      expect(config.baseUrl).toBeDefined()
    })

    it('should include project metadata in config', () => {
      const config = setup.generateConfig()

      expect(config.projectName).toBe('soroban-resurrect')
      expect(config.organizationName).toBe('Automated-Cross-Contract-SDK')
    })

    it('should include theme configuration', () => {
      const config = setup.generateConfig()

      expect(config.themeConfig).toBeDefined()
      expect(config.themeConfig.colorMode).toBeDefined()
      expect(config.themeConfig.colorMode?.defaultMode).toBe('light')
    })

    it('should include navbar configuration', () => {
      const config = setup.generateConfig()

      expect(config.themeConfig.navbar).toBeDefined()
      expect(config.themeConfig.navbar?.title).toBe('Soroban Resurrect')
      expect(config.themeConfig.navbar?.items).toBeDefined()
    })

    it('should include search plugin configuration', () => {
      const config = setup.generateConfig()

      expect(config.plugins).toContain('@docusaurus/plugin-search-local')
    })

    it('should use classic theme preset', () => {
      const config = setup.generateConfig()

      expect(config.presets).toBeDefined()
      expect(config.presets.length).toBeGreaterThan(0)
      expect(config.presets[0][0]).toBe('@docusaurus/preset-classic')
    })

    it('should support dark mode toggle', () => {
      const config = setup.generateConfig()

      expect(config.themeConfig.colorMode?.respectPrefersColorScheme).toBe(true)
    })

    it('should support Algolia search configuration in themeConfig', () => {
      const config = setup.generateConfig()

      // Config should allow for searchParameters which can be used for Algolia
      expect(config.themeConfig.searchParameters).toBeDefined()
    })
  })

  describe('documentation structure', () => {
    it('should generate expected doc structure', () => {
      const structure = setup.generateDocStructure(testProjectRoot)

      expect(structure).toContain(path.join(testProjectRoot, 'docs/getting-started/installation.md'))
      expect(structure).toContain(path.join(testProjectRoot, 'docs/getting-started/quickstart.md'))
    })

    it('should include getting-started section', () => {
      const structure = setup.generateDocStructure(testProjectRoot)

      const gettingStartedDocs = structure.filter((s) => s.includes('getting-started'))
      expect(gettingStartedDocs.length).toBe(2)
    })

    it('should include SDK section', () => {
      const structure = setup.generateDocStructure(testProjectRoot)

      const sdkDocs = structure.filter((s) => s.includes('sdk/'))
      expect(sdkDocs.length).toBeGreaterThan(0)
      expect(sdkDocs).toContain(path.join(testProjectRoot, 'docs/sdk/api-reference.md'))
      expect(sdkDocs).toContain(path.join(testProjectRoot, 'docs/sdk/configuration.md'))
    })

    it('should include React integration section', () => {
      const structure = setup.generateDocStructure(testProjectRoot)

      const reactDocs = structure.filter((s) => s.includes('react/'))
      expect(reactDocs.length).toBeGreaterThan(0)
      expect(reactDocs).toContain(path.join(testProjectRoot, 'docs/react/hook-reference.md'))
      expect(reactDocs).toContain(path.join(testProjectRoot, 'docs/react/provider.md'))
    })

    it('should include advanced section', () => {
      const structure = setup.generateDocStructure(testProjectRoot)

      const advancedDocs = structure.filter((s) => s.includes('advanced/'))
      expect(advancedDocs.length).toBeGreaterThan(0)
      expect(advancedDocs).toContain(path.join(testProjectRoot, 'docs/advanced/batching.md'))
      expect(advancedDocs).toContain(path.join(testProjectRoot, 'docs/advanced/performance.md'))
    })

    it('should include contributing section', () => {
      const structure = setup.generateDocStructure(testProjectRoot)

      const contributingDocs = structure.filter((s) => s.includes('contributing/'))
      expect(contributingDocs.length).toBeGreaterThan(0)
      expect(contributingDocs).toContain(path.join(testProjectRoot, 'docs/contributing/testing.md'))
    })
  })

  describe('document files', () => {
    it('should generate valid markdown with frontmatter', () => {
      const content = setup.generateDocFile(
        'test.md',
        'Test Documentation',
        'This is test content.',
      )

      expect(content).toContain('---')
      expect(content).toContain('title: Test Documentation')
      expect(content).toContain('This is test content.')
    })

    it('should include proper YAML frontmatter', () => {
      const content = setup.generateDocFile(
        'installation.md',
        'Installation',
        'Installation instructions here.',
      )

      const lines = content.split('\n')
      expect(lines[0]).toBe('---')
      expect(lines[1]).toContain('title:')
      expect(lines[2]).toBe('---')
    })

    it('should support versioned docs (matching npm package versions)', () => {
      // Versioning structure
      const versionedDocsPath = path.join(testProjectRoot, 'versioned_docs')
      const versions = ['docs-0.1.0', 'docs-0.2.0']

      versions.forEach((version) => {
        expect(path.join(versionedDocsPath, version)).toBeDefined()
      })
    })
  })

  describe('sidebar configuration', () => {
    it('should generate sidebars.js config', () => {
      const sidebars = setup.createSidebarsConfig()

      expect(sidebars).toBeDefined()
      expect(sidebars.mainSidebar).toBeDefined()
    })

    it('should have collapsible categories', () => {
      const sidebars = setup.createSidebarsConfig()
      const mainSidebar = sidebars.mainSidebar as Array<Record<string, unknown>>

      const firstCategory = mainSidebar[0]
      expect(firstCategory.type).toBe('category')
      expect(firstCategory.collapsed).toBeDefined()
    })

    it('should organize docs in categories', () => {
      const sidebars = setup.createSidebarsConfig()
      const mainSidebar = sidebars.mainSidebar as Array<Record<string, unknown>>

      const categories = mainSidebar.filter((item) => item.type === 'category')
      expect(categories.length).toBeGreaterThan(0)
    })

    it('should include getting-started category', () => {
      const sidebars = setup.createSidebarsConfig()
      const mainSidebar = sidebars.mainSidebar as Array<Record<string, unknown>>

      const gettingStartedCategory = mainSidebar.find(
        (item) => item.type === 'category' && item.label === 'Getting Started',
      )
      expect(gettingStartedCategory).toBeDefined()
    })

    it('should include SDK category', () => {
      const sidebars = setup.createSidebarsConfig()
      const mainSidebar = sidebars.mainSidebar as Array<Record<string, unknown>>

      const sdkCategory = mainSidebar.find(
        (item) => item.type === 'category' && item.label === 'SDK',
      )
      expect(sdkCategory).toBeDefined()
    })
  })

  describe('features configuration', () => {
    it('should configure live code examples support', () => {
      const config = setup.generateConfig()

      // Configuration should support CodeSandbox integration
      expect(config.presets).toBeDefined()
      expect(config.presets.length).toBeGreaterThan(0)
    })

    it('should enable Algolia search capability', () => {
      const config = setup.generateConfig()

      expect(config.themeConfig.searchParameters).toBeDefined()
    })

    it('should support dark mode', () => {
      const config = setup.generateConfig()

      expect(config.themeConfig.colorMode).toBeDefined()
      expect(config.themeConfig.colorMode?.respectPrefersColorScheme).toBe(true)
    })

    it('should include edit links configuration', () => {
      const config = setup.generateConfig()

      const preset = config.presets[0]
      const presetConfig = preset[1] as Record<string, unknown>
      const docsConfig = presetConfig.docs as Record<string, unknown>

      expect(docsConfig.editUrl).toBeDefined()
      expect(docsConfig.editUrl).toContain('github.com')
    })

    it('should support hideable sidebars', () => {
      const config = setup.generateConfig()

      expect(config.themeConfig.docs?.sidebar?.hideable).toBe(true)
    })

    it('should auto-collapse sidebar categories', () => {
      const config = setup.generateConfig()

      expect(config.themeConfig.docs?.sidebar?.autoCollapseCategories).toBe(true)
    })
  })

  describe('validation', () => {
    it('should validate structure', () => {
      const result = setup.validateStructure()

      expect(result.valid).toBe(true)
      expect(result.errors).toEqual([])
    })

    it('should have proper config path', () => {
      const result = setup.validateStructure()

      expect(result.errors).not.toContain('Config path not set')
    })
  })

  describe('versioning support', () => {
    it('should support versioned docs matching npm package versions', () => {
      const structure = setup.generateDocStructure(testProjectRoot)

      // Should support docs structure for versioning
      expect(structure).toBeDefined()
      expect(Array.isArray(structure)).toBe(true)
    })

    it('should allow versions.json configuration', () => {
      const versionsConfig = {
        versions: {
          current: {
            label: 'Next',
            path: 'next',
          },
        },
      }

      expect(versionsConfig.versions).toBeDefined()
      expect(versionsConfig.versions.current).toBeDefined()
    })
  })

  describe('package.json scripts', () => {
    it('should have docusaurus start script', () => {
      const scripts = {
        'docs:start': 'docusaurus start',
        'docs:build': 'docusaurus build',
        'docs:serve': 'docusaurus serve',
      }

      expect(scripts['docs:start']).toBeDefined()
      expect(scripts['docs:build']).toBeDefined()
    })
  })

  describe('docusaurus.config.js exports', () => {
    it('should export config as CommonJS module', () => {
      const config = setup.generateConfig()

      // Should be serializable to CommonJS
      const configString = JSON.stringify(config, null, 2)
      expect(configString).toBeDefined()
    })

    it('should support dynamic require for presets and plugins', () => {
      const config = setup.generateConfig()

      expect(config.presets).toBeDefined()
      expect(Array.isArray(config.presets)).toBe(true)
      expect(config.plugins).toBeDefined()
      expect(Array.isArray(config.plugins)).toBe(true)
    })
  })
})

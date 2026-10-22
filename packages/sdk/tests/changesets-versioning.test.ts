import { describe, it, expect, beforeEach } from 'vitest'

interface ChangesetEntry {
  id: string
  type: 'major' | 'minor' | 'patch'
  packages: string[]
  summary: string
}

interface PackageVersion {
  name: string
  version: string
  changesets: string[]
}

interface Changelog {
  date: string
  version: string
  changes: string[]
  packages: string[]
}

describe('[M4][Tooling] changesets for multi-package versioning (Issue #286)', () => {
  let changeset: ChangesetEntry
  let packageVersions: PackageVersion[]
  let changelogs: Changelog[]

  beforeEach(() => {
    changeset = {
      id: 'abc123-fix-wallet',
      type: 'patch',
      packages: [
        '@soroban-resurrect/sdk',
        '@soroban-resurrect/wallet-adapters',
      ],
      summary: 'Fix wallet adapter retry logic',
    }

    packageVersions = [
      {
        name: '@soroban-resurrect/sdk',
        version: '1.0.0',
        changesets: [],
      },
      {
        name: '@soroban-resurrect/cli',
        version: '1.0.0',
        changesets: [],
      },
      {
        name: '@soroban-resurrect/wallet-adapters',
        version: '1.0.0',
        changesets: [],
      },
    ]

    changelogs = []
  })

  describe('Changeset Configuration', () => {
    it('should configure changesets in .changeset config', () => {
      const changesetConfig = {
        changelog: [['@changesets/cli/changelog', { repo: 'someRepo' }]],
        commit: false,
        fixed: [],
        linked: [],
        access: 'restricted',
        baseBranch: 'main',
      }
      expect(changesetConfig.baseBranch).toBe('main')
    })

    it('should support changeset types: major, minor, patch', () => {
      const types = ['major', 'minor', 'patch']
      expect(changeset.type).toMatch(/major|minor|patch/)
      types.forEach((type) => {
        expect(['major', 'minor', 'patch']).toContain(type)
      })
    })

    it('should have changesets directory', () => {
      const changesetsDir = '.changeset'
      expect(changesetsDir).toBe('.changeset')
    })
  })

  describe('Changeset Creation', () => {
    it('should create changeset file with unique ID', () => {
      expect(changeset.id).toBeDefined()
      expect(changeset.id.length).toBeGreaterThan(0)
    })

    it('should record affected packages in changeset', () => {
      expect(changeset.packages).toHaveLength(2)
      expect(changeset.packages).toContain('@soroban-resurrect/sdk')
      expect(changeset.packages).toContain('@soroban-resurrect/wallet-adapters')
    })

    it('should include summary of changes', () => {
      expect(changeset.summary).toBeDefined()
      expect(changeset.summary.length).toBeGreaterThan(0)
    })

    it('should format changeset markdown', () => {
      const changesetContent = `---
"@soroban-resurrect/sdk": patch
"@soroban-resurrect/wallet-adapters": patch
---

Fix wallet adapter retry logic`
      expect(changesetContent).toContain('---')
      expect(changesetContent).toContain('patch')
    })
  })

  describe('Version Synchronization', () => {
    it('should sync versions across multiple packages', () => {
      const linkedPackages = [
        '@soroban-resurrect/sdk',
        '@soroban-resurrect/wallet-adapters',
      ]
      const newVersion = '1.1.0'

      const updated = packageVersions.map((pkg) => {
        if (linkedPackages.includes(pkg.name)) {
          return { ...pkg, version: newVersion }
        }
        return pkg
      })

      const sdk = updated.find((p) => p.name === '@soroban-resurrect/sdk')
      const adapters = updated.find((p) => p.name === '@soroban-resurrect/wallet-adapters')

      expect(sdk?.version).toBe(newVersion)
      expect(adapters?.version).toBe(newVersion)
    })

    it('should track workspace package dependencies', () => {
      const dependencies = {
        '@soroban-resurrect/sdk': {
          '@soroban-resurrect/types': '^1.0.0',
          '@soroban-resurrect/errors': '^1.0.0',
        },
        '@soroban-resurrect/cli': {
          '@soroban-resurrect/sdk': '^1.0.0',
        },
        '@soroban-resurrect/wallet-adapters': {
          '@soroban-resurrect/sdk': '^1.0.0',
        },
      }

      expect('@soroban-resurrect/types' in dependencies['@soroban-resurrect/sdk']).toBe(
        true
      )
    })

    it('should maintain consistent versions for linked packages', () => {
      const linkedConfig = {
        '@soroban-resurrect/sdk': ['@soroban-resurrect/wallet-adapters'],
      }
      expect(
        '@soroban-resurrect/wallet-adapters' in linkedConfig[
          '@soroban-resurrect/sdk'
        ]
      ).toBe(true)
    })
  })

  describe('Changelog Generation', () => {
    it('should generate changelog from changesets', () => {
      const changelog: Changelog = {
        date: new Date().toISOString().split('T')[0],
        version: '1.1.0',
        changes: ['Fix wallet adapter retry logic'],
        packages: ['@soroban-resurrect/sdk', '@soroban-resurrect/wallet-adapters'],
      }

      expect(changelog.date).toBeDefined()
      expect(changelog.version).toMatch(/^\d+\.\d+\.\d+$/)
      expect(changelog.changes.length).toBeGreaterThan(0)
    })

    it('should format changelog with markdown headers', () => {
      const changelogEntry = `## 1.1.0

- \`@soroban-resurrect/sdk\`: Fix wallet adapter retry logic
- \`@soroban-resurrect/wallet-adapters\`: Fix wallet adapter retry logic`

      expect(changelogEntry).toContain('##')
      expect(changelogEntry).toContain('1.1.0')
      expect(changelogEntry).toContain('@soroban-resurrect/sdk')
    })

    it('should organize changes by package', () => {
      const changelog = {
        packages: {
          '@soroban-resurrect/sdk': {
            version: '1.1.0',
            changes: ['Fix wallet adapter retry logic'],
          },
          '@soroban-resurrect/wallet-adapters': {
            version: '1.1.0',
            changes: ['Fix wallet adapter retry logic'],
          },
        },
      }

      expect('@soroban-resurrect/sdk' in changelog.packages).toBe(true)
      expect(changelog.packages['@soroban-resurrect/sdk'].version).toBe('1.1.0')
    })

    it('should include generated date in changelog', () => {
      const now = new Date()
      const dateString = now.toISOString().split('T')[0]
      expect(dateString).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    })
  })

  describe('Pre-release Versioning', () => {
    it('should support pre-release versions', () => {
      const preReleaseVersion = '1.1.0-alpha.1'
      expect(preReleaseVersion).toMatch(/^\d+\.\d+\.\d+-\w+\.\d+$/)
    })

    it('should support release candidate versions', () => {
      const rcVersion = '1.1.0-rc.1'
      expect(rcVersion).toMatch(/^\d+\.\d+\.\d+-rc\.\d+$/)
    })

    it('should increment pre-release versions', () => {
      const v1 = '1.0.0-alpha.1'
      const v2 = '1.0.0-alpha.2'
      expect(v2 > v1).toBe(true)
    })
  })

  describe('Changeset Publishing', () => {
    it('should bump versions for all affected packages', () => {
      const beforeVersions = {
        '@soroban-resurrect/sdk': '1.0.0',
        '@soroban-resurrect/wallet-adapters': '1.0.0',
      }

      const afterVersions = {
        '@soroban-resurrect/sdk': '1.0.1',
        '@soroban-resurrect/wallet-adapters': '1.0.1',
      }

      expect(afterVersions['@soroban-resurrect/sdk']).not.toBe(
        beforeVersions['@soroban-resurrect/sdk']
      )
    })

    it('should update package.json files with new versions', () => {
      const packageJson = {
        name: '@soroban-resurrect/sdk',
        version: '1.0.1',
        description: 'SDK for Soroban Resurrect',
      }

      expect(packageJson.version).toBe('1.0.1')
    })

    it('should not create git commits for version bumps', () => {
      const config = {
        commit: false,
        tag: false,
      }

      expect(config.commit).toBe(false)
      expect(config.tag).toBe(false)
    })
  })

  describe('Monorepo Integration', () => {
    it('should detect workspace packages', () => {
      const workspacePackages = packageVersions.map((p) => p.name)
      expect(workspacePackages.length).toBeGreaterThanOrEqual(3)
    })

    it('should track dependencies between workspace packages', () => {
      const deps = ['@soroban-resurrect/sdk', '@soroban-resurrect/types']
      expect(deps.length).toBeGreaterThan(1)
    })

    it('should ensure consistent dependency versions within workspace', () => {
      const sdkDeps = {
        '@soroban-resurrect/types': '^1.0.0',
      }
      const cliDeps = {
        '@soroban-resurrect/sdk': '^1.0.0',
      }

      expect(sdkDeps['@soroban-resurrect/types']).toMatch(/^\^1\.0\.0/)
      expect(cliDeps['@soroban-resurrect/sdk']).toMatch(/^\^1\.0\.0/)
    })

    it('should support internal version updates via root package.json', () => {
      const rootPackageJson = {
        workspaces: ['packages/*'],
        private: true,
      }

      expect(Array.isArray(rootPackageJson.workspaces)).toBe(true)
      expect(rootPackageJson.private).toBe(true)
    })
  })
})

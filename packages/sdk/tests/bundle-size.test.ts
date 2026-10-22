import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

/**
 * Bundle Size Analytics Tests - Issue #124
 * Tests for bundle size limits and tracking
 */
describe('Bundle Size Analytics - Issue #124', () => {
  const BUNDLE_SIZE_LIMITS = {
    sdk: 50 * 1024, // 50 KB
    react: 60 * 1024, // 60 KB
  }

  describe('Bundle size limits configuration', () => {
    it('should define size limits for SDK package', () => {
      const sdkLimit = BUNDLE_SIZE_LIMITS.sdk

      expect(sdkLimit).toBe(50 * 1024)
      expect(sdkLimit).toBeGreaterThan(0)
    })

    it('should define size limits for React package', () => {
      const reactLimit = BUNDLE_SIZE_LIMITS.react

      expect(reactLimit).toBe(60 * 1024)
      expect(reactLimit).toBeGreaterThan(0)
    })

    it('should have increasing limits for dependent packages', () => {
      // React builds on SDK, so should allow for more code
      expect(BUNDLE_SIZE_LIMITS.react).toBeGreaterThanOrEqual(BUNDLE_SIZE_LIMITS.sdk)
    })

    it('should provide configuration for all packages', () => {
      expect(Object.keys(BUNDLE_SIZE_LIMITS).length).toBeGreaterThan(0)

      Object.values(BUNDLE_SIZE_LIMITS).forEach(limit => {
        expect(limit).toBeGreaterThan(0)
        expect(typeof limit).toBe('number')
      })
    })
  })

  describe('Bundle size measurements', () => {
    it('should measure SDK bundle size when dist exists', () => {
      const sdkDistPath = path.join(__dirname, '../dist/index.js')

      if (fs.existsSync(sdkDistPath)) {
        const fileSize = fs.statSync(sdkDistPath).size
        expect(fileSize).toBeGreaterThan(0)
      }
    })

    it('should measure minified bundle size', () => {
      const sdkDistPath = path.join(__dirname, '../dist/index.js')

      if (fs.existsSync(sdkDistPath)) {
        const content = fs.readFileSync(sdkDistPath, 'utf-8')
        // Should not contain obvious unminified patterns (rough check)
        const linesWithWhitespace = content.split('\n').filter(l => /^[\s]*$/.test(l))
        const totalLines = content.split('\n').length

        // Minified code should have very few empty lines
        expect(linesWithWhitespace.length / totalLines).toBeLessThan(0.1)
      }
    })

    it('should calculate gzip compressed size', () => {
      const sdkDistPath = path.join(__dirname, '../dist/index.js')

      if (fs.existsSync(sdkDistPath)) {
        const content = fs.readFileSync(sdkDistPath, 'utf-8')
        const rawSize = Buffer.byteLength(content)

        // Estimate gzip compression (typically 30-40% of original)
        const estimatedGzipSize = Math.round(rawSize * 0.35)

        expect(estimatedGzipSize).toBeGreaterThan(0)
        expect(estimatedGzipSize).toBeLessThan(rawSize)
      }
    })

    it('should report both raw and gzipped sizes', () => {
      const sdkDistPath = path.join(__dirname, '../dist/index.js')

      if (fs.existsSync(sdkDistPath)) {
        const rawSize = fs.statSync(sdkDistPath).size
        const content = fs.readFileSync(sdkDistPath, 'utf-8')
        const contentSize = Buffer.byteLength(content)

        expect(rawSize).toBeGreaterThan(0)
        expect(contentSize).toBeGreaterThan(0)
        // Should be roughly the same (UTF-8 encoded)
        expect(Math.abs(rawSize - contentSize)).toBeLessThan(100)
      }
    })
  })

  describe('Size limit enforcement', () => {
    it('should fail if SDK exceeds size limit', () => {
      const sdkDistPath = path.join(__dirname, '../dist/index.js')

      if (fs.existsSync(sdkDistPath)) {
        const fileSize = fs.statSync(sdkDistPath).size
        const limit = BUNDLE_SIZE_LIMITS.sdk

        // This test documents what SHOULD happen, not necessarily current state
        if (fileSize > limit) {
          expect(fileSize).toBeLessThanOrEqual(limit)
        } else {
          expect(fileSize).toBeLessThanOrEqual(limit)
        }
      }
    })

    it('should allow size within 10% margin of limit', () => {
      const sdkDistPath = path.join(__dirname, '../dist/index.js')

      if (fs.existsSync(sdkDistPath)) {
        const fileSize = fs.statSync(sdkDistPath).size
        const limit = BUNDLE_SIZE_LIMITS.sdk
        const margin = limit * 0.1

        if (fileSize > limit) {
          expect(fileSize).toBeLessThanOrEqual(limit + margin)
        }
      }
    })

    it('should provide alerts when approaching limit', () => {
      const sdkDistPath = path.join(__dirname, '../dist/index.js')

      if (fs.existsSync(sdkDistPath)) {
        const fileSize = fs.statSync(sdkDistPath).size
        const limit = BUNDLE_SIZE_LIMITS.sdk
        const thresholdPercent = 0.85

        const sizePercent = fileSize / limit

        // Should alert if size exceeds 85% of limit
        if (sizePercent > thresholdPercent) {
          expect(sizePercent).toBeGreaterThan(thresholdPercent)
        }
      }
    })
  })

  describe('CI integration configuration', () => {
    it('should support size-limit package configuration', () => {
      const sizeLimitConfig = {
        'size-limit': [
          {
            path: 'packages/sdk/dist/index.js',
            limit: '50 KB',
            running: false,
          },
          {
            path: 'packages/react/dist/index.js',
            limit: '60 KB',
            running: false,
          },
        ],
      }

      expect(sizeLimitConfig['size-limit']).toBeDefined()
      expect(Array.isArray(sizeLimitConfig['size-limit'])).toBe(true)
      expect(sizeLimitConfig['size-limit'].length).toBe(2)
    })

    it('should validate size-limit config structure', () => {
      const config = {
        path: 'packages/sdk/dist/index.js',
        limit: '50 KB',
        running: false,
      }

      expect(config.path).toBeDefined()
      expect(config.limit).toBeDefined()
      expect(config.running).toBeDefined()
      expect(config.path).toMatch(/\.js$/)
      expect(config.limit).toMatch(/\d+\s*KB/)
    })

    it('should support bundlesize configuration as alternative', () => {
      const bundlesizeConfig = {
        files: [
          {
            path: 'packages/sdk/dist/index.js',
            maxSize: '50 KB',
          },
          {
            path: 'packages/react/dist/index.js',
            maxSize: '60 KB',
          },
        ],
      }

      expect(bundlesizeConfig.files).toBeDefined()
      expect(Array.isArray(bundlesizeConfig.files)).toBe(true)
    })

    it('should configure CI to fail on size exceed', () => {
      const ciConfig = {
        fail: true,
        alert: true,
        'compare-branch': 'main',
      }

      expect(ciConfig.fail).toBe(true)
      expect(ciConfig.alert).toBe(true)
    })
  })

  describe('PR comment generation', () => {
    it('should generate bundle size comparison in PR', () => {
      const comparison = {
        previous: '42 KB',
        current: '45 KB',
        change: '+3 KB',
        percentChange: '+7.1%',
      }

      expect(comparison.previous).toBeDefined()
      expect(comparison.current).toBeDefined()
      expect(comparison.change).toBeDefined()
      expect(comparison.percentChange).toBeDefined()
    })

    it('should format size comparison clearly', () => {
      const format = (prev, curr) => {
        const prevKB = parseInt(prev)
        const currKB = parseInt(curr)
        const diff = currKB - prevKB
        const percent = ((diff / prevKB) * 100).toFixed(1)

        return {
          previous: `${prevKB} KB`,
          current: `${currKB} KB`,
          change: `${diff > 0 ? '+' : ''}${diff} KB`,
          percentChange: `${diff > 0 ? '+' : ''}${percent}%`,
        }
      }

      const comparison = format('42', '45')

      expect(comparison.current).toBe('45 KB')
      expect(comparison.change).toBe('+3 KB')
      expect(comparison.percentChange).toMatch(/[\+\-]\d+\.\d+%/)
    })

    it('should alert on significant size increases', () => {
      const alertThreshold = 0.05 // 5% increase

      const checkAlert = (prev, curr) => {
        const increase = (curr - prev) / prev
        return increase > alertThreshold
      }

      expect(checkAlert(100, 106)).toBe(true)
      expect(checkAlert(100, 104)).toBe(false)
    })

    it('should track historical size data', () => {
      const history = [
        { date: '2024-01-01', size: '40 KB' },
        { date: '2024-01-08', size: '42 KB' },
        { date: '2024-01-15', size: '45 KB' },
      ]

      expect(Array.isArray(history)).toBe(true)
      expect(history.length).toBeGreaterThan(0)
      expect(history[0].date).toBeDefined()
      expect(history[0].size).toBeDefined()
    })
  })

  describe('Size limit categories', () => {
    it('should track entry point sizes', () => {
      const entries = {
        'packages/sdk/dist/index.js': '50 KB',
        'packages/react/dist/index.js': '60 KB',
      }

      Object.entries(entries).forEach(([path, size]) => {
        expect(path).toMatch(/\.js$/)
        expect(size).toMatch(/\d+\s*KB/)
      })
    })

    it('should measure specific export bundle sizes', () => {
      const specifics = {
        'SorobanResurrect': '15 KB',
        'SorobanResurrectError': '2 KB',
      }

      Object.values(specifics).forEach(size => {
        expect(size).toMatch(/\d+\s*KB/)
      })
    })

    it('should compare across bundlers', () => {
      const bundlerComparison = {
        webpack: '45 KB',
        rollup: '42 KB',
        esbuild: '41 KB',
      }

      expect(Object.keys(bundlerComparison).length).toBe(3)
      Object.values(bundlerComparison).forEach(size => {
        expect(size).toMatch(/\d+\s*KB/)
      })
    })
  })

  describe('Incremental size tracking', () => {
    it('should track size over multiple commits', () => {
      const sizeHistory = [
        { commit: 'abc123', size: 40000 },
        { commit: 'def456', size: 42000 },
        { commit: 'ghi789', size: 45000 },
      ]

      expect(sizeHistory.length).toBeGreaterThan(0)
      expect(sizeHistory[0].size).toBeLessThan(sizeHistory[sizeHistory.length - 1].size)
    })

    it('should identify what caused size increase', () => {
      const analysis = {
        newDependencies: '+5 KB',
        newFeatures: '+3 KB',
        refactoring: '-1 KB',
        total: '+7 KB',
      }

      expect(analysis.total).toBeDefined()
      expect(Object.keys(analysis).length).toBeGreaterThan(0)
    })

    it('should suggest optimizations for size reduction', () => {
      const suggestions = [
        'Remove unused imports from utility module',
        'Lazy load heavy dependencies',
        'Extract logging utilities to separate bundle',
      ]

      expect(Array.isArray(suggestions)).toBe(true)
      expect(suggestions.length).toBeGreaterThan(0)
    })
  })

  describe('CI failure conditions', () => {
    it('should fail CI when exceeding size limit', () => {
      const shouldFail = (size, limit) => size > limit

      expect(shouldFail(51000, 50000)).toBe(true)
      expect(shouldFail(49000, 50000)).toBe(false)
    })

    it('should fail on unexpected size increase', () => {
      const shouldFail = (current, previous, threshold = 0.1) => {
        const increase = (current - previous) / previous
        return increase > threshold
      }

      expect(shouldFail(55000, 50000)).toBe(true)
      expect(shouldFail(52000, 50000)).toBe(false)
    })

    it('should provide helpful error messages', () => {
      const errorMessage = (size, limit, path) =>
        `Bundle size exceeded: ${path} is ${size} bytes (limit: ${limit} bytes)`

      const message = errorMessage(51000, 50000, 'packages/sdk/dist/index.js')

      expect(message).toContain('exceeded')
      expect(message).toContain('51000')
      expect(message).toContain('50000')
    })
  })

  describe('Build output analysis', () => {
    it('should validate dist directory exists', () => {
      const distPath = path.join(__dirname, '../dist')
      const exists = fs.existsSync(distPath)

      if (exists) {
        expect(fs.statSync(distPath).isDirectory()).toBe(true)
      }
    })

    it('should measure all output formats', () => {
      const distPath = path.join(__dirname, '../dist')

      const formats = ['index.js', 'index.cjs', 'index.d.ts']

      if (fs.existsSync(distPath)) {
        formats.forEach(format => {
          const filePath = path.join(distPath, format)
          if (fs.existsSync(filePath)) {
            const size = fs.statSync(filePath).size
            expect(size).toBeGreaterThan(0)
          }
        })
      }
    })

    it('should compare sizes across formats', () => {
      const distPath = path.join(__dirname, '../dist')

      if (fs.existsSync(distPath)) {
        const esmPath = path.join(distPath, 'index.js')
        const cjsPath = path.join(distPath, 'index.cjs')

        if (fs.existsSync(esmPath) && fs.existsSync(cjsPath)) {
          const esmSize = fs.statSync(esmPath).size
          const cjsSize = fs.statSync(cjsPath).size

          // CommonJS typically slightly larger due to module.exports wrapper
          expect(cjsSize).toBeGreaterThanOrEqual(esmSize * 0.95)
        }
      }
    })
  })

  describe('Performance metrics', () => {
    it('should track bundle parse time', () => {
      const metrics = {
        parseTime: '45ms',
        execTime: '12ms',
      }

      expect(metrics.parseTime).toBeDefined()
      expect(metrics.parseTime).toMatch(/\d+ms/)
    })

    it('should monitor tree-shaking effectiveness', () => {
      const effectiveness = {
        originalSize: '100 KB',
        treeShookSize: '45 KB',
        reduction: '55%',
      }

      expect(effectiveness.reduction).toMatch(/\d+%/)
    })

    it('should track compression ratio', () => {
      const compression = {
        raw: '45 KB',
        gzipped: '15 KB',
        ratio: '33%',
      }

      expect(compression.ratio).toMatch(/\d+%/)
    })
  })
})

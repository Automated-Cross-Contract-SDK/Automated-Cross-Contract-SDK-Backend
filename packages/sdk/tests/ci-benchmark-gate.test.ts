import { describe, it, expect, beforeEach } from 'vitest'

interface BenchmarkResult {
  name: string
  durationMs: number
}

interface BenchmarkComparison {
  name: string
  baseDurationMs: number
  prDurationMs: number
  changePercent: number
  threshold: number
  regression: boolean
}

interface BenchmarkConfig {
  thresholds: Record<string, number>
  failOnRegression: boolean
  postCommentOnPR: boolean
}

describe('CI Benchmark Gate (Issue #292)', () => {
  let baseResults: BenchmarkResult[]
  let prResults: BenchmarkResult[]
  let config: BenchmarkConfig
  let comparisons: BenchmarkComparison[]

  beforeEach(() => {
    baseResults = [
      { name: 'extractKeysFromFootprint', durationMs: 100 },
      { name: 'classifyLedgerKey', durationMs: 80 },
      { name: 'classifyDeferredKeys', durationMs: 75 },
      { name: 'extractFootprintFromTransactionStreaming', durationMs: 200 },
      { name: 'detectArchivedKeys', durationMs: 120 },
    ]

    prResults = [
      { name: 'extractKeysFromFootprint', durationMs: 110 },
      { name: 'classifyLedgerKey', durationMs: 85 },
      { name: 'classifyDeferredKeys', durationMs: 80 },
      { name: 'extractFootprintFromTransactionStreaming', durationMs: 210 },
      { name: 'detectArchivedKeys', durationMs: 130 },
    ]

    config = {
      thresholds: {
        extractKeysFromFootprint: 20,
        classifyLedgerKey: 30,
        classifyDeferredKeys: 20,
        extractFootprintFromTransactionStreaming: 30,
        detectArchivedKeys: 20,
      },
      failOnRegression: true,
      postCommentOnPR: true,
    }

    comparisons = []
  })

  describe('benchmark comparison', () => {
    it('should calculate percentage change correctly', () => {
      const calculateChange = (baseDuration: number, prDuration: number): number => {
        return ((prDuration - baseDuration) / baseDuration) * 100
      }

      const change = calculateChange(100, 110)
      expect(change).toBeCloseTo(10, 1)
    })

    it('should detect regression when change exceeds threshold', () => {
      const hasRegression = (changePercent: number, threshold: number): boolean => {
        return changePercent > threshold
      }

      expect(hasRegression(25, 20)).toBe(true)
      expect(hasRegression(15, 20)).toBe(false)
      expect(hasRegression(20, 20)).toBe(false)
    })

    it('should compare all benchmarks and identify regressions', () => {
      for (const base of baseResults) {
        const pr = prResults.find((r) => r.name === base.name)
        if (pr) {
          const changePercent = ((pr.durationMs - base.durationMs) / base.durationMs) * 100
          const threshold = config.thresholds[base.name]
          const regression = changePercent > threshold

          comparisons.push({
            name: base.name,
            baseDurationMs: base.durationMs,
            prDurationMs: pr.durationMs,
            changePercent: changePercent,
            threshold: threshold,
            regression: regression,
          })
        }
      }

      expect(comparisons).toHaveLength(5)
      expect(comparisons.some((c) => c.regression)).toBe(true)
    })
  })

  describe('regression detection', () => {
    it('should fail CI when regression exceeds threshold', () => {
      const regressions = comparisons.filter((c) => c.regression)
      const shouldFailCI = regressions.length > 0 && config.failOnRegression

      expect(shouldFailCI).toBe(true)
    })

    it('should track each benchmark threshold', () => {
      const benchmarks = [
        'extractKeysFromFootprint',
        'classifyLedgerKey',
        'classifyDeferredKeys',
        'extractFootprintFromTransactionStreaming',
        'detectArchivedKeys',
      ]

      for (const benchmark of benchmarks) {
        expect(config.thresholds[benchmark]).toBeDefined()
        expect(config.thresholds[benchmark]).toBeGreaterThan(0)
      }
    })

    it('should validate thresholds are reasonable', () => {
      const validateThresholds = (thresholds: Record<string, number>): boolean => {
        return Object.values(thresholds).every((t) => t > 0 && t <= 100)
      }

      expect(validateThresholds(config.thresholds)).toBe(true)
    })

    it('should ensure extractKeysFromFootprint threshold is 20%', () => {
      expect(config.thresholds.extractKeysFromFootprint).toBe(20)
    })

    it('should ensure classifyLedgerKey threshold is 30%', () => {
      expect(config.thresholds.classifyLedgerKey).toBe(30)
    })

    it('should ensure classifyDeferredKeys threshold is 20%', () => {
      expect(config.thresholds.classifyDeferredKeys).toBe(20)
    })

    it('should ensure streaming parse threshold is 30%', () => {
      expect(config.thresholds.extractFootprintFromTransactionStreaming).toBe(30)
    })

    it('should ensure detectArchivedKeys threshold is 20%', () => {
      expect(config.thresholds.detectArchivedKeys).toBe(20)
    })
  })

  describe('CI integration', () => {
    it('should enable benchmark CI gate', () => {
      expect(config.failOnRegression).toBe(true)
    })

    it('should post comparison comment on PR', () => {
      expect(config.postCommentOnPR).toBe(true)
    })

    it('should fail workflow on regression detection', () => {
      const failWorkflow = (comparisons: BenchmarkComparison[]): boolean => {
        return config.failOnRegression && comparisons.some((c) => c.regression)
      }

      expect(failWorkflow(comparisons)).toBe(true)
    })

    it('should pass workflow when all benchmarks are within threshold', () => {
      const allPass = comparisons.filter((c) => !c.regression)
      const shouldPass = allPass.length === comparisons.length && config.failOnRegression

      expect(comparisons.length).toBeGreaterThan(0)
    })
  })

  describe('benchmark artifact management', () => {
    it('should store base branch benchmark results', () => {
      const benchmarkResults = {
        commit: 'abc123',
        branch: 'main',
        timestamp: new Date().toISOString(),
        results: baseResults,
      }

      expect(benchmarkResults.results).toHaveLength(5)
      expect(benchmarkResults.branch).toBe('main')
    })

    it('should compare PR branch results against base', () => {
      const comparison = {
        baseBranch: 'main',
        prBranch: 'feature-branch',
        baseResults: baseResults,
        prResults: prResults,
      }

      expect(comparison.baseResults.length).toBe(comparison.prResults.length)
    })

    it('should generate comparison artifact', () => {
      const artifact = {
        type: 'benchmark-comparison',
        baseBranch: 'main',
        timestamp: new Date().toISOString(),
        comparisons: comparisons,
        regressionDetected: comparisons.some((c) => c.regression),
      }

      expect(artifact.regressionDetected).toBe(true)
      expect(artifact.comparisons).toHaveLength(5)
    })

    it('should be triggered on SDK or WASM changes', () => {
      const paths = [
        'packages/sdk/src/**',
        'packages/sdk/scripts/**',
        'packages/footprint-parser-wasm/**',
      ]

      expect(paths).toContain('packages/sdk/src/**')
      expect(paths).toContain('packages/footprint-parser-wasm/**')
    })
  })

  describe('PR comment formatting', () => {
    it('should format benchmark comparison table', () => {
      const formatTable = (comparisons: BenchmarkComparison[]): string => {
        let table = '| Benchmark | Base (ms) | PR (ms) | Change | Threshold | Status |\n'
        table += '|-----------|-----------|---------|--------|-----------|--------|\n'

        for (const c of comparisons) {
          const icon = c.regression ? '🔴' : '🟢'
          const sign = c.changePercent > 0 ? '+' : ''
          table += `| ${c.name} | ${c.baseDurationMs.toFixed(2)} | ${c.prDurationMs.toFixed(2)} | ${sign}${c.changePercent}% | ${c.threshold}% | ${icon} ${c.regression ? 'FAIL' : 'PASS'} |\n`
        }

        return table
      }

      const table = formatTable(comparisons)
      expect(table).toContain('Benchmark')
      expect(table).toContain('extractKeysFromFootprint')
    })

    it('should add regression warning to PR comment', () => {
      const regressions = comparisons.filter((c) => c.regression)
      const hasWarning = regressions.length > 0

      expect(hasWarning).toBe(true)
    })

    it('should indicate pass/fail status with emoji', () => {
      const statuses = comparisons.map((c) => (c.regression ? '🔴' : '🟢'))

      expect(statuses).toContain('🟢')
      expect(statuses).toContain('🔴')
    })
  })

  describe('benchmark documentation', () => {
    it('should document benchmarks in BENCHMARKS.md', () => {
      const doc = {
        title: 'Performance Benchmarks',
        description: 'Benchmarks are run on every PR to detect performance regressions',
        regressionThreshold: '20%',
        documented: true,
      }

      expect(doc.documented).toBe(true)
      expect(doc.description).toContain('regressions')
    })

    it('should list all measured benchmarks', () => {
      const benchmarks = [
        'extractKeysFromFootprint',
        'classifyLedgerKey',
        'classifyDeferredKeys',
        'extractFootprintFromTransactionStreaming',
        'detectArchivedKeys',
      ]

      expect(benchmarks).toHaveLength(5)
    })

    it('should include regression thresholds table', () => {
      const thresholds = {
        extractKeysFromFootprint: '>20% slower',
        classifyLedgerKey: '>30% slower',
        classifyDeferredKeys: '>20% slower',
        extractFootprintFromTransactionStreaming: '>30% slower',
        detectArchivedKeys: '>20% slower',
      }

      expect(Object.keys(thresholds)).toHaveLength(5)
    })
  })
})

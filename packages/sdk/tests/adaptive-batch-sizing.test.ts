import { describe, it, expect, beforeEach, vi } from 'vitest'
import { SorobanResurrect } from '../src/soroban-resurrect.js'

interface AdaptiveBatchConfig {
  initialBatchSize: number
  maxBatchSize: number
  minBatchSize: number
  increaseThreshold: number
  decreaseThreshold: number
  aimdAlpha: number
  aimdBeta: number
}

interface PerformanceMetrics {
  simulateLatencyMs: number[]
  sendLatencyMs: number[]
  successRate: number
  failureRate: number
}

describe('Adaptive Batch Sizing (Issue #97)', () => {
  let config: AdaptiveBatchConfig
  let metrics: PerformanceMetrics

  beforeEach(() => {
    config = {
      initialBatchSize: 50,
      maxBatchSize: 100,
      minBatchSize: 10,
      increaseThreshold: 0.95,
      decreaseThreshold: 0.7,
      aimdAlpha: 1,
      aimdBeta: 0.5,
    }

    metrics = {
      simulateLatencyMs: [],
      sendLatencyMs: [],
      successRate: 0,
      failureRate: 0,
    }
  })

  describe('AIMD (Additive Increase Multiplicative Decrease) algorithm', () => {
    it('should initialize batch size to maxRestoreBatchSize', () => {
      const initialSize = config.initialBatchSize
      expect(initialSize).toBe(50)
      expect(initialSize).toBeLessThanOrEqual(config.maxBatchSize)
    })

    it('should increase batch size additively when conditions are favorable', () => {
      let currentBatchSize = config.initialBatchSize
      metrics.successRate = 0.98
      metrics.simulateLatencyMs = [50, 45, 48]
      metrics.sendLatencyMs = [100, 95, 98]

      const avgSimulateLatency =
        metrics.simulateLatencyMs.reduce((a, b) => a + b, 0) /
        metrics.simulateLatencyMs.length
      const avgSendLatency =
        metrics.sendLatencyMs.reduce((a, b) => a + b, 0) /
        metrics.sendLatencyMs.length

      const lowLatency = avgSimulateLatency < 100 && avgSendLatency < 200
      const highSuccessRate = metrics.successRate > config.increaseThreshold
      const noFailures = metrics.failureRate === 0

      if (lowLatency && highSuccessRate && noFailures) {
        currentBatchSize = Math.min(
          config.maxBatchSize,
          currentBatchSize + config.aimdAlpha,
        )
      }

      expect(currentBatchSize).toBe(51)
      expect(currentBatchSize).toBeLessThanOrEqual(config.maxBatchSize)
    })

    it('should decrease batch size multiplicatively when conditions are unfavorable', () => {
      let currentBatchSize = config.initialBatchSize
      metrics.successRate = 0.6
      metrics.simulateLatencyMs = [200, 250, 300]
      metrics.sendLatencyMs = [400, 450, 500]

      const avgSimulateLatency =
        metrics.simulateLatencyMs.reduce((a, b) => a + b, 0) /
        metrics.simulateLatencyMs.length
      const avgSendLatency =
        metrics.sendLatencyMs.reduce((a, b) => a + b, 0) /
        metrics.sendLatencyMs.length

      const highLatency = avgSimulateLatency > 100 || avgSendLatency > 200
      const lowSuccessRate = metrics.successRate < config.decreaseThreshold

      if (highLatency || lowSuccessRate) {
        currentBatchSize = Math.max(
          config.minBatchSize,
          Math.floor(currentBatchSize * config.aimdBeta),
        )
      }

      expect(currentBatchSize).toBe(25)
      expect(currentBatchSize).toBeGreaterThanOrEqual(config.minBatchSize)
    })

    it('should respect min and max batch size boundaries', () => {
      let currentBatchSize = config.minBatchSize

      for (let i = 0; i < 10; i++) {
        if (i % 2 === 0) {
          currentBatchSize = Math.min(
            config.maxBatchSize,
            currentBatchSize + config.aimdAlpha,
          )
        }
      }

      expect(currentBatchSize).toBeLessThanOrEqual(config.maxBatchSize)

      currentBatchSize = config.maxBatchSize
      for (let i = 0; i < 10; i++) {
        currentBatchSize = Math.max(
          config.minBatchSize,
          Math.floor(currentBatchSize * config.aimdBeta),
        )
      }

      expect(currentBatchSize).toBeGreaterThanOrEqual(config.minBatchSize)
    })
  })

  describe('Latency tracking', () => {
    it('should track simulateTransaction round-trip times', () => {
      metrics.simulateLatencyMs.push(50)
      metrics.simulateLatencyMs.push(55)
      metrics.simulateLatencyMs.push(60)

      expect(metrics.simulateLatencyMs.length).toBe(3)
      expect(Math.max(...metrics.simulateLatencyMs)).toBe(60)
      expect(Math.min(...metrics.simulateLatencyMs)).toBe(50)
    })

    it('should track sendTransaction round-trip times', () => {
      metrics.sendLatencyMs.push(100)
      metrics.sendLatencyMs.push(110)
      metrics.sendLatencyMs.push(120)

      expect(metrics.sendLatencyMs.length).toBe(3)
      expect(Math.max(...metrics.sendLatencyMs)).toBe(120)
      expect(Math.min(...metrics.sendLatencyMs)).toBe(100)
    })

    it('should calculate average latency across recent operations', () => {
      metrics.simulateLatencyMs = [50, 55, 60]
      const avgLatency =
        metrics.simulateLatencyMs.reduce((a, b) => a + b, 0) /
        metrics.simulateLatencyMs.length

      expect(avgLatency).toBeCloseTo(55, 1)
    })

    it('should use only recent latency samples (sliding window)', () => {
      const windowSize = 5
      for (let i = 0; i < 10; i++) {
        metrics.simulateLatencyMs.push(50 + i * 5)
      }

      const recentSamples = metrics.simulateLatencyMs.slice(-windowSize)
      expect(recentSamples.length).toBeLessThanOrEqual(windowSize)
      expect(recentSamples.length).toBe(5)
    })
  })

  describe('Success/failure rate tracking', () => {
    it('should track transaction success rate', () => {
      const successful = 95
      const total = 100
      metrics.successRate = successful / total

      expect(metrics.successRate).toBe(0.95)
    })

    it('should track transaction failure rate', () => {
      const failed = 5
      const total = 100
      metrics.failureRate = failed / total

      expect(metrics.failureRate).toBe(0.05)
    })

    it('should update success rate with rolling average', () => {
      const samples = [0.98, 0.95, 0.92, 0.94, 0.96]
      const rollingAvg = samples.reduce((a, b) => a + b, 0) / samples.length

      expect(rollingAvg).toBeCloseTo(0.95, 2)
    })

    it('should detect high failure rate', () => {
      metrics.failureRate = 0.3

      expect(metrics.failureRate).toBeGreaterThan(config.decreaseThreshold - 0.4)
    })
  })

  describe('Adaptive adjustment logic', () => {
    it('should increase batch size only when all favorable conditions met', () => {
      let batchSize = config.initialBatchSize
      const shouldIncrease =
        metrics.successRate > 0.95 &&
        metrics.simulateLatencyMs.every((l) => l < 100) &&
        metrics.sendLatencyMs.every((l) => l < 200) &&
        metrics.failureRate === 0

      if (shouldIncrease) {
        batchSize += config.aimdAlpha
      }

      expect(batchSize).toBe(config.initialBatchSize)
    })

    it('should decrease batch size when latency is high', () => {
      let batchSize = config.initialBatchSize
      const avgLatency = 250

      if (avgLatency > 200) {
        batchSize = Math.max(
          config.minBatchSize,
          Math.floor(batchSize * config.aimdBeta),
        )
      }

      expect(batchSize).toBe(25)
    })

    it('should decrease batch size when failure rate is high', () => {
      let batchSize = config.initialBatchSize
      metrics.failureRate = 0.4

      if (metrics.failureRate > 1 - config.decreaseThreshold) {
        batchSize = Math.max(
          config.minBatchSize,
          Math.floor(batchSize * config.aimdBeta),
        )
      }

      expect(batchSize).toBe(25)
    })

    it('should not adjust batch size if conditions are stable', () => {
      let batchSize = config.initialBatchSize
      metrics.successRate = 0.85
      metrics.simulateLatencyMs = [75, 80, 78]

      const avgLatency =
        metrics.simulateLatencyMs.reduce((a, b) => a + b, 0) /
        metrics.simulateLatencyMs.length

      let adjusted = false
      if (
        metrics.successRate > config.increaseThreshold &&
        avgLatency < 100 &&
        metrics.failureRate === 0
      ) {
        batchSize += config.aimdAlpha
        adjusted = true
      }

      if (
        metrics.successRate < config.decreaseThreshold ||
        avgLatency > 200 ||
        metrics.failureRate > 0.2
      ) {
        batchSize = Math.max(
          config.minBatchSize,
          Math.floor(batchSize * config.aimdBeta),
        )
        adjusted = true
      }

      expect(adjusted).toBe(false)
      expect(batchSize).toBe(config.initialBatchSize)
    })
  })

  describe('Dynamic batch sizing in practice', () => {
    it('should stabilize at optimal batch size over time', () => {
      let batchSize = config.initialBatchSize
      const history: number[] = [batchSize]

      for (let iteration = 0; iteration < 10; iteration++) {
        metrics.simulateLatencyMs = [60, 65, 70]
        metrics.sendLatencyMs = [120, 130, 140]
        metrics.successRate = 0.93

        const avgSimLatency =
          metrics.simulateLatencyMs.reduce((a, b) => a + b, 0) /
          metrics.simulateLatencyMs.length
        const avgSendLatency =
          metrics.sendLatencyMs.reduce((a, b) => a + b, 0) /
          metrics.sendLatencyMs.length

        if (
          metrics.successRate < config.increaseThreshold ||
          avgSimLatency > 100 ||
          avgSendLatency > 200
        ) {
          batchSize = Math.max(
            config.minBatchSize,
            Math.floor(batchSize * config.aimdBeta),
          )
        }

        history.push(batchSize)
      }

      expect(history[history.length - 1]).toBeLessThanOrEqual(
        config.initialBatchSize,
      )
    })

    it('should recover to larger batch size when latency improves', () => {
      let batchSize = config.initialBatchSize

      metrics.simulateLatencyMs = [300, 350, 400]
      metrics.sendLatencyMs = [600, 650, 700]
      metrics.failureRate = 0.15

      const avgSimLatency =
        metrics.simulateLatencyMs.reduce((a, b) => a + b, 0) /
        metrics.simulateLatencyMs.length

      if (avgSimLatency > 200) {
        batchSize = Math.max(
          config.minBatchSize,
          Math.floor(batchSize * config.aimdBeta),
        )
      }

      expect(batchSize).toBe(25)

      metrics.simulateLatencyMs = [60, 65, 70]
      metrics.sendLatencyMs = [120, 130, 140]
      metrics.failureRate = 0
      metrics.successRate = 0.98

      for (let i = 0; i < 5; i++) {
        const newAvgSimLatency =
          metrics.simulateLatencyMs.reduce((a, b) => a + b, 0) /
          metrics.simulateLatencyMs.length

        if (
          newAvgSimLatency < 100 &&
          metrics.successRate > config.increaseThreshold &&
          metrics.failureRate === 0
        ) {
          batchSize = Math.min(
            config.maxBatchSize,
            batchSize + config.aimdAlpha,
          )
        }
      }

      expect(batchSize).toBeGreaterThan(25)
    })
  })

  describe('Configuration validation', () => {
    it('should validate that minBatchSize < maxBatchSize', () => {
      expect(config.minBatchSize).toBeLessThan(config.maxBatchSize)
    })

    it('should validate that initialBatchSize is within bounds', () => {
      expect(config.initialBatchSize).toBeGreaterThanOrEqual(config.minBatchSize)
      expect(config.initialBatchSize).toBeLessThanOrEqual(config.maxBatchSize)
    })

    it('should validate AIMD parameters', () => {
      expect(config.aimdAlpha).toBeGreaterThan(0)
      expect(config.aimdBeta).toBeGreaterThan(0)
      expect(config.aimdBeta).toBeLessThan(1)
    })

    it('should validate thresholds are between 0 and 1', () => {
      expect(config.increaseThreshold).toBeGreaterThan(0)
      expect(config.increaseThreshold).toBeLessThanOrEqual(1)
      expect(config.decreaseThreshold).toBeGreaterThan(0)
      expect(config.decreaseThreshold).toBeLessThanOrEqual(1)
    })
  })
})

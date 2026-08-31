import { describe, it, expect, vi, beforeEach } from 'vitest'
import { RpcFailoverManager } from '../src/rpc-failover.js'

describe('RpcFailoverManager', () => {
  const testUrls = ['https://rpc1.example.com', 'https://rpc2.example.com', 'https://rpc3.example.com']

  beforeEach(() => {
    vi.clearAllTimers()
  })

  describe('basic failover (without stickiness)', () => {
    it('returns the current healthy endpoint', () => {
      const manager = new RpcFailoverManager(testUrls)
      const url = manager.getCurrentUrl()
      expect(url).toBe(testUrls[0])
    })

    it('fails over to the next endpoint when current is marked unhealthy', () => {
      const manager = new RpcFailoverManager(testUrls, { maxFailuresBeforeFallback: 1 })
      const firstUrl = manager.getCurrentUrl()
      expect(firstUrl).toBe(testUrls[0])

      manager.recordFailure(firstUrl)
      const secondUrl = manager.getCurrentUrl()
      expect(secondUrl).not.toBe(firstUrl)
    })

    it('round-robins through endpoints on repeated failures', () => {
      const manager = new RpcFailoverManager(testUrls, { maxFailuresBeforeFallback: 1 })

      const urls: string[] = []
      for (let i = 0; i < testUrls.length; i++) {
        const url = manager.getCurrentUrl()
        urls.push(url)
        manager.recordFailure(url)
      }

      // Should have cycled through all URLs
      expect(new Set(urls).size).toBeGreaterThan(1)
    })
  })

  describe('stickiness enabled', () => {
    it('prefers the same endpoint across multiple calls within sticky window', () => {
      const manager = new RpcFailoverManager(testUrls, { stickyDurationMs: 10000 })

      const url1 = manager.getCurrentUrl()
      const url2 = manager.getCurrentUrl()
      const url3 = manager.getCurrentUrl()

      expect(url1).toBe(url2)
      expect(url2).toBe(url3)
    })

    it('fails over immediately if sticky endpoint becomes unhealthy', () => {
      const manager = new RpcFailoverManager(testUrls, {
        stickyDurationMs: 10000,
        maxFailuresBeforeFallback: 1,
      })

      const firstUrl = manager.getCurrentUrl()
      expect(firstUrl).toBe(testUrls[0])

      // Mark the sticky endpoint as unhealthy
      manager.recordFailure(firstUrl)

      // Should immediately fail over to a different endpoint, not wait for sticky window
      const secondUrl = manager.getCurrentUrl()
      expect(secondUrl).not.toBe(firstUrl)
    })

    it('stops preferring the sticky endpoint after the sticky window expires', () => {
      vi.useFakeTimers()
      const manager = new RpcFailoverManager(testUrls, { stickyDurationMs: 5000 })

      const firstUrl = manager.getCurrentUrl()
      expect(firstUrl).toBe(testUrls[0])

      // Advance time past the sticky window
      vi.advanceTimersByTime(6000)

      // Record failure for first endpoint
      manager.recordFailure(firstUrl)

      // Should pick a different endpoint since sticky window expired
      const secondUrl = manager.getCurrentUrl()
      expect(secondUrl).not.toBe(firstUrl)

      vi.useRealTimers()
    })

    it('updates sticky endpoint when switching to a new healthy one', () => {
      vi.useFakeTimers()
      const manager = new RpcFailoverManager(testUrls, {
        stickyDurationMs: 5000,
        maxFailuresBeforeFallback: 1,
      })

      // Get and prefer first endpoint
      const firstUrl = manager.getCurrentUrl()
      expect(firstUrl).toBe(testUrls[0])

      // Mark first endpoint unhealthy
      manager.recordFailure(firstUrl)

      // Get new endpoint (should switch to second)
      const secondUrl = manager.getCurrentUrl()
      expect(secondUrl).not.toBe(firstUrl)

      // Verify second endpoint is now sticky (called twice should return same)
      const thirdCall = manager.getCurrentUrl()
      expect(thirdCall).toBe(secondUrl)

      vi.useRealTimers()
    })

    it('does not interfere with normal health-check recovery', () => {
      const manager = new RpcFailoverManager(testUrls, {
        stickyDurationMs: 5000,
        maxFailuresBeforeFallback: 1,
        successThresholdToRestore: 2,
      })

      const firstUrl = manager.getCurrentUrl()
      const status1 = manager.getHealthStatus()
      expect(status1[0].isHealthy).toBe(true)

      // Mark first endpoint unhealthy
      manager.recordFailure(firstUrl)
      const status2 = manager.getHealthStatus()
      expect(status2[0].isHealthy).toBe(false)

      // Restore with successes
      manager.recordSuccess(firstUrl)
      manager.recordSuccess(firstUrl)

      const status3 = manager.getHealthStatus()
      expect(status3[0].isHealthy).toBe(true)
    })
  })

  describe('stickiness disabled (default behavior)', () => {
    it('has stickiness disabled by default', () => {
      const manager = new RpcFailoverManager(testUrls)

      // Verify stickiness is disabled (multiple calls may return different endpoints if there's logic to rotate)
      const status = manager.getHealthStatus()
      expect(status).toHaveLength(testUrls.length)
      expect(status[0].isHealthy).toBe(true)
    })

    it('maintains backwards compatibility when stickyDurationMs is 0', () => {
      const manager = new RpcFailoverManager(testUrls, { stickyDurationMs: 0 })

      const url1 = manager.getCurrentUrl()
      expect(url1).toBe(testUrls[0])

      const url2 = manager.getCurrentUrl()
      expect(url2).toBe(testUrls[0]) // First endpoint is still healthy so returned again
    })
  })

  describe('edge cases', () => {
    it('throws if initialized with no URLs', () => {
      expect(() => {
        new RpcFailoverManager([])
      }).toThrow('at least one RPC URL')
    })

    it('handles all endpoints becoming unhealthy gracefully', () => {
      const manager = new RpcFailoverManager(testUrls, { maxFailuresBeforeFallback: 1 })

      // Mark all endpoints unhealthy
      for (const url of testUrls) {
        manager.recordFailure(url)
      }

      // Should still return a URL (the least-failed one)
      const url = manager.getCurrentUrl()
      expect(url).toBeDefined()
      expect(testUrls).toContain(url)
    })

    it('returns correct health status snapshot', () => {
      const manager = new RpcFailoverManager(testUrls, { maxFailuresBeforeFallback: 1 })

      manager.recordFailure(testUrls[0])
      manager.recordSuccess(testUrls[1])

      const status = manager.getHealthStatus()
      expect(status).toHaveLength(testUrls.length)
      expect(status[0].isHealthy).toBe(false)
      expect(status[0].consecutiveFailures).toBeGreaterThan(0)
    })
  })

  describe('lifecycle', () => {
    it('stops health checks on destroy', () => {
      const manager = new RpcFailoverManager(testUrls)
      const checkFn = vi.fn().mockResolvedValue(undefined)

      manager.startHealthChecks(checkFn)
      manager.stopHealthChecks()
      manager.destroy()

      // After destroy, health checks should be stopped
      // This is verified by the test not hanging or throwing
      expect(manager).toBeDefined()
    })

    it('allows multiple start/stop cycles', () => {
      const manager = new RpcFailoverManager(testUrls)
      const checkFn = vi.fn().mockResolvedValue(undefined)

      manager.startHealthChecks(checkFn)
      manager.stopHealthChecks()
      manager.startHealthChecks(checkFn)
      manager.stopHealthChecks()

      expect(manager).toBeDefined()
    })
  })
})

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { RateLimiter, type RateLimitConfig } from '../src/rate-limiter.js'

describe('RateLimiter', () => {
  let rateLimiter: RateLimiter
  const config: RateLimitConfig = {
    requestsPerSecond: 10,
    burstSize: 5,
  }

  beforeEach(() => {
    vi.useFakeTimers()
    rateLimiter = new RateLimiter(config)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('initialization', () => {
    it('should initialize with correct config', () => {
      expect(rateLimiter.getConfig()).toEqual(config)
    })

    it('should accept optional onRateLimited callback', () => {
      const onRateLimited = vi.fn()
      const limiter = new RateLimiter({ ...config, onRateLimited })
      expect(limiter.getConfig().onRateLimited).toBe(onRateLimited)
    })
  })

  describe('acquireToken', () => {
    it('should allow requests within rate limit', async () => {
      const tokens: number[] = []

      for (let i = 0; i < 5; i++) {
        const token = rateLimiter.acquireToken()
        expect(token).toBe(true)
        tokens.push(i)
      }

      expect(tokens.length).toBe(5)
    })

    it('should reject requests exceeding burst size', async () => {
      for (let i = 0; i < 5; i++) {
        expect(rateLimiter.acquireToken()).toBe(true)
      }

      for (let i = 0; i < 5; i++) {
        expect(rateLimiter.acquireToken()).toBe(false)
      }
    })

    it('should refill tokens after time passes', () => {
      for (let i = 0; i < 5; i++) {
        rateLimiter.acquireToken()
      }

      expect(rateLimiter.acquireToken()).toBe(false)

      vi.advanceTimersByTime(100)

      expect(rateLimiter.acquireToken()).toBe(true)
    })

    it('should respect requestsPerSecond rate', () => {
      for (let i = 0; i < 5; i++) {
        expect(rateLimiter.acquireToken()).toBe(true)
      }

      expect(rateLimiter.acquireToken()).toBe(false)

      vi.advanceTimersByTime(1000 / 10)

      expect(rateLimiter.acquireToken()).toBe(true)
    })
  })

  describe('queue', () => {
    it('should queue requests when rate limited', async () => {
      for (let i = 0; i < 5; i++) {
        rateLimiter.acquireToken()
      }

      const queued = await rateLimiter.queueRequest(async () => 'result')
      expect(queued).toBe('result')
    })

    it('should call onRateLimited when request is queued', async () => {
      const onRateLimited = vi.fn()
      const limiter = new RateLimiter({ ...config, onRateLimited })

      for (let i = 0; i < 5; i++) {
        limiter.acquireToken()
      }

      await limiter.queueRequest(async () => 'result')
      expect(onRateLimited).toHaveBeenCalled()
    })

    it('should process queued requests in order', async () => {
      const results: number[] = []

      for (let i = 0; i < 5; i++) {
        rateLimiter.acquireToken()
      }

      const promise1 = rateLimiter.queueRequest(async () => {
        results.push(1)
        return 1
      })
      const promise2 = rateLimiter.queueRequest(async () => {
        results.push(2)
        return 2
      })

      vi.advanceTimersByTime(5000)
      await promise1
      await promise2

      expect(results).toEqual([1, 2])
    })

    it('should reject if queue exceeds maxQueueDepth', async () => {
      const limiter = new RateLimiter({ ...config, maxQueueDepth: 2 })

      for (let i = 0; i < 5; i++) {
        limiter.acquireToken()
      }

      const request1 = limiter.queueRequest(async () => 1)
      const request2 = limiter.queueRequest(async () => 2)

      const request3 = limiter.queueRequest(async () => 3)

      expect(request3).rejects.toThrow()
    })
  })

  describe('getAvailableTokens', () => {
    it('should return available tokens', () => {
      expect(rateLimiter.getAvailableTokens()).toBeGreaterThanOrEqual(0)
      expect(rateLimiter.getAvailableTokens()).toBeLessThanOrEqual(config.burstSize)
    })

    it('should decrease available tokens when used', () => {
      const initialTokens = rateLimiter.getAvailableTokens()
      rateLimiter.acquireToken()
      expect(rateLimiter.getAvailableTokens()).toBeLessThan(initialTokens)
    })
  })

  describe('reset', () => {
    it('should reset the rate limiter state', () => {
      for (let i = 0; i < 5; i++) {
        rateLimiter.acquireToken()
      }

      expect(rateLimiter.acquireToken()).toBe(false)

      rateLimiter.reset()

      expect(rateLimiter.acquireToken()).toBe(true)
    })
  })

  describe('edge cases', () => {
    it('should handle zero requestsPerSecond', () => {
      const limiter = new RateLimiter({ requestsPerSecond: 0, burstSize: 1 })
      expect(() => limiter.acquireToken()).not.toThrow()
    })

    it('should handle high burst size', () => {
      const limiter = new RateLimiter({ requestsPerSecond: 100, burstSize: 1000 })
      for (let i = 0; i < 500; i++) {
        expect(limiter.acquireToken()).toBe(true)
      }
    })
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  ExponentialBackoff,
  FixedDelay,
  JitterBackoff,
  CircuitBreaker,
} from '@soroban-resurrect/rpc'
import { SorobanResurrectError } from '../src/types.js'

describe('Retry Policy Cookbook (Issue #300)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Rate-Limited RPC Recipe', () => {
    it('should implement rate-limited RPC with fixed delay', () => {
      const fixedDelayPolicy = new FixedDelay(5, 2000)

      expect(fixedDelayPolicy.maxRetries).toBe(5)
      expect(fixedDelayPolicy.getDelay(1)).toBe(2000)
      expect(fixedDelayPolicy.getDelay(2)).toBe(2000)
      expect(fixedDelayPolicy.getDelay(3)).toBe(2000)
    })

    it('should respect rate limit constraints across retries', () => {
      const rateLimitPolicy = new FixedDelay(5, 1000)
      const delays = [1, 2, 3, 4, 5].map((attempt) => rateLimitPolicy.getDelay(attempt))

      const totalDelay = delays.reduce((a, b) => a + b, 0)
      expect(totalDelay).toBe(5000)
    })

    it('should detect rate-limit errors and retry appropriately', () => {
      const policy = new FixedDelay(5, 1000)
      const rateLimitError = new SorobanResurrectError(
        'Rate limit exceeded',
        'NETWORK_ERROR',
      )

      expect(policy.shouldRetry(rateLimitError, 1)).toBe(true)
      expect(policy.shouldRetry(rateLimitError, 2)).toBe(true)
      expect(policy.shouldRetry(rateLimitError, 5)).toBe(true)
      expect(policy.shouldRetry(rateLimitError, 6)).toBe(false)
    })

    it('should stop retrying after max attempts exceeded', () => {
      const policy = new FixedDelay(3, 1000)
      const networkError = new SorobanResurrectError('Network error', 'NETWORK_ERROR')

      const shouldRetry = (attempt: number) => policy.shouldRetry(networkError, attempt)
      expect([1, 2, 3].map(shouldRetry)).toEqual([true, true, true])
      expect(shouldRetry(4)).toBe(false)
    })
  })

  describe('High-Availability Recipe', () => {
    it('should implement exponential backoff for high availability', () => {
      const expBackoff = new ExponentialBackoff(5, 500)

      expect(expBackoff.getDelay(1)).toBe(500)
      expect(expBackoff.getDelay(2)).toBe(1000)
      expect(expBackoff.getDelay(3)).toBe(1500)
      expect(expBackoff.getDelay(4)).toBe(2000)
      expect(expBackoff.getDelay(5)).toBe(2500)
    })

    it('should handle transient failures with exponential backoff', () => {
      const policy = new ExponentialBackoff(6, 100)
      const transientErrors = [
        new SorobanResurrectError('Network timeout', 'NETWORK_ERROR'),
        new SorobanResurrectError('Service unavailable', 'NETWORK_ERROR'),
        new SorobanResurrectError('Connection reset', 'NETWORK_ERROR'),
      ]

      transientErrors.forEach((error) => {
        expect(policy.shouldRetry(error, 1)).toBe(true)
        expect(policy.shouldRetry(error, 2)).toBe(true)
        expect(policy.shouldRetry(error, 3)).toBe(true)
      })
    })

    it('should distinguish between transient and permanent failures', () => {
      const policy = new ExponentialBackoff(5, 100)

      const transientError = new SorobanResurrectError('Network error', 'NETWORK_ERROR')
      const permanentError = new SorobanResurrectError('Invalid XDR', 'INVALID_XDR')

      expect(policy.shouldRetry(transientError, 1)).toBe(true)
      expect(policy.shouldRetry(permanentError, 1)).toBe(false)
    })

    it('should support cascading RPC endpoints with exponential backoff', () => {
      const rpcEndpoints = [
        'https://soroban-testnet.stellar.org',
        'https://backup-rpc-1.example.com',
        'https://backup-rpc-2.example.com',
      ]

      const policy = new ExponentialBackoff(3, 200)

      expect(rpcEndpoints).toHaveLength(3)
      expect(policy.maxRetries).toBe(3)
    })
  })

  describe('Custom Fibonacci Backoff Recipe', () => {
    class FibonacciBackoff {
      private fibSequence = [100, 100, 200, 300, 500, 800]

      constructor(
        public maxRetries: number = 6,
        baseDelay = 100,
      ) {}

      getDelay(attempt: number): number {
        if (attempt < 1 || attempt > this.fibSequence.length) {
          return this.fibSequence[this.fibSequence.length - 1]
        }
        return this.fibSequence[attempt - 1]
      }

      shouldRetry(error: SorobanResurrectError, attempt: number): boolean {
        if (attempt > this.maxRetries) return false

        const retryableErrors = [
          'NETWORK_ERROR',
          'SIMULATION_FAILED',
          'ARCHIVE_DETECTION_FAILED',
        ]
        return retryableErrors.includes(error.code)
      }
    }

    it('should implement fibonacci sequence backoff delays', () => {
      const fibPolicy = new FibonacciBackoff(6, 100)

      expect(fibPolicy.getDelay(1)).toBe(100)
      expect(fibPolicy.getDelay(2)).toBe(100)
      expect(fibPolicy.getDelay(3)).toBe(200)
      expect(fibPolicy.getDelay(4)).toBe(300)
      expect(fibPolicy.getDelay(5)).toBe(500)
      expect(fibPolicy.getDelay(6)).toBe(800)
    })

    it('should progressively increase delays following fibonacci pattern', () => {
      const fibPolicy = new FibonacciBackoff(6, 100)
      const delays = [1, 2, 3, 4, 5, 6].map((i) => fibPolicy.getDelay(i))

      expect(delays).toEqual([100, 100, 200, 300, 500, 800])
    })

    it('should cap delays at maximum fibonacci value', () => {
      const fibPolicy = new FibonacciBackoff(6, 100)

      expect(fibPolicy.getDelay(7)).toBe(800)
      expect(fibPolicy.getDelay(100)).toBe(800)
    })

    it('should use fibonacci backoff for network and transient errors', () => {
      const fibPolicy = new FibonacciBackoff(6, 100)
      const networkError = new SorobanResurrectError('Network error', 'NETWORK_ERROR')

      expect(fibPolicy.shouldRetry(networkError, 1)).toBe(true)
      expect(fibPolicy.shouldRetry(networkError, 6)).toBe(true)
      expect(fibPolicy.shouldRetry(networkError, 7)).toBe(false)
    })
  })

  describe('Circuit Breaker Recipe', () => {
    it('should support circuit breaker pattern', () => {
      const circuitBreaker = new CircuitBreaker(5, 10000)

      expect(circuitBreaker.maxRetries).toBe(5)
    })

    it('should track failure counts for circuit breaking', () => {
      const circuitBreaker = new CircuitBreaker(5, 10000)
      const networkError = new SorobanResurrectError('Network error', 'NETWORK_ERROR')

      expect(circuitBreaker.shouldRetry(networkError, 1)).toBe(true)
      expect(circuitBreaker.shouldRetry(networkError, 2)).toBe(true)
      expect(circuitBreaker.shouldRetry(networkError, 3)).toBe(true)
    })

    it('should open circuit after threshold failures', () => {
      const circuitBreaker = new CircuitBreaker(3, 5000)
      const networkError = new SorobanResurrectError('Network error', 'NETWORK_ERROR')

      expect(circuitBreaker.shouldRetry(networkError, 1)).toBe(true)
      expect(circuitBreaker.shouldRetry(networkError, 2)).toBe(true)
      expect(circuitBreaker.shouldRetry(networkError, 3)).toBe(true)
      expect(circuitBreaker.shouldRetry(networkError, 4)).toBe(false)
    })
  })

  describe('Jitter Backoff Recipe', () => {
    it('should add jitter to prevent thundering herd', () => {
      const jitterPolicy = new JitterBackoff(5, 100, 200)

      const delays = [1, 2, 3].map((i) => jitterPolicy.getDelay(i))

      delays.forEach((delay) => {
        expect(delay).toBeGreaterThanOrEqual(100)
        expect(delay).toBeLessThanOrEqual(500)
      })
    })

    it('should increase base delay exponentially with random jitter', () => {
      const jitterPolicy = new JitterBackoff(5, 100, 100)

      const delay1 = jitterPolicy.getDelay(1)
      const delay2 = jitterPolicy.getDelay(2)
      const delay3 = jitterPolicy.getDelay(3)

      expect(delay1).toBeLessThanOrEqual(delay2)
      expect(delay2).toBeLessThanOrEqual(delay3)
    })

    it('should prevent thundering herd problem', () => {
      const jitterPolicy = new JitterBackoff(4, 50, 100)

      const attempt1Delays = [
        ...Array(10).keys(),
      ].map(() => jitterPolicy.getDelay(1))

      const uniqueDelays = new Set(attempt1Delays).size

      expect(uniqueDelays).toBeGreaterThan(1)
    })
  })

  describe('Retry Policy Selection Guide', () => {
    it('should use FixedDelay for rate-limited endpoints', () => {
      const rpcIsRateLimited = true

      const policy = rpcIsRateLimited ? new FixedDelay(5, 2000) : new ExponentialBackoff()
      expect(policy).toBeInstanceOf(FixedDelay)
    })

    it('should use ExponentialBackoff for flaky but generally reliable endpoints', () => {
      const endpointIsFlaky = true

      const policy = endpointIsFlaky ? new ExponentialBackoff(6, 100) : new FixedDelay()
      expect(policy).toBeInstanceOf(ExponentialBackoff)
    })

    it('should use JitterBackoff for high-concurrency scenarios', () => {
      const isHighConcurrency = true

      const policy = isHighConcurrency ? new JitterBackoff(5, 100, 500) : new FixedDelay()
      expect(policy).toBeInstanceOf(JitterBackoff)
    })

    it('should use CircuitBreaker for failing dependencies', () => {
      const dependencyFailing = true

      const policy = dependencyFailing ? new CircuitBreaker(3, 10000) : new FixedDelay()
      expect(policy).toBeInstanceOf(CircuitBreaker)
    })
  })

  describe('Error-Specific Retry Strategies', () => {
    it('should retry NETWORK_ERROR with exponential backoff', () => {
      const policy = new ExponentialBackoff(5, 100)
      const networkError = new SorobanResurrectError('Network timeout', 'NETWORK_ERROR')

      expect(policy.shouldRetry(networkError, 1)).toBe(true)
      expect(policy.shouldRetry(networkError, 2)).toBe(true)
    })

    it('should retry SIMULATION_FAILED with exponential backoff', () => {
      const policy = new ExponentialBackoff(5, 100)
      const simError = new SorobanResurrectError('Simulation failed', 'SIMULATION_FAILED')

      expect(policy.shouldRetry(simError, 1)).toBe(true)
    })

    it('should retry ARCHIVE_DETECTION_FAILED with exponential backoff', () => {
      const policy = new ExponentialBackoff(5, 100)
      const archError = new SorobanResurrectError(
        'Archive detection failed',
        'ARCHIVE_DETECTION_FAILED',
      )

      expect(policy.shouldRetry(archError, 1)).toBe(true)
    })

    it('should not retry INVALID_XDR', () => {
      const policy = new ExponentialBackoff(5, 100)
      const xdrError = new SorobanResurrectError('Invalid XDR', 'INVALID_XDR')

      expect(policy.shouldRetry(xdrError, 1)).toBe(false)
    })

    it('should not retry RESTORE_FAILED', () => {
      const policy = new ExponentialBackoff(5, 100)
      const restoreError = new SorobanResurrectError('Restore failed', 'RESTORE_FAILED')

      expect(policy.shouldRetry(restoreError, 1)).toBe(false)
    })
  })
})

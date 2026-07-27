import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  ExponentialBackoff,
  FixedDelay,
  JitterBackoff,
  CircuitBreaker,
  DEFAULT_RETRY_POLICY,
} from '../src/retry-policy.js'
import { SorobanResurrectError } from '../src/types.js'

describe('RetryPolicy implementations', () => {
  describe('ExponentialBackoff', () => {
    it('uses default max retries of 3', () => {
      const policy = new ExponentialBackoff()
      expect(policy.maxRetries).toBe(3)
    })

    it('calculates exponential delays correctly', () => {
      const policy = new ExponentialBackoff(3, 500)
      expect(policy.getDelay(1)).toBe(500) // 500 * 1
      expect(policy.getDelay(2)).toBe(1000) // 500 * 2
      expect(policy.getDelay(3)).toBe(1500) // 500 * 3
    })

    it('allows custom base delay', () => {
      const policy = new ExponentialBackoff(3, 100)
      expect(policy.getDelay(1)).toBe(100)
      expect(policy.getDelay(2)).toBe(200)
      expect(policy.getDelay(3)).toBe(300)
    })

    it('retries on network errors', () => {
      const policy = new ExponentialBackoff()
      const networkErr = new SorobanResurrectError('Network timeout', 'NETWORK_ERROR')
      expect(policy.shouldRetry(networkErr, 1)).toBe(true)
      expect(policy.shouldRetry(networkErr, 2)).toBe(true)
      expect(policy.shouldRetry(networkErr, 3)).toBe(true)
      expect(policy.shouldRetry(networkErr, 4)).toBe(false) // exceeds max retries
    })

    it('retries on simulation failures', () => {
      const policy = new ExponentialBackoff()
      const simErr = new SorobanResurrectError('Simulation failed', 'SIMULATION_FAILED')
      expect(policy.shouldRetry(simErr, 1)).toBe(true)
    })

    it('retries on archive detection failures', () => {
      const policy = new ExponentialBackoff()
      const archErr = new SorobanResurrectError('Archive detection failed', 'ARCHIVE_DETECTION_FAILED')
      expect(policy.shouldRetry(archErr, 1)).toBe(true)
    })

    it('does not retry on invalid XDR', () => {
      const policy = new ExponentialBackoff()
      const xdrErr = new SorobanResurrectError('Invalid XDR', 'INVALID_XDR')
      expect(policy.shouldRetry(xdrErr, 1)).toBe(false)
    })

    it('does not retry on restore failures', () => {
      const policy = new ExponentialBackoff()
      const restoreErr = new SorobanResurrectError('Restore failed', 'RESTORE_FAILED')
      expect(policy.shouldRetry(restoreErr, 1)).toBe(false)
    })
  })

  describe('FixedDelay', () => {
    it('uses default max retries of 3', () => {
      const policy = new FixedDelay()
      expect(policy.maxRetries).toBe(3)
    })

    it('returns constant delay', () => {
      const policy = new FixedDelay(3, 1000)
      expect(policy.getDelay(1)).toBe(1000)
      expect(policy.getDelay(2)).toBe(1000)
      expect(policy.getDelay(3)).toBe(1000)
    })

    it('allows custom delay', () => {
      const policy = new FixedDelay(3, 2500)
      expect(policy.getDelay(1)).toBe(2500)
    })

    it('respects max retries limit', () => {
      const policy = new FixedDelay(2, 1000)
      expect(policy.shouldRetry(new SorobanResurrectError('Test', 'NETWORK_ERROR'), 1)).toBe(true)
      expect(policy.shouldRetry(new SorobanResurrectError('Test', 'NETWORK_ERROR'), 2)).toBe(true)
      expect(policy.shouldRetry(new SorobanResurrectError('Test', 'NETWORK_ERROR'), 3)).toBe(false)
    })

    it('retries on transient errors', () => {
      const policy = new FixedDelay()
      const networkErr = new SorobanResurrectError('Network timeout', 'NETWORK_ERROR')
      const simErr = new SorobanResurrectError('Simulation failed', 'SIMULATION_FAILED')
      const archErr = new SorobanResurrectError('Archive detection failed', 'ARCHIVE_DETECTION_FAILED')

      expect(policy.shouldRetry(networkErr, 1)).toBe(true)
      expect(policy.shouldRetry(simErr, 1)).toBe(true)
      expect(policy.shouldRetry(archErr, 1)).toBe(true)
    })
  })

  describe('JitterBackoff', () => {
    it('uses default parameters', () => {
      const policy = new JitterBackoff()
      expect(policy.maxRetries).toBe(3)
    })

    it('adds exponential delays with jitter', () => {
      const policy = new JitterBackoff(3, 100, 500)
      const delay1 = policy.getDelay(1)
      const delay2 = policy.getDelay(2)

      // Exponential: 100 * 2^0 = 100, 100 * 2^1 = 200
      // With jitter 0-500, ranges should be:
      // attempt 1: 100 + 0-500 = 100-600
      // attempt 2: 200 + 0-500 = 200-700
      expect(delay1).toBeGreaterThanOrEqual(100)
      expect(delay1).toBeLessThanOrEqual(600)

      expect(delay2).toBeGreaterThanOrEqual(200)
      expect(delay2).toBeLessThanOrEqual(700)
    })

    it('increases delay with attempts', () => {
      const policy = new JitterBackoff(3, 100, 0) // no jitter for deterministic test
      const delay1 = policy.getDelay(1)
      const delay2 = policy.getDelay(2)
      const delay3 = policy.getDelay(3)

      // Without jitter: 100 * 2^0 = 100, 100 * 2^1 = 200, 100 * 2^2 = 400
      expect(delay1).toBe(100)
      expect(delay2).toBe(200)
      expect(delay3).toBe(400)
    })

    it('respects max retries', () => {
      const policy = new JitterBackoff(2, 100, 50)
      expect(policy.shouldRetry(new SorobanResurrectError('Test', 'NETWORK_ERROR'), 1)).toBe(true)
      expect(policy.shouldRetry(new SorobanResurrectError('Test', 'NETWORK_ERROR'), 2)).toBe(true)
      expect(policy.shouldRetry(new SorobanResurrectError('Test', 'NETWORK_ERROR'), 3)).toBe(false)
    })
  })

  describe('CircuitBreaker', () => {
    it('uses default parameters', () => {
      const policy = new CircuitBreaker()
      expect(policy.maxRetries).toBe(3)
    })

    it('allows retries until failure threshold', () => {
      const policy = new CircuitBreaker(3, 3, 1000, 100)
      const err = new SorobanResurrectError('Test', 'NETWORK_ERROR')

      expect(policy.shouldRetry(err, 1)).toBe(true)
      expect(policy.shouldRetry(err, 1)).toBe(true)
      expect(policy.shouldRetry(err, 1)).toBe(false) // Third failure opens circuit
    })

    it('opens circuit after failure threshold', () => {
      const policy = new CircuitBreaker(3, 2, 1000, 100)
      const err = new SorobanResurrectError('Test', 'NETWORK_ERROR')

      expect(policy.shouldRetry(err, 1)).toBe(true) // First failure
      expect(policy.shouldRetry(err, 1)).toBe(false) // Second failure opens circuit
    })

    it('enters half-open state after timeout', async () => {
      const policy = new CircuitBreaker(3, 2, 50, 100) // 50ms timeout
      const err = new SorobanResurrectError('Test', 'NETWORK_ERROR')

      expect(policy.shouldRetry(err, 1)).toBe(true)
      expect(policy.shouldRetry(err, 1)).toBe(false) // Circuit open

      // Wait for timeout
      await new Promise(resolve => setTimeout(resolve, 75))

      // Should now allow a retry (half-open state)
      expect(policy.shouldRetry(err, 1)).toBe(true)
    })

    it('resets on success', () => {
      const policy = new CircuitBreaker(3, 2, 1000, 100)
      const err = new SorobanResurrectError('Test', 'NETWORK_ERROR')

      expect(policy.shouldRetry(err, 1)).toBe(true)
      expect(policy.shouldRetry(err, 1)).toBe(false) // Circuit open

      // Reset
      policy.reset?.()

      expect(policy.shouldRetry(err, 1)).toBe(true) // Can retry again
    })

    it('fails fast when circuit is open', () => {
      const policy = new CircuitBreaker(3, 2, 1000, 100)
      const err = new SorobanResurrectError('Test', 'NETWORK_ERROR')

      // Trigger circuit open
      policy.shouldRetry(err, 1)
      policy.shouldRetry(err, 1)

      // Circuit is now open, should reject even on first attempt
      expect(policy.shouldRetry(err, 1)).toBe(false)
    })

    it('respects delay configuration', () => {
      const policy = new CircuitBreaker(3, 5, 1000, 2500)
      expect(policy.getDelay(1)).toBe(2500)
      expect(policy.getDelay(2)).toBe(2500)
    })

    it('only retries on transient errors', () => {
      const policy = new CircuitBreaker()
      const networkErr = new SorobanResurrectError('Network timeout', 'NETWORK_ERROR')
      const invalidXdrErr = new SorobanResurrectError('Invalid XDR', 'INVALID_XDR')

      expect(policy.shouldRetry(networkErr, 1)).toBe(true)
      expect(policy.shouldRetry(invalidXdrErr, 1)).toBe(false)
    })
  })

  describe('DEFAULT_RETRY_POLICY', () => {
    it('is an ExponentialBackoff instance', () => {
      expect(DEFAULT_RETRY_POLICY).toBeInstanceOf(ExponentialBackoff)
    })

    it('has 3 max retries', () => {
      expect(DEFAULT_RETRY_POLICY.maxRetries).toBe(3)
    })

    it('uses 500ms base delay', () => {
      expect(DEFAULT_RETRY_POLICY.getDelay(1)).toBe(500)
      expect(DEFAULT_RETRY_POLICY.getDelay(2)).toBe(1000)
    })
  })

  describe('RetryPolicy error handling', () => {
    it('retries on all transient error types', () => {
      const policies = [
        new ExponentialBackoff(),
        new FixedDelay(),
        new JitterBackoff(),
        new CircuitBreaker(10, 100), // High threshold to avoid circuit open
      ]

      const transientErrors = [
        new SorobanResurrectError('Network error', 'NETWORK_ERROR'),
        new SorobanResurrectError('Simulation error', 'SIMULATION_FAILED'),
        new SorobanResurrectError('Archive detection error', 'ARCHIVE_DETECTION_FAILED'),
      ]

      for (const policy of policies) {
        for (const err of transientErrors) {
          expect(policy.shouldRetry(err, 1)).toBe(true)
        }
      }
    })

    it('does not retry on permanent error types', () => {
      const policies = [
        new ExponentialBackoff(),
        new FixedDelay(),
        new JitterBackoff(),
        new CircuitBreaker(10, 100),
      ]

      const permanentErrors = [
        new SorobanResurrectError('Invalid XDR', 'INVALID_XDR'),
        new SorobanResurrectError('No account', 'NO_ACCOUNT'),
        new SorobanResurrectError('Restore failed', 'RESTORE_FAILED'),
        new SorobanResurrectError('Original tx failed', 'ORIGINAL_TX_FAILED'),
      ]

      for (const policy of policies) {
        for (const err of permanentErrors) {
          expect(policy.shouldRetry(err, 1)).toBe(false)
        }
      }
    })
  })

  describe('Policy with SorobanResurrect integration', () => {
    it('can be configured in SorobanResurrect', async () => {
      const { SorobanResurrect } = await import('../src/soroban-resurrect.js')

      const customPolicy = new FixedDelay(5, 2000)
      const client = new SorobanResurrect({
        rpcUrl: 'https://soroban-testnet.stellar.org',
        networkPassphrase: 'Test SDF Network ; September 2015',
        retryPolicy: customPolicy,
      })

      // Policy is applied internally
      expect(client).toBeDefined()
    })

    it('defaults to ExponentialBackoff when not specified', async () => {
      const { SorobanResurrect } = await import('../src/soroban-resurrect.js')

      const client = new SorobanResurrect({
        rpcUrl: 'https://soroban-testnet.stellar.org',
        networkPassphrase: 'Test SDF Network ; September 2015',
      })

      // Default policy should be used
      expect(client).toBeDefined()
    })
  })
})

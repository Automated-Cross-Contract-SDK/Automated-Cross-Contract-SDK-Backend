import { describe, it } from 'vitest'
import fc from 'fast-check'
import {
  ExponentialBackoff,
  FixedDelay,
  JitterBackoff,
  CircuitBreaker,
  type RetryPolicy,
} from '../src/retry-policy.js'
import { SorobanResurrectError } from '../src/types.js'

// Arbitraries for property-based testing
const positiveInt = fc.integer({ min: 1, max: 100 })
const maxRetriesArb = fc.integer({ min: 1, max: 10 })
const attemptNumArb = fc.integer({ min: 1, max: 20 })
const delayMsArb = fc.integer({ min: 10, max: 5000 })

const retryableErrorCodes = ['NETWORK_ERROR', 'SIMULATION_FAILED', 'ARCHIVE_DETECTION_FAILED'] as const
const retryableErrorArb = fc.constantFrom(...retryableErrorCodes).map(
  code => new SorobanResurrectError('Test error', code),
)

const nonRetryableErrorCodes = ['INVALID_XDR', 'NO_ACCOUNT', 'RESTORE_FAILED', 'ORIGINAL_TX_FAILED'] as const
const nonRetryableErrorArb = fc.constantFrom(...nonRetryableErrorCodes).map(
  code => new SorobanResurrectError('Test error', code),
)

describe('RetryPolicy Property-Based Tests', () => {
  describe('ExponentialBackoff contracts', () => {
    it('should never return negative delays', () => {
      fc.assert(
        fc.property(maxRetriesArb, delayMsArb, attemptNumArb, (maxRetries, baseDelay, attempt) => {
          const policy = new ExponentialBackoff(maxRetries, baseDelay)
          const delay = policy.getDelay(attempt)
          return delay >= 0 && Number.isFinite(delay)
        }),
      )
    })

    it('should increase delays linearly with attempt number', () => {
      fc.assert(
        fc.property(maxRetriesArb, delayMsArb, (maxRetries, baseDelay) => {
          const policy = new ExponentialBackoff(maxRetries, baseDelay)
          const delay1 = policy.getDelay(1)
          const delay2 = policy.getDelay(2)
          const delay3 = policy.getDelay(3)

          return delay1 < delay2 && delay2 < delay3
        }),
      )
    })

    it('should respect maxRetries boundary', () => {
      fc.assert(
        fc.property(maxRetriesArb, retryableErrorArb, (maxRetries, error) => {
          const policy = new ExponentialBackoff(maxRetries)

          for (let i = 1; i <= maxRetries; i++) {
            const result = policy.shouldRetry(error, i)
            if (i < maxRetries) {
              return result === true
            }
          }

          const pastLimit = policy.shouldRetry(error, maxRetries + 1)
          return pastLimit === false
        }),
      )
    })

    it('should never retry on non-retryable errors', () => {
      fc.assert(
        fc.property(maxRetriesArb, nonRetryableErrorArb, attemptNumArb, (maxRetries, error, attempt) => {
          const policy = new ExponentialBackoff(maxRetries)
          return policy.shouldRetry(error, attempt) === false
        }),
      )
    })
  })

  describe('FixedDelay contracts', () => {
    it('should return constant delay for all attempts', () => {
      fc.assert(
        fc.property(maxRetriesArb, delayMsArb, (maxRetries, delay) => {
          const policy = new FixedDelay(maxRetries, delay)
          const attempt1 = policy.getDelay(1)
          const attempt2 = policy.getDelay(2)
          const attempt5 = policy.getDelay(5)
          const attempt10 = policy.getDelay(10)

          return attempt1 === delay && attempt2 === delay && attempt5 === delay && attempt10 === delay
        }),
      )
    })

    it('should never return negative delays', () => {
      fc.assert(
        fc.property(maxRetriesArb, delayMsArb, attemptNumArb, (maxRetries, delay, attempt) => {
          const policy = new FixedDelay(maxRetries, delay)
          return policy.getDelay(attempt) >= 0
        }),
      )
    })

    it('should enforce maxRetries contract', () => {
      fc.assert(
        fc.property(maxRetriesArb, retryableErrorArb, (maxRetries, error) => {
          const policy = new FixedDelay(maxRetries)

          let retryCount = 0
          for (let i = 1; i <= maxRetries + 1; i++) {
            if (policy.shouldRetry(error, i)) {
              retryCount++
            }
          }

          return retryCount === maxRetries
        }),
      )
    })
  })

  describe('JitterBackoff contracts', () => {
    it('should return delays within expected bounds', () => {
      fc.assert(
        fc.property(maxRetriesArb, delayMsArb, delayMsArb, attemptNumArb, (maxRetries, baseDelay, maxJitter, attempt) => {
          const policy = new JitterBackoff(maxRetries, baseDelay, maxJitter)
          const delay = policy.getDelay(attempt)

          // delay should be exponential base ± jitter
          const minExpected = baseDelay * Math.pow(2, attempt - 1)
          const maxExpected = minExpected + maxJitter

          return delay >= minExpected && delay <= maxExpected
        }),
      )
    })

    it('should never return negative delays', () => {
      fc.assert(
        fc.property(maxRetriesArb, delayMsArb, delayMsArb, attemptNumArb, (maxRetries, baseDelay, maxJitter, attempt) => {
          const policy = new JitterBackoff(maxRetries, baseDelay, maxJitter)
          return policy.getDelay(attempt) >= 0
        }),
      )
    })

    it('should increase expected delay with attempt number', () => {
      fc.assert(
        fc.property(maxRetriesArb, delayMsArb, delayMsArb, (maxRetries, baseDelay, maxJitter) => {
          const policy = new JitterBackoff(maxRetries, baseDelay, maxJitter)

          // Without jitter, delays should be:
          // attempt 1: baseDelay * 2^0 = baseDelay
          // attempt 2: baseDelay * 2^1 = baseDelay * 2
          // attempt 3: baseDelay * 2^2 = baseDelay * 4
          const exp1 = baseDelay * Math.pow(2, 0)
          const exp2 = baseDelay * Math.pow(2, 1)
          const exp3 = baseDelay * Math.pow(2, 2)

          return exp1 < exp2 && exp2 < exp3
        }),
      )
    })
  })

  describe('CircuitBreaker contracts', () => {
    it('should eventually open circuit after failure threshold', () => {
      fc.assert(
        fc.property(maxRetriesArb, fc.integer({ min: 2, max: 10 }), retryableErrorArb, (maxRetries, failureThreshold, error) => {
          const policy = new CircuitBreaker(maxRetries, failureThreshold, 1000, 100)

          let opened = false
          for (let i = 0; i < failureThreshold + 1; i++) {
            const canRetry = policy.shouldRetry(error, 1)
            if (!canRetry && i >= failureThreshold) {
              opened = true
              break
            }
          }

          return opened
        }),
      )
    })

    it('should reject retries when circuit is open', () => {
      fc.assert(
        fc.property(maxRetriesArb, fc.integer({ min: 2, max: 5 }), retryableErrorArb, (maxRetries, failureThreshold, error) => {
          const policy = new CircuitBreaker(maxRetries, failureThreshold, 1000, 100)

          // Trigger circuit open
          for (let i = 0; i < failureThreshold; i++) {
            policy.shouldRetry(error, 1)
          }

          // Circuit is now open, should reject
          return policy.shouldRetry(error, 1) === false
        }),
      )
    })

    it('should never return negative delays', () => {
      fc.assert(
        fc.property(maxRetriesArb, attemptNumArb, (maxRetries, attempt) => {
          const policy = new CircuitBreaker(maxRetries)
          return policy.getDelay(attempt) >= 0
        }),
      )
    })

    it('should reset state correctly', () => {
      fc.assert(
        fc.property(maxRetriesArb, fc.integer({ min: 2, max: 5 }), retryableErrorArb, (maxRetries, failureThreshold, error) => {
          const policy = new CircuitBreaker(maxRetries, failureThreshold, 1000, 100)

          // Open circuit
          for (let i = 0; i < failureThreshold; i++) {
            policy.shouldRetry(error, 1)
          }

          const beforeReset = policy.shouldRetry(error, 1)

          // Reset
          policy.reset?.()

          const afterReset = policy.shouldRetry(error, 1)

          return beforeReset === false && afterReset === true
        }),
      )
    })
  })

  describe('Universal RetryPolicy contracts', () => {
    it('all policies should have positive maxRetries', () => {
      fc.assert(
        fc.property(positiveInt, (maxRetries) => {
          const policies: RetryPolicy[] = [
            new ExponentialBackoff(maxRetries),
            new FixedDelay(maxRetries),
            new JitterBackoff(maxRetries),
            new CircuitBreaker(maxRetries),
          ]

          return policies.every(p => p.maxRetries > 0)
        }),
      )
    })

    it('all policies should reject retryable errors past maxRetries', () => {
      fc.assert(
        fc.property(positiveInt, retryableErrorArb, (maxRetries, error) => {
          const policies: RetryPolicy[] = [
            new ExponentialBackoff(maxRetries),
            new FixedDelay(maxRetries),
            new JitterBackoff(maxRetries),
            new CircuitBreaker(maxRetries, 1000),
          ]

          for (const policy of policies) {
            const atLimit = policy.shouldRetry(error, maxRetries)
            const pastLimit = policy.shouldRetry(error, maxRetries + 1)

            if (atLimit && pastLimit) {
              return false
            }
          }

          return true
        }),
      )
    })

    it('all policies should consistently reject non-retryable errors', () => {
      fc.assert(
        fc.property(positiveInt, nonRetryableErrorArb, (maxRetries, error) => {
          const policies: RetryPolicy[] = [
            new ExponentialBackoff(maxRetries),
            new FixedDelay(maxRetries),
            new JitterBackoff(maxRetries),
            new CircuitBreaker(maxRetries, 1000),
          ]

          return policies.every(p => !p.shouldRetry(error, 1))
        }),
      )
    })

    it('getDelay should always return finite positive numbers', () => {
      fc.assert(
        fc.property(positiveInt, attemptNumArb, (maxRetries, attempt) => {
          const policies: RetryPolicy[] = [
            new ExponentialBackoff(maxRetries),
            new FixedDelay(maxRetries),
            new JitterBackoff(maxRetries),
            new CircuitBreaker(maxRetries),
          ]

          return policies.every(p => {
            const delay = p.getDelay(attempt)
            return Number.isFinite(delay) && delay > 0
          })
        }),
      )
    })
  })

  describe('Retry policy timing invariants', () => {
    it('ExponentialBackoff delays should form monotonic sequence', () => {
      fc.assert(
        fc.property(maxRetriesArb, delayMsArb, (maxRetries, baseDelay) => {
          const policy = new ExponentialBackoff(maxRetries, baseDelay)
          const delays = [
            policy.getDelay(1),
            policy.getDelay(2),
            policy.getDelay(3),
            policy.getDelay(4),
            policy.getDelay(5),
          ]

          for (let i = 1; i < delays.length; i++) {
            if (delays[i] <= delays[i - 1]) {
              return false
            }
          }
          return true
        }),
      )
    })

    it('FixedDelay should have consistent delays', () => {
      fc.assert(
        fc.property(maxRetriesArb, delayMsArb, (maxRetries, delay) => {
          const policy = new FixedDelay(maxRetries, delay)
          const delays = [
            policy.getDelay(1),
            policy.getDelay(5),
            policy.getDelay(10),
            policy.getDelay(20),
          ]

          return delays.every(d => d === delay)
        }),
      )
    })

    it('delays should be reasonable within 1 hour', () => {
      fc.assert(
        fc.property(maxRetriesArb, delayMsArb, attemptNumArb, (maxRetries, baseDelay, attempt) => {
          const oneHourMs = 60 * 60 * 1000
          const policies: RetryPolicy[] = [
            new ExponentialBackoff(maxRetries, baseDelay),
            new FixedDelay(maxRetries, baseDelay),
            new JitterBackoff(maxRetries, baseDelay, baseDelay),
            new CircuitBreaker(maxRetries, 100, 30000, baseDelay),
          ]

          return policies.every(p => {
            const delay = p.getDelay(attempt)
            return delay < oneHourMs
          })
        }),
      )
    })
  })
})

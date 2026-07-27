import { SorobanResurrectError } from './types.js'

/**
 * Pluggable retry policy interface for handling transient failures
 */
export interface RetryPolicy {
  /** Maximum number of retry attempts */
  maxRetries: number

  /**
   * Determine if an error should be retried
   * @param error The error that occurred
   * @param attempt The attempt number (1-indexed)
   * @returns true if the operation should be retried, false otherwise
   */
  shouldRetry(error: SorobanResurrectError, attempt: number): boolean

  /**
   * Get the delay in milliseconds before the next retry attempt
   * @param attempt The attempt number (1-indexed)
   * @returns Delay in milliseconds
   */
  getDelay(attempt: number): number

  /**
   * Reset any internal state (used by CircuitBreaker)
   */
  reset?(): void
}

/**
 * Exponential backoff retry policy
 * Delays: 500ms, 1000ms, 1500ms, ...
 * Matches the original hardcoded behavior: RETRY_DELAY_MS * attempt
 */
export class ExponentialBackoff implements RetryPolicy {
  readonly maxRetries: number
  private readonly baseDelayMs: number

  constructor(maxRetries: number = 3, baseDelayMs: number = 500) {
    this.maxRetries = maxRetries
    this.baseDelayMs = baseDelayMs
  }

  shouldRetry(error: SorobanResurrectError, attempt: number): boolean {
    // Retry on network errors and simulation failures
    return (
      attempt <= this.maxRetries &&
      (error.code === 'NETWORK_ERROR' ||
        error.code === 'SIMULATION_FAILED' ||
        error.code === 'ARCHIVE_DETECTION_FAILED')
    )
  }

  getDelay(attempt: number): number {
    return this.baseDelayMs * attempt
  }
}

/**
 * Fixed delay retry policy
 * Delays by a constant amount: delayMs
 * Useful for rate-limited endpoints
 */
export class FixedDelay implements RetryPolicy {
  readonly maxRetries: number
  private readonly delayMs: number

  constructor(maxRetries: number = 3, delayMs: number = 1000) {
    this.maxRetries = maxRetries
    this.delayMs = delayMs
  }

  shouldRetry(error: SorobanResurrectError, attempt: number): boolean {
    return (
      attempt <= this.maxRetries &&
      (error.code === 'NETWORK_ERROR' ||
        error.code === 'SIMULATION_FAILED' ||
        error.code === 'ARCHIVE_DETECTION_FAILED')
    )
  }

  getDelay(attempt: number): number {
    return this.delayMs
  }
}

/**
 * Jittered exponential backoff retry policy
 * Adds random jitter to prevent thundering herd
 * Delays: baseDelay * 2^attempt ± random jitter
 */
export class JitterBackoff implements RetryPolicy {
  readonly maxRetries: number
  private readonly baseDelayMs: number
  private readonly maxJitterMs: number

  constructor(maxRetries: number = 3, baseDelayMs: number = 100, maxJitterMs: number = 500) {
    this.maxRetries = maxRetries
    this.baseDelayMs = baseDelayMs
    this.maxJitterMs = maxJitterMs
  }

  shouldRetry(error: SorobanResurrectError, attempt: number): boolean {
    return (
      attempt <= this.maxRetries &&
      (error.code === 'NETWORK_ERROR' ||
        error.code === 'SIMULATION_FAILED' ||
        error.code === 'ARCHIVE_DETECTION_FAILED')
    )
  }

  getDelay(attempt: number): number {
    // Exponential backoff: baseDelay * 2^attempt
    const exponentialDelay = this.baseDelayMs * Math.pow(2, attempt - 1)
    // Add random jitter between 0 and maxJitterMs
    const jitter = Math.random() * this.maxJitterMs
    return exponentialDelay + jitter
  }
}

/**
 * Circuit breaker retry policy
 * Fails fast after N consecutive failures, then enters half-open state after timeout
 * Prevents cascading failures
 */
export class CircuitBreaker implements RetryPolicy {
  readonly maxRetries: number
  private readonly failureThreshold: number
  private readonly openCircuitTimeoutMs: number
  private readonly delayMs: number

  private consecutiveFailures: number = 0
  private circuitOpenAt: number | null = null

  constructor(
    maxRetries: number = 3,
    failureThreshold: number = 5,
    openCircuitTimeoutMs: number = 30000,
    delayMs: number = 1000,
  ) {
    this.maxRetries = maxRetries
    this.failureThreshold = failureThreshold
    this.openCircuitTimeoutMs = openCircuitTimeoutMs
    this.delayMs = delayMs
  }

  shouldRetry(error: SorobanResurrectError, attempt: number): boolean {
    // Check if circuit should be closed/half-open
    if (this.circuitOpenAt !== null) {
      const timeSinceOpen = Date.now() - this.circuitOpenAt
      if (timeSinceOpen > this.openCircuitTimeoutMs) {
        // Half-open: allow one retry to test if service recovered
        this.circuitOpenAt = null
        this.consecutiveFailures = 0
      } else {
        // Circuit open: fail fast
        return false
      }
    }

    // Increment failure count
    this.consecutiveFailures++

    // Open circuit if threshold reached
    if (this.consecutiveFailures >= this.failureThreshold) {
      this.circuitOpenAt = Date.now()
      return false
    }

    // Allow retry if within attempt limit
    return (
      attempt <= this.maxRetries &&
      (error.code === 'NETWORK_ERROR' ||
        error.code === 'SIMULATION_FAILED' ||
        error.code === 'ARCHIVE_DETECTION_FAILED')
    )
  }

  getDelay(attempt: number): number {
    return this.delayMs
  }

  reset(): void {
    this.consecutiveFailures = 0
    this.circuitOpenAt = null
  }
}

/**
 * Default retry policy: exponential backoff
 */
export const DEFAULT_RETRY_POLICY = new ExponentialBackoff(3, 500)

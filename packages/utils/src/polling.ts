import type { PollingOptions } from './types.js'

/**
 * Error thrown when polling is aborted via an AbortSignal.
 * The `code` aligns with SorobanResurrectError codes.
 */
export class PollingAbortedError extends Error {
  readonly code = 'ABORTED'

  constructor(message = 'Polling aborted') {
    super(message)
    this.name = 'PollingAbortedError'
  }
}

/**
 * Error thrown when polling exhausts its max attempts.
 * Carries the last seen result/error and attempt info for context.
 */
export class PollingExhaustedError extends Error {
  readonly code = 'POLLING_EXHAUSTED'
  readonly attempts: number
  readonly lastResult?: unknown
  readonly lastError?: unknown

  constructor(
    attempts: number,
    lastResult?: unknown,
    lastError?: unknown,
  ) {
    super(`Polling failed after ${attempts} attempts`)
    this.name = 'PollingExhaustedError'
    this.attempts = attempts
    this.lastResult = lastResult
    this.lastError = lastError
  }
}

/**
 * Delay execution for a specified number of milliseconds
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Compute the delay before the next attempt.
 * When `jitterMs` is provided, applies full jitter: a random delay in
 * [0, jitterMs] is added on top of the base interval. Defaults to off so
 * existing fixed-interval behavior is preserved.
 */
function nextDelay(intervalMs: number, jitterMs?: number): number {
  if (!jitterMs || jitterMs <= 0) {
    return intervalMs
  }
  return intervalMs + Math.floor(Math.random() * jitterMs)
}

/**
 * Poll a condition function until it returns true or max attempts is reached
 */
export async function pollWithRetry<T>(
  condition: () => Promise<T | null | undefined>,
  options: PollingOptions = {},
): Promise<T> {
  const intervalMs = options.intervalMs || 1000
  const maxAttempts = options.maxAttempts || 30
  const signal = options.signal

  let lastResult: T | null | undefined
  let lastError: unknown

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (signal?.aborted) {
      throw new PollingAbortedError()
    }

    let result: T | null | undefined
    try {
      result = await condition()
    } catch (err) {
      lastError = err
      result = null
    }

    if (signal?.aborted) {
      throw new PollingAbortedError()
    }

    if (result !== null && result !== undefined) {
      return result
    }

    lastResult = result

    if (attempt < maxAttempts) {
      await delay(nextDelay(intervalMs, options.jitterMs))
    }
  }

  throw new PollingExhaustedError(maxAttempts, lastResult, lastError)
}

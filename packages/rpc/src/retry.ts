import { JsonRpcTransportError } from './json-rpc-transport.js';

export interface RetryOptions {
  /** Supplies the attempt limit and the backoff used when the server gives no `Retry-After`. */
  policy: { maxRetries: number; getDelay(attempt: number): number };
  /**
   * Total time budget in milliseconds measured from the first attempt. A retry is
   * not started when its wait would run past this budget; the last error is thrown instead.
   */
  deadlineMs?: number;
  /** Clock used for the deadline. Defaults to `Date.now`. */
  now?: () => number;
  /** Wait used between attempts. Defaults to a `setTimeout` promise. */
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Runs `operation`, retrying retryable {@link JsonRpcTransportError}s.
 *
 * When the failing response carried a `Retry-After`, that wait replaces the
 * policy backoff for that attempt. Either way the wait is subject to
 * `deadlineMs`, so the caller's time budget is never exceeded by a retry.
 */
export async function withRetry<T>(operation: () => Promise<T>, options: RetryOptions): Promise<T> {
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? defaultSleep;
  const startedAt = now();

  for (let attempt = 1; ; attempt++) {
    try {
      return await operation();
    } catch (err) {
      if (
        !(err instanceof JsonRpcTransportError) ||
        !err.retryable ||
        attempt > options.policy.maxRetries
      ) {
        throw err;
      }

      const delayMs = err.retryAfterMs ?? options.policy.getDelay(attempt);
      if (options.deadlineMs !== undefined && now() - startedAt + delayMs > options.deadlineMs) {
        throw err;
      }
      await sleep(delayMs);
    }
  }
}

export interface BatchingOptions {
  /** Maximum number of keys per batch */
  maxBatchSize?: number
  /** Maximum number of concurrent batches */
  maxConcurrency?: number
}

export interface PollingOptions {
  /** Interval between polling attempts in milliseconds */
  intervalMs?: number
  /** Maximum number of polling attempts */
  maxAttempts?: number
  /** Random extra delay (0..jitterMs) added to each interval to spread out retries */
  jitterMs?: number
  /** Stops polling with a PollingAbortedError when aborted */
  signal?: AbortSignal
}

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
}

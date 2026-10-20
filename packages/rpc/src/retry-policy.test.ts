import { describe, it, expect } from 'vitest';
import { SorobanResurrectError, SorobanResurrectErrorCode } from '@soroban-resurrect/errors';
import { ExponentialBackoff, DEFAULT_RETRY_POLICY } from './retry-policy';

describe('ExponentialBackoff delay sequence (#443)', () => {
  it('scales the base delay by attempt number from 500ms', () => {
    const policy = new ExponentialBackoff(3, 500);

    expect([1, 2, 3].map((attempt) => policy.getDelay(attempt))).toEqual([500, 1000, 1500]);
  });

  it('uses 500ms base delay and 3 retries by default', () => {
    expect(DEFAULT_RETRY_POLICY.maxRetries).toBe(3);
    expect(DEFAULT_RETRY_POLICY.getDelay(1)).toBe(500);
  });
});

describe('ExponentialBackoff retry classification (#443)', () => {
  const networkError = new SorobanResurrectError(SorobanResurrectErrorCode.NETWORK_ERROR);

  it('retries a retryable error while attempts remain', () => {
    const policy = new ExponentialBackoff(3, 500);

    expect(policy.shouldRetry(networkError, 3)).toBe(true);
  });

  it('stops retrying once attempts exceed maxRetries', () => {
    const policy = new ExponentialBackoff(3, 500);

    expect(policy.shouldRetry(networkError, 4)).toBe(false);
  });

  it('never retries a non-retryable error', () => {
    const policy = new ExponentialBackoff(3, 500);
    const invalidXdr = new SorobanResurrectError(SorobanResurrectErrorCode.INVALID_XDR);

    expect(policy.shouldRetry(invalidXdr, 1)).toBe(false);
  });
});

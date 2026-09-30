import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RpcFailoverManager } from './rpc-failover';

describe('RpcFailoverManager thresholds', () => {
  let manager: RpcFailoverManager;

  beforeEach(() => {
    manager = new RpcFailoverManager({
      endpoints: ['https://a.example.com', 'https://b.example.com'],
      maxFailuresBeforeFallback: 3,
      successThresholdToRestore: 2,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps an endpoint healthy after a single failure when threshold is 3', () => {
    manager.recordFailure('https://a.example.com');
    expect(manager.isHealthy('https://a.example.com')).toBe(true);
  });

  it('marks an endpoint unhealthy exactly on the 3rd consecutive failure', () => {
    manager.recordFailure('https://a.example.com');
    manager.recordFailure('https://a.example.com');
    expect(manager.isHealthy('https://a.example.com')).toBe(true);

    manager.recordFailure('https://a.example.com');
    expect(manager.isHealthy('https://a.example.com')).toBe(false);
  });

  it('requires 2 consecutive successes to restore an unhealthy endpoint', () => {
    manager.recordFailure('https://a.example.com');
    manager.recordFailure('https://a.example.com');
    manager.recordFailure('https://a.example.com');
    expect(manager.isHealthy('https://a.example.com')).toBe(false);

    manager.recordSuccess('https://a.example.com');
    expect(manager.isHealthy('https://a.example.com')).toBe(false);

    manager.recordSuccess('https://a.example.com');
    expect(manager.isHealthy('https://a.example.com')).toBe(true);
  });

  it('resets the failure counter when a success occurs on a healthy endpoint', () => {
    manager.recordFailure('https://a.example.com');
    manager.recordFailure('https://a.example.com');
    manager.recordSuccess('https://a.example.com');

    manager.recordFailure('https://a.example.com');
    manager.recordFailure('https://a.example.com');
    expect(manager.isHealthy('https://a.example.com')).toBe(true);

    manager.recordFailure('https://a.example.com');
    expect(manager.isHealthy('https://a.example.com')).toBe(false);
  });

  it('resets the success counter when a failure occurs on an unhealthy endpoint', () => {
    manager.recordFailure('https://a.example.com');
    manager.recordFailure('https://a.example.com');
    manager.recordFailure('https://a.example.com');
    expect(manager.isHealthy('https://a.example.com')).toBe(false);

    manager.recordSuccess('https://a.example.com');
    manager.recordFailure('https://a.example.com');
    manager.recordSuccess('https://a.example.com');
    expect(manager.isHealthy('https://a.example.com')).toBe(false);

    manager.recordSuccess('https://a.example.com');
    expect(manager.isHealthy('https://a.example.com')).toBe(true);
  });
});

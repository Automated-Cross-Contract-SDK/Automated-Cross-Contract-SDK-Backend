import { describe, it, expect } from 'vitest';
import { createConcurrencyLimiter } from './concurrency';

const flush = () => new Promise((resolve) => setImmediate(resolve));

/**
 * Simulates an RPC endpoint that rejects requests beyond `limit` in flight,
 * as providers do with HTTP 429 or a JSON-RPC "too many requests" error.
 */
function limitedEndpoint(limit: number) {
  let inFlight = 0;
  let peak = 0;
  let rejected = 0;
  const call = async (id: number) => {
    if (inFlight >= limit) {
      rejected++;
      throw Object.assign(new Error('Too Many Requests'), { status: 429 });
    }
    inFlight++;
    peak = Math.max(peak, inFlight);
    try {
      await flush();
      await flush();
      return id;
    } finally {
      inFlight--;
    }
  };
  return { call, stats: () => ({ inFlight, peak, rejected }) };
}

describe('concurrency limiter against endpoint concurrency limits', () => {
  it('never exceeds an endpoint limit equal to maxConcurrent', async () => {
    const endpoint = limitedEndpoint(4);
    const limiter = createConcurrencyLimiter(4);
    const ids = Array.from({ length: 25 }, (_, i) => i);

    const results = await Promise.all(ids.map((id) => limiter.run(() => endpoint.call(id))));

    expect(results).toEqual(ids);
    expect(endpoint.stats()).toEqual({ inFlight: 0, peak: 4, rejected: 0 });
  });

  it('surfaces endpoint rejections when maxConcurrent is above the endpoint limit', async () => {
    const endpoint = limitedEndpoint(2);
    const limiter = createConcurrencyLimiter(5);

    const settled = await Promise.allSettled(
      Array.from({ length: 5 }, (_, i) => limiter.run(() => endpoint.call(i))),
    );

    const rejected = settled.filter((s) => s.status === 'rejected');
    expect(rejected).toHaveLength(3);
    expect((rejected[0] as PromiseRejectedResult).reason.status).toBe(429);
    expect(endpoint.stats().rejected).toBe(3);
  });

  it('releases the slot of a rejected request so queued requests still run', async () => {
    const limiter = createConcurrencyLimiter(1);
    let failNext = true;
    const call = async () => {
      if (failNext) {
        failNext = false;
        throw Object.assign(new Error('Too Many Requests'), { status: 429 });
      }
      return 'ok';
    };

    const first = limiter.run(call);
    const second = limiter.run(call);
    expect(limiter.pending).toBe(1);

    await expect(first).rejects.toThrow('Too Many Requests');
    await expect(second).resolves.toBe('ok');
    expect(limiter.active).toBe(0);
    expect(limiter.pending).toBe(0);
  });

  it('keeps the queue FIFO while the endpoint is saturated', async () => {
    const endpoint = limitedEndpoint(2);
    const limiter = createConcurrencyLimiter(2);
    const started: number[] = [];

    await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        limiter.run(() => {
          started.push(i);
          return endpoint.call(i);
        }),
      ),
    );

    expect(started).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(endpoint.stats().peak).toBe(2);
  });
});

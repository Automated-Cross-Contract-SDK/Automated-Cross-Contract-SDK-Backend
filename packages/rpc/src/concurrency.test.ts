import { describe, it, expect } from 'vitest';
import { createConcurrencyLimiter } from './concurrency';

/** A promise the test resolves by hand, so it controls when each task finishes. */
function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

describe('createConcurrencyLimiter', () => {
  it('never runs more tasks at once than the configured maximum', async () => {
    const limiter = createConcurrencyLimiter(3);
    let running = 0;
    let peak = 0;

    const task = async () => {
      running++;
      peak = Math.max(peak, running);
      await flush();
      await flush();
      running--;
      return 'done';
    };

    const results = await Promise.all(Array.from({ length: 12 }, () => limiter.run(task)));

    expect(results).toHaveLength(12);
    expect(peak).toBe(3);
    expect(limiter.active).toBe(0);
    expect(limiter.pending).toBe(0);
  });

  it('starts queued tasks in submission order', async () => {
    const limiter = createConcurrencyLimiter(1);
    const started: number[] = [];
    const gates = [deferred(), deferred(), deferred()];

    const runs = [0, 1, 2].map((i) =>
      limiter.run(async () => {
        started.push(i);
        await gates[i].promise;
      }),
    );

    await flush();
    expect(started).toEqual([0]);
    expect(limiter.pending).toBe(2);

    gates[0].resolve();
    await flush();
    expect(started).toEqual([0, 1]);

    gates[1].resolve();
    gates[2].resolve();
    await Promise.all(runs);
    expect(started).toEqual([0, 1, 2]);
  });

  it('frees the slot and propagates the error when a task rejects', async () => {
    const limiter = createConcurrencyLimiter(1);
    const failing = deferred();

    const first = limiter.run(() => failing.promise);
    const second = limiter.run(async () => 'second ran');

    failing.reject(new Error('boom'));

    await expect(first).rejects.toThrow('boom');
    await expect(second).resolves.toBe('second ran');
    expect(limiter.active).toBe(0);
  });

  it('reports active and pending counts while tasks are held', async () => {
    const limiter = createConcurrencyLimiter(2);
    const gates = [deferred(), deferred(), deferred()];

    const runs = gates.map((gate) => limiter.run(() => gate.promise));
    await flush();

    expect(limiter.active).toBe(2);
    expect(limiter.pending).toBe(1);

    gates.forEach((gate) => gate.resolve());
    await Promise.all(runs);
    expect(limiter.active).toBe(0);
    expect(limiter.pending).toBe(0);
  });

  it('allows unlimited concurrency when given Infinity', async () => {
    const limiter = createConcurrencyLimiter(Infinity);
    const gate = deferred();

    const runs = Array.from({ length: 50 }, () => limiter.run(() => gate.promise));
    await flush();

    expect(limiter.active).toBe(50);
    expect(limiter.pending).toBe(0);
    gate.resolve();
    await Promise.all(runs);
  });

  it.each([0, -1, NaN])('rejects a maximum of %s', (max) => {
    expect(() => createConcurrencyLimiter(max)).toThrow(RangeError);
  });
});

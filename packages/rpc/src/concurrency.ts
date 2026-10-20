export interface ConcurrencyLimiter {
  /** Runs `task` once a slot is free. Queued tasks start in the order they were submitted. */
  run<T>(task: () => Promise<T>): Promise<T>;
  /** Tasks currently holding a slot. */
  readonly active: number;
  /** Tasks waiting for a slot. */
  readonly pending: number;
}

/**
 * Creates a FIFO limiter that allows at most `maxConcurrent` tasks to run at once.
 *
 * A finished task hands its slot straight to the next queued task, so a
 * continuous stream of new calls cannot starve tasks already waiting.
 */
export function createConcurrencyLimiter(maxConcurrent: number): ConcurrencyLimiter {
  if (!(maxConcurrent >= 1)) {
    throw new RangeError(`maxConcurrent must be at least 1, received ${maxConcurrent}`);
  }

  let active = 0;
  const queue: Array<() => void> = [];

  const acquire = (): Promise<void> => {
    if (active < maxConcurrent) {
      active++;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => queue.push(resolve));
  };

  const release = (): void => {
    const next = queue.shift();
    if (next) {
      // Transfer the slot to the waiter; `active` is unchanged.
      next();
    } else {
      active--;
    }
  };

  return {
    async run<T>(task: () => Promise<T>): Promise<T> {
      await acquire();
      try {
        return await task();
      } finally {
        release();
      }
    },
    get active() {
      return active;
    },
    get pending() {
      return queue.length;
    },
  };
}

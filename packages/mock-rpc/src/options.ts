export interface MockRpcServerOptions {
  /**
   * Seed used to make deterministic randomness reproducible across runs.
   */
  seed?: number;
  /**
   * Default network condition applied to the server. Individual calls may
   * override this via request options.
   */
  networkCondition?: NetworkCondition;
  /**
   * Injectable clock used for all artificial delays (e.g. the `slow` and
   * `timeout` network conditions). Defaults to the real `Date.now`.
   *
   * Tests can supply a fake implementation (e.g. backed by
   * `vi.useFakeTimers()`) so slow/timeout behavior can be asserted without
   * sleeping real milliseconds.
   */
  now?: () => number;
  /**
   * Injectable sleep used for all artificial delays (e.g. the `slow` and
   * `timeout` network conditions). Defaults to a real `setTimeout`-based
   * implementation.
   *
   * Tests can supply a fake implementation (e.g. backed by
   * `vi.useFakeTimers()`) so slow/timeout behavior can be asserted without
   * sleeping real milliseconds.
   */
  sleep?: (ms: number) => Promise<void>;
}

export type NetworkCondition = 'fast' | 'normal' | 'slow' | 'timeout';

export const defaultNow = (): number => Date.now();

export const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export interface ResolvedMockRpcServerOptions {
  seed: number;
  networkCondition: NetworkCondition;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
}

export function resolveOptions(
  options: MockRpcServerOptions = {},
): ResolvedMockRpcServerOptions {
  return {
    seed: options.seed ?? 1,
    networkCondition: options.networkCondition ?? 'normal',
    now: options.now ?? defaultNow,
    sleep: options.sleep ?? defaultSleep,
  };
}

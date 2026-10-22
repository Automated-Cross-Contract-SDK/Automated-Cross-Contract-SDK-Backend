import { useCallback, useEffect, useRef, useState } from 'react';

export interface ProgressState {
  /** Latest reported progress value (0-100). */
  value: number;
  /** Optional human-readable status message. */
  message?: string;
  /** Whether the operation has completed. */
  done: boolean;
}

export interface UseProgressOptions {
  /**
   * Minimum interval (ms) between committed React state updates when progress
   * is reported at high frequency. Intermediate values are coalesced so only
   * the most recent value is rendered. Defaults to 100ms. Set to 0 to disable
   * batching and render every update synchronously.
   */
  throttleMs?: number;
  /** Initial progress value. Defaults to 0. */
  initialValue?: number;
}

export interface UseProgressResult extends ProgressState {
  /** Report a new progress value. High-frequency calls are coalesced. */
  setProgress: (value: number, message?: string) => void;
  /** Mark the operation complete and flush any pending value. */
  complete: (message?: string) => void;
  /** Reset progress back to the initial value. */
  reset: () => void;
}

const DEFAULT_THROTTLE_MS = 100;

function clamp(value: number): number {
  if (Number.isNaN(value)) return 0;
  if (value < 0) return 0;
  if (value > 100) return 100;
  return value;
}

/**
 * Track progress updates while avoiding unnecessary React renders during
 * high-frequency reporting. Rapid bursts of `setProgress` calls are coalesced
 * into at most one render per `throttleMs` window, always committing the most
 * recent value. Pending updates are flushed on `complete` and dropped on
 * unmount so no state is set after the component is gone.
 */
export function useProgress(options: UseProgressOptions = {}): UseProgressResult {
  const { throttleMs = DEFAULT_THROTTLE_MS, initialValue = 0 } = options;

  const [state, setState] = useState<ProgressState>(() => ({
    value: clamp(initialValue),
    done: false,
  }));

  const mountedRef = useRef(true);
  const lastCommitRef = useRef(0);
  const pendingRef = useRef<ProgressState | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const flush = useCallback(() => {
    clearTimer();
    const pending = pendingRef.current;
    if (pending === null) return;
    pendingRef.current = null;
    if (!mountedRef.current) return;
    lastCommitRef.current = Date.now();
    setState(pending);
  }, [clearTimer]);

  const schedule = useCallback(
    (next: ProgressState) => {
      if (!mountedRef.current) return;

      if (throttleMs <= 0) {
        lastCommitRef.current = Date.now();
        setState(next);
        return;
      }

      pendingRef.current = next;
      const now = Date.now();
      const elapsed = now - lastCommitRef.current;

      if (elapsed >= throttleMs) {
        flush();
        return;
      }

      if (timerRef.current === null) {
        timerRef.current = setTimeout(flush, throttleMs - elapsed);
      }
    },
    [flush, throttleMs],
  );

  const setProgress = useCallback(
    (value: number, message?: string) => {
      schedule({ value: clamp(value), message, done: false });
    },
    [schedule],
  );

  const complete = useCallback(
    (message?: string) => {
      pendingRef.current = { value: 100, message, done: true };
      flush();
    },
    [flush],
  );

  const reset = useCallback(() => {
    clearTimer();
    pendingRef.current = null;
    if (!mountedRef.current) return;
    lastCommitRef.current = Date.now();
    setState({ value: clamp(initialValue), done: false });
  }, [clearTimer, initialValue]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearTimer();
      pendingRef.current = null;
    };
  }, [clearTimer]);

  return { ...state, setProgress, complete, reset };
}

/**
 * Structured logging interface for the Soroban-Resurrect SDK.
 *
 * Replaces the simple `onLog` callback with a standard Logger interface that
 * is compatible with popular logging libraries (pino, winston, bunyan) as well
 * as the browser `console` object.
 *
 * @example Pino
 * ```ts
 * import pino from 'pino';
 * const resurrect = new SorobanResurrect({
 *   logger: pino({ level: 'info' }),
 * });
 * ```
 *
 * @example Console (no-dependency)
 * ```ts
 * const resurrect = new SorobanResurrect({
 *   logger: consoleLogger(),
 * });
 * ```
 *
 * @example Correlation IDs
 * ```ts
 * const resurrect = new SorobanResurrect({
 *   logger: pino({ level: 'info' }).child({ requestId: 'abc-123' }),
 * });
 * ```
 */

/**
 * Minimal structured logger interface.
 *
 * Compatible with pino, winston (when using `.child()`), bunyan, and the
 * browser console. Any object that satisfies these four method signatures
 * can be passed as the `logger` config option.
 */
export interface Logger {
  info(msg: string, meta?: Record<string, unknown>): void
  warn(msg: string, meta?: Record<string, unknown>): void
  error(msg: string, meta?: Record<string, unknown>): void
  debug(msg: string, meta?: Record<string, unknown>): void
}

/**
 * No-op logger that discards all log messages.
 * Used internally when no logger is configured.
 */
class NoopLogger implements Logger {
  info(_msg: string, _meta?: Record<string, unknown>): void {}
  warn(_msg: string, _meta?: Record<string, unknown>): void {}
  error(_msg: string, _meta?: Record<string, unknown>): void {}
  debug(_msg: string, _meta?: Record<string, unknown>): void {}
}

/** Singleton no-op logger instance. */
export const NOOP_LOGGER: Logger = new NoopLogger()

/**
 * Creates a logger that forwards to the browser/Node `console`.
 * Merges `meta` fields into the log output as a second argument.
 *
 * @example
 * ```ts
 * const resurrect = new SorobanResurrect({
 *   logger: consoleLogger(),
 * });
 * ```
 */
export function consoleLogger(): Logger {
  return {
    info(msg, meta): void {
      if (meta && Object.keys(meta).length > 0) {
        console.info(`[soroban-resurrect] ${msg}`, meta)
      } else {
        console.info(`[soroban-resurrect] ${msg}`)
      }
    },
    warn(msg, meta): void {
      if (meta && Object.keys(meta).length > 0) {
        console.warn(`[soroban-resurrect] ${msg}`, meta)
      } else {
        console.warn(`[soroban-resurrect] ${msg}`)
      }
    },
    error(msg, meta): void {
      if (meta && Object.keys(meta).length > 0) {
        console.error(`[soroban-resurrect] ${msg}`, meta)
      } else {
        console.error(`[soroban-resurrect] ${msg}`)
      }
    },
    debug(msg, meta): void {
      if (meta && Object.keys(meta).length > 0) {
        console.debug(`[soroban-resurrect] ${msg}`, meta)
      } else {
        console.debug(`[soroban-resurrect] ${msg}`)
      }
    },
  }
}

/**
 * Adapts the legacy `onLog` callback to the `Logger` interface so that
 * callers who pass `onLog` still get their messages delivered until they
 * migrate to the structured `logger` option.
 *
 * @internal
 */
export function onLogToLogger(
  onLog: (level: 'info' | 'warn' | 'error', message: string, data?: unknown) => void,
): Logger {
  return {
    info(msg, meta): void { onLog('info', msg, meta) },
    warn(msg, meta): void { onLog('warn', msg, meta) },
    error(msg, meta): void { onLog('error', msg, meta) },
    debug(_msg, _meta): void { /* debug not supported by the legacy callback */ },
  }
}

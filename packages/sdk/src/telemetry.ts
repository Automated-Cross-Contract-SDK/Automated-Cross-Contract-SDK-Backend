/**
 * OpenTelemetry instrumentation for the Soroban-Resurrect SDK.
 *
 * Design goals:
 * - Zero-cost when OTel is not installed: all OTel imports are optional peer
 *   dependencies resolved at runtime.
 * - Forward-compatible: the SDK never crashes if the consumer uses a different
 *   OTel API version.
 * - Span names match the documented contract:
 *     soroban-resurrect.simulate
 *     soroban-resurrect.detect-archived
 *     soroban-resurrect.build-restore
 *     soroban-resurrect.submit-restore
 *     soroban-resurrect.submit-original
 *     soroban-resurrect.check-and-prepare
 *
 * @example
 * ```ts
 * import { trace, propagation } from '@opentelemetry/api';
 *
 * const resurrect = new SorobanResurrect({
 *   telemetry: {
 *     tracer: trace.getTracer('@soroban-resurrect/sdk'),
 *     propagator: propagation,
 *   },
 * });
 * ```
 */

/** Minimal subset of the OTel Span API we depend on. */
export interface OtelSpan {
  setAttribute(key: string, value: string | number | boolean): this
  setStatus(status: { code: 0 | 1 | 2; message?: string }): this
  recordException(exception: unknown): this
  end(): void
}

/** Minimal subset of the OTel Tracer API we depend on. */
export interface OtelTracer {
  startActiveSpan<T>(name: string, fn: (span: OtelSpan) => Promise<T>): Promise<T>
  startActiveSpan<T>(
    name: string,
    options: Record<string, unknown>,
    fn: (span: OtelSpan) => Promise<T>,
  ): Promise<T>
}

/** Minimal subset of OTel API we use for context propagation. */
export interface OtelPropagator {
  inject(context: unknown, carrier: Record<string, string>): void
}

export interface TelemetryConfig {
  /**
   * An OTel Tracer instance, typically obtained via:
   *   `trace.getTracer('@soroban-resurrect/sdk', VERSION)`
   *
   * When omitted the SDK operates in no-op mode — all tracing calls are
   * forwarded to a lightweight stub that incurs no overhead.
   */
  tracer?: OtelTracer
  /**
   * An OTel TextMapPropagator used to inject trace context into outbound
   * Soroban RPC HTTP headers (traceparent / tracestate).
   * Typically `propagation` from `@opentelemetry/api`.
   */
  propagator?: OtelPropagator
  /**
   * OTel context object used as the root context for new spans.
   * When omitted, the current active context is used automatically.
   */
  rootContext?: unknown
}

/** Status codes mirroring OTel SpanStatusCode. */
export const SpanStatus = {
  UNSET: 0,
  OK: 1,
  ERROR: 2,
} as const

/** A no-op span that satisfies the OtelSpan interface without doing anything. */
class NoopSpan implements OtelSpan {
  setAttribute(_key: string, _value: string | number | boolean): this { return this }
  setStatus(_status: { code: 0 | 1 | 2; message?: string }): this { return this }
  recordException(_exception: unknown): this { return this }
  end(): void {}
}

/** A no-op tracer that satisfies the OtelTracer interface. */
class NoopTracer implements OtelTracer {
  async startActiveSpan<T>(
    _name: string,
    fnOrOptions: ((span: OtelSpan) => Promise<T>) | Record<string, unknown>,
    maybeFn?: (span: OtelSpan) => Promise<T>,
  ): Promise<T> {
    const fn = typeof fnOrOptions === 'function' ? fnOrOptions : maybeFn!
    return fn(new NoopSpan())
  }
}

const NOOP_TRACER = new NoopTracer()

/**
 * Instrumentation helper bound to a single SDK instance.
 * Thin wrapper around an optional OTel tracer — callers never need to check
 * whether OTel is available.
 */
export class SdkTelemetry {
  private readonly tracer: OtelTracer
  private readonly propagator?: OtelPropagator

  constructor(config?: TelemetryConfig) {
    this.tracer = config?.tracer ?? NOOP_TRACER
    this.propagator = config?.propagator
  }

  /**
   * Execute `fn` inside a new active span named `soroban-resurrect.<operation>`.
   *
   * Span lifecycle:
   * - All `attributes` are set before `fn` is called.
   * - On success: status is set to OK and the span is ended.
   * - On failure: the exception is recorded, status is set to ERROR, the span
   *   is ended, and the error is re-thrown.
   *
   * Span names follow the documented contract:
   *   soroban-resurrect.simulate
   *   soroban-resurrect.detect-archived
   *   soroban-resurrect.build-restore
   *   soroban-resurrect.submit-restore
   *   soroban-resurrect.submit-original
   *   soroban-resurrect.check-and-prepare
   */
  async trace<T>(
    operation: string,
    attributes: Record<string, string | number | boolean>,
    fn: (span: OtelSpan) => Promise<T>,
  ): Promise<T> {
    return this.tracer.startActiveSpan(
      `soroban-resurrect.${operation}`,
      async (span: OtelSpan) => {
        for (const [key, value] of Object.entries(attributes)) {
          span.setAttribute(key, value)
        }
        try {
          const result = await fn(span)
          span.setStatus({ code: SpanStatus.OK })
          return result
        } catch (err) {
          span.recordException(err)
          span.setStatus({
            code: SpanStatus.ERROR,
            message: err instanceof Error ? err.message : String(err),
          })
          throw err
        } finally {
          span.end()
        }
      },
    )
  }

  /**
   * Inject W3C traceparent / tracestate headers into an HTTP carrier object.
   *
   * Call this before making outbound Soroban RPC requests to forward the
   * active trace context so that RPC-level spans appear as children of the
   * SDK span.
   *
   * Propagation is best-effort — errors are silently swallowed so they never
   * break the SDK.
   */
  injectHeaders(carrier: Record<string, string>): void {
    if (this.propagator) {
      try {
        // Pass `undefined` so OTel picks up the current active context
        // automatically via its own context manager.
        this.propagator.inject(undefined, carrier)
      } catch {
        // Intentionally ignored — propagation must never crash the SDK.
      }
    }
  }
}

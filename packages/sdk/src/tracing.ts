/**
 * Distributed tracing support — W3C Trace Context (`traceparent` / `tracestate`)
 * header propagation for Soroban RPC calls.
 *
 * The SDK does not depend on any specific tracing vendor. Instead it parses an
 * incoming trace context, creates a child span for every outbound RPC call and
 * attaches a fresh `traceparent` header to that request. A pluggable
 * {@link SpanExporter} hook lets callers forward span timing to OpenTelemetry,
 * Datadog, Jaeger, Zipkin or any other backend.
 *
 * @see https://www.w3.org/TR/trace-context/
 */

const TRACEPARENT_RE =
  /^([0-9a-f]{2})-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/

const SUPPORTED_VERSION = '00'
const FLAG_SAMPLED = 0x01

function randomHex(bytes: number): string {
  let out = ''
  for (let i = 0; i < bytes; i++) {
    out += Math.floor(Math.random() * 256)
      .toString(16)
      .padStart(2, '0')
  }
  return out
}

/**
 * A parsed W3C `traceparent` value plus the opaque vendor `tracestate` string.
 */
export interface TraceContext {
  /** 16-byte trace id, lowercase hex (32 chars). Shared across the whole trace. */
  traceId: string
  /** 8-byte span id, lowercase hex (16 chars). Identifies the parent span. */
  spanId: string
  /** Trace flags byte, lowercase hex (2 chars). Bit 0 is the "sampled" flag. */
  traceFlags: string
  /** Opaque vendor-specific list from the `tracestate` header, if present. */
  traceState?: string
}

/** The lifecycle data reported to a {@link SpanExporter}. */
export interface SpanData {
  name: string
  traceId: string
  spanId: string
  parentSpanId?: string
  /** `performance.now()`-style start timestamp in milliseconds. */
  startTime: number
  /** Wall-clock start time (`Date.now()`), useful for exporters. */
  startEpochMs: number
  endTime?: number
  durationMs?: number
  status: 'unset' | 'ok' | 'error'
  attributes: Record<string, string | number | boolean>
  error?: { message: string; name?: string }
}

/** Hook invoked when a span starts and again when it ends. */
export interface SpanExporter {
  onSpanStart?: (span: SpanData) => void
  onSpanEnd?: (span: SpanData) => void
}

export interface TracingConfig {
  /** Master switch. When `false` (default) no headers are injected. */
  enabled?: boolean
  /**
   * Explicit parent trace context. Supply this when the incoming request's
   * `traceparent` has already been parsed by your web framework. Accepts either
   * a raw `traceparent` string or a {@link TraceContext} object.
   */
  parent?: string | TraceContext
  /** Raw incoming headers — `traceparent` / `tracestate` are extracted if present. */
  headers?: Record<string, string | string[] | undefined>
  /**
   * Logical service name attached to every span as the `service.name` attribute.
   */
  serviceName?: string
  /** Static attributes merged into every span (e.g. `deployment.environment`). */
  defaultAttributes?: Record<string, string | number | boolean>
  /** Span lifecycle hook for forwarding timing to a tracing backend. */
  exporter?: SpanExporter
  /**
   * When the parent context is unsampled (or absent), start new traces as
   * sampled. Defaults to `true` so RPC calls are always traceable.
   */
  sampled?: boolean
}

/**
 * Serialise a {@link TraceContext} back into a `traceparent` header value.
 */
export function formatTraceparent(ctx: TraceContext): string {
  return `${SUPPORTED_VERSION}-${ctx.traceId}-${ctx.spanId}-${ctx.traceFlags}`
}

/**
 * Parse a W3C `traceparent` header value. Returns `null` when the value is
 * missing or malformed (per spec, callers should then start a fresh trace).
 */
export function parseTraceparent(
  value: string | string[] | undefined | null,
): TraceContext | null {
  if (!value) return null
  const raw = Array.isArray(value) ? value[0] : value
  const match = TRACEPARENT_RE.exec(raw.trim().toLowerCase())
  if (!match) return null
  const [, version, traceId, spanId, traceFlags] = match
  // Future versions must still be accepted if they start with a known shape,
  // but version ff is explicitly invalid.
  if (version === 'ff') return null
  if (traceId === '0'.repeat(32) || spanId === '0'.repeat(16)) return null
  return { traceId, spanId, traceFlags }
}

function headerValue(
  headers: Record<string, string | string[] | undefined> | undefined,
  name: string,
): string | string[] | undefined {
  if (!headers) return undefined
  const lower = name.toLowerCase()
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === lower) return headers[key]
  }
  return undefined
}

/**
 * Resolve the effective parent trace context from an explicit value or from raw
 * request headers. Returns `null` when nothing usable is found.
 */
export function resolveParentContext(config: TracingConfig): TraceContext | null {
  if (config.parent) {
    if (typeof config.parent === 'string') {
      return parseTraceparent(config.parent)
    }
    return config.parent
  }
  const tp = parseTraceparent(headerValue(config.headers, 'traceparent'))
  if (!tp) return null
  const ts = headerValue(config.headers, 'tracestate')
  if (ts) tp.traceState = Array.isArray(ts) ? ts.join(',') : ts
  return tp
}

/**
 * An in-flight span. Call {@link Span.headers} to obtain the `traceparent` /
 * `tracestate` headers to attach to the outbound RPC request, then
 * {@link Span.end} once the call settles.
 */
export class Span {
  readonly data: SpanData

  constructor(
    data: SpanData,
    private readonly traceState: string | undefined,
    private readonly exporter: SpanExporter | undefined,
  ) {
    this.data = data
    this.exporter?.onSpanStart?.(this.data)
  }

  /** Headers to propagate this span to the downstream service. */
  headers(): Record<string, string> {
    const out: Record<string, string> = {
      traceparent: formatTraceparent({
        traceId: this.data.traceId,
        spanId: this.data.spanId,
        traceFlags: (this.data.attributes['trace.sampled'] ? FLAG_SAMPLED : 0)
          .toString(16)
          .padStart(2, '0'),
      }),
    }
    if (this.traceState) out.tracestate = this.traceState
    return out
  }

  setAttribute(key: string, value: string | number | boolean): void {
    this.data.attributes[key] = value
  }

  /** Mark the span finished. Safe to call once; further calls are ignored. */
  end(status: 'ok' | 'error' = 'ok', error?: unknown): void {
    if (this.data.endTime !== undefined) return
    this.data.endTime = now()
    this.data.durationMs = this.data.endTime - this.data.startTime
    this.data.status = status
    if (error !== undefined) {
      const e = error instanceof Error ? error : new Error(String(error))
      this.data.error = { message: e.message, name: e.name }
    }
    this.exporter?.onSpanEnd?.(this.data)
  }
}

function now(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now()
  }
  return Date.now()
}

/**
 * Creates child spans for outbound RPC calls, propagating an inbound W3C trace
 * context when one is available and otherwise starting a fresh trace.
 */
export class Tracer {
  private readonly parent: TraceContext | null
  private readonly config: TracingConfig

  constructor(config: TracingConfig = {}) {
    this.config = config
    this.parent = resolveParentContext(config)
  }

  get enabled(): boolean {
    return this.config.enabled !== false
  }

  /** The resolved parent context, exposed for inspection / testing. */
  getParentContext(): TraceContext | null {
    return this.parent
  }

  /**
   * Start a child span. The returned {@link Span} carries the headers to attach
   * to the RPC request; the caller is responsible for calling `.end()`.
   */
  startSpan(
    name: string,
    attributes: Record<string, string | number | boolean> = {},
  ): Span {
    const traceId = this.parent?.traceId ?? randomHex(16)
    const spanId = randomHex(8)
    const sampled =
      this.parent != null
        ? (parseInt(this.parent.traceFlags, 16) & FLAG_SAMPLED) === FLAG_SAMPLED
        : this.config.sampled !== false

    const data: SpanData = {
      name,
      traceId,
      spanId,
      parentSpanId: this.parent?.spanId,
      startTime: now(),
      startEpochMs: Date.now(),
      status: 'unset',
      attributes: {
        ...(this.config.serviceName ? { 'service.name': this.config.serviceName } : {}),
        ...this.config.defaultAttributes,
        ...attributes,
        'trace.sampled': sampled,
      },
    }
    return new Span(data, this.parent?.traceState, this.config.exporter)
  }

  /**
   * Convenience wrapper: run `fn` inside a span, forwarding the propagation
   * headers to it and ending the span with the correct status automatically.
   */
  async withSpan<T>(
    name: string,
    fn: (headers: Record<string, string>, span: Span) => Promise<T>,
    attributes?: Record<string, string | number | boolean>,
  ): Promise<T> {
    const span = this.startSpan(name, attributes)
    try {
      const result = await fn(span.headers(), span)
      span.end('ok')
      return result
    } catch (err) {
      span.end('error', err)
      throw err
    }
  }
}

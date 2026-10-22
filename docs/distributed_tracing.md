# Distributed Tracing (W3C Trace Context)

Propagates `traceparent` / `tracestate` (W3C Trace Context) headers from an
incoming request through to every Soroban RPC call the SDK makes, so a restore
flow shows up as one connected trace across your service and the RPC node.

The SDK is vendor-neutral: it parses the inbound context, mints a child span per
RPC operation, attaches a fresh `traceparent` header to that request and reports
span timing through a `SpanExporter` hook. That hook is where you bridge to
OpenTelemetry, Datadog, Jaeger, Zipkin or anything else.

## Configuration

```ts
import { SorobanResurrect } from '@soroban-resurrect/sdk'

const sdk = new SorobanResurrect({
  rpcUrl: 'https://soroban-testnet.stellar.org',
  networkPassphrase: 'Test SDF Network ; September 2015',
  tracing: {
    enabled: true,
    // Pass the raw headers of the request you are handling …
    headers: req.headers,
    // … or an explicit parent context:
    // parent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
    serviceName: 'checkout-api',
    defaultAttributes: { 'deployment.environment': process.env.NODE_ENV ?? 'dev' },
    exporter: {
      onSpanStart: (s) => console.debug('span start', s.name, s.traceId),
      onSpanEnd: (s) => metrics.histogram('soroban_resurrect.rpc.duration', s.durationMs, {
        rpc_method: String(s.attributes['rpc.method']),
        status: s.status,
      }),
    },
  },
})
```

| Option | Purpose |
|--------|---------|
| `enabled` | Master switch. Omit `tracing` entirely, or set `false`, to disable header injection. |
| `parent` | Explicit parent — a raw `traceparent` string or a `TraceContext`. |
| `headers` | Raw inbound headers; `traceparent` / `tracestate` are extracted case-insensitively. |
| `serviceName` | Added to every span as `service.name`. |
| `defaultAttributes` | Static attributes merged into every span. |
| `exporter` | `{ onSpanStart?, onSpanEnd? }` lifecycle hook. |
| `sampled` | When there is no sampled parent, start new traces sampled (default `true`). |

When `parent` / `headers` yield no usable context, the SDK starts a **new** root
trace so RPC calls are always traceable.

## What gets traced

Every retried RPC operation is one span named `soroban.rpc <method>`, with
attributes:

- `rpc.system = "soroban"`
- `rpc.method` — e.g. `simulateTransaction`, `getLedgerEntries`, `sendTransaction`
- `server.address` — the active RPC endpoint
- `rpc.attempts` — attempt count when retries occurred
- `trace.sampled` — the effective sampling decision

Spans end with status `ok` or `error` (carrying `error.message` / `error.name`).

## Bridging to a backend

### OpenTelemetry

```ts
import { trace, context, SpanKind } from '@opentelemetry/api'

const tracer = trace.getTracer('soroban-resurrect')
const otelSpans = new Map<string, ReturnType<typeof tracer.startSpan>>()

const exporter = {
  onSpanStart: (s) => {
    const span = tracer.startSpan(s.name, { kind: SpanKind.CLIENT, attributes: s.attributes })
    otelSpans.set(s.spanId, span)
  },
  onSpanEnd: (s) => {
    const span = otelSpans.get(s.spanId)
    if (!span) return
    if (s.status === 'error') span.recordException(s.error?.message ?? 'error')
    span.end()
    otelSpans.delete(s.spanId)
  },
}
```

### Datadog / Jaeger / Zipkin

All three ingest W3C Trace Context. Point your tracer's propagator at
`tracecontext` (Datadog: `DD_TRACE_PROPAGATION_STYLE=tracecontext`) and the
`traceparent` header this SDK emits will stitch the RPC spans under your request
span automatically. Use `onSpanEnd` to also emit a span/metric from the SDK's
own timing if you want RPC latency without an APM agent on the RPC host.

## Low-level helpers

`parseTraceparent`, `formatTraceparent`, `resolveParentContext`, and the
`Tracer` / `Span` classes are exported for advanced use and testing.

/**
 * Prometheus-compatible metrics for the Soroban-Resurrect SDK.
 *
 * Design:
 * - Zero external dependencies: the metrics registry is self-contained.
 * - Opt-in: metrics are only collected when a `MetricsConfig` is passed to
 *   the SDK constructor.
 * - `collect()` returns a Prometheus text-format string that can be served on
 *   a `/metrics` HTTP endpoint.
 *
 * Exposed metrics:
 *   soroban_restore_total{status}          counter
 *   soroban_restore_duration_ms            histogram  (buckets: 50,100,250,500,1000,2500,5000)
 *   soroban_keys_restored_total            counter
 *   soroban_rpc_errors_total{type}         counter
 *
 * @example
 * ```ts
 * const resurrect = new SorobanResurrect({
 *   metrics: { prefix: 'myapp' },
 * });
 *
 * // Serve on an HTTP endpoint:
 * http.createServer((req, res) => {
 *   if (req.url === '/metrics') {
 *     res.setHeader('Content-Type', 'text/plain; version=0.0.4');
 *     res.end(resurrect.collectMetrics());
 *   }
 * }).listen(9090);
 * ```
 */

export interface MetricsConfig {
  /**
   * Optional prefix for all metric names. Defaults to `'soroban'`.
   * @example 'myapp' → metric names become `myapp_restore_total`, etc.
   */
  prefix?: string
  /**
   * Optional set of static labels added to every metric
   * (e.g. `{ app: 'my-dapp', env: 'production' }`).
   */
  defaultLabels?: Record<string, string>
}

interface CounterEntry {
  type: 'counter'
  help: string
  // key → numeric value; key is the serialised label set
  values: Map<string, number>
  // Reverse-map for serialisation: key → labels object
  _labelMap: Map<string, Record<string, string>>
}

interface HistogramEntry {
  type: 'histogram'
  help: string
  buckets: number[]
  counts: Map<string, number[]>   // label-key → per-bucket counts
  sums: Map<string, number>       // label-key → sum
  totals: Map<string, number>     // label-key → total observation count
  _labelMap: Map<string, Record<string, string>>
}

type MetricEntry = CounterEntry | HistogramEntry

/** Canonical label serialisation (sorted for determinism). */
function labelsToKey(labels: Record<string, string>): string {
  return Object.entries(labels)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}="${v}"`)
    .join(',')
}

/** Prometheus label set string, e.g. `{status="success"}`. */
function labelsToString(labels: Record<string, string>): string {
  const parts = Object.entries(labels)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}="${v}"`)
  return parts.length > 0 ? `{${parts.join(',')}}` : ''
}

/**
 * A lightweight, self-contained Prometheus metrics registry.
 *
 * Supports counters and histograms with optional label sets.
 * Call `collect()` to render all metrics as a Prometheus text-format string.
 */
export class MetricsRegistry {
  private readonly metrics = new Map<string, MetricEntry>()
  private readonly prefix: string
  private readonly defaultLabels: Record<string, string>

  constructor(config?: MetricsConfig) {
    this.prefix = config?.prefix ?? 'soroban'
    this.defaultLabels = config?.defaultLabels ?? {}
  }

  private name(base: string): string {
    return `${this.prefix}_${base}`
  }

  private mergeLabels(labels: Record<string, string>): Record<string, string> {
    return { ...this.defaultLabels, ...labels }
  }

  private ensureCounter(fullName: string, help: string): CounterEntry {
    if (!this.metrics.has(fullName)) {
      this.metrics.set(fullName, {
        type: 'counter',
        help,
        values: new Map(),
        _labelMap: new Map(),
      })
    }
    return this.metrics.get(fullName) as CounterEntry
  }

  private ensureHistogram(
    fullName: string,
    help: string,
    buckets: number[],
  ): HistogramEntry {
    if (!this.metrics.has(fullName)) {
      this.metrics.set(fullName, {
        type: 'histogram',
        help,
        buckets,
        counts: new Map(),
        sums: new Map(),
        totals: new Map(),
        _labelMap: new Map(),
      })
    }
    return this.metrics.get(fullName) as HistogramEntry
  }

  /**
   * Increment a counter metric by 1.
   */
  incrementCounter(
    metricName: string,
    labels: Record<string, string> = {},
    help = '',
  ): void {
    const fullName = this.name(metricName)
    const entry = this.ensureCounter(fullName, help)
    const merged = this.mergeLabels(labels)
    const key = labelsToKey(merged)
    entry.values.set(key, (entry.values.get(key) ?? 0) + 1)
    entry._labelMap.set(key, merged)
  }

  /**
   * Increment a counter metric by a specific `amount`.
   */
  addCounter(
    metricName: string,
    amount: number,
    labels: Record<string, string> = {},
    help = '',
  ): void {
    const fullName = this.name(metricName)
    const entry = this.ensureCounter(fullName, help)
    const merged = this.mergeLabels(labels)
    const key = labelsToKey(merged)
    entry.values.set(key, (entry.values.get(key) ?? 0) + amount)
    entry._labelMap.set(key, merged)
  }

  /**
   * Record a value in a histogram metric.
   *
   * Default buckets: `[50, 100, 250, 500, 1000, 2500, 5000]` (milliseconds).
   */
  observeHistogram(
    metricName: string,
    value: number,
    labels: Record<string, string> = {},
    help = '',
    buckets = [50, 100, 250, 500, 1000, 2500, 5000],
  ): void {
    const fullName = this.name(metricName)
    const entry = this.ensureHistogram(fullName, help, buckets)
    const merged = this.mergeLabels(labels)
    const key = labelsToKey(merged)

    if (!entry.counts.has(key)) {
      entry.counts.set(key, new Array(entry.buckets.length).fill(0))
    }

    const counts = entry.counts.get(key)!
    for (let i = 0; i < entry.buckets.length; i++) {
      if (value <= entry.buckets[i]) {
        counts[i]++
      }
    }
    entry.sums.set(key, (entry.sums.get(key) ?? 0) + value)
    entry.totals.set(key, (entry.totals.get(key) ?? 0) + 1)
    entry._labelMap.set(key, merged)
  }

  /**
   * Serialize all metrics to the Prometheus text exposition format.
   *
   * The output is suitable for serving on a `/metrics` HTTP endpoint with
   * `Content-Type: text/plain; version=0.0.4`.
   */
  collect(): string {
    const lines: string[] = []

    for (const [name, entry] of this.metrics) {
      lines.push(`# HELP ${name} ${entry.help}`)
      lines.push(`# TYPE ${name} ${entry.type}`)

      if (entry.type === 'counter') {
        for (const [key, value] of entry.values) {
          const labels = entry._labelMap.get(key) ?? {}
          lines.push(`${name}${labelsToString(labels)} ${value}`)
        }
      } else if (entry.type === 'histogram') {
        for (const [key] of entry.counts) {
          const labels = entry._labelMap.get(key) ?? {}
          const labelStr = labelsToString(labels)
          const counts = entry.counts.get(key)!
          const sum = entry.sums.get(key) ?? 0
          const total = entry.totals.get(key) ?? 0

          for (let i = 0; i < entry.buckets.length; i++) {
            const bucketLabels = { ...labels, le: String(entry.buckets[i]) }
            lines.push(`${name}_bucket${labelsToString(bucketLabels)} ${counts[i]}`)
          }
          // +Inf bucket equals total count
          lines.push(`${name}_bucket${labelsToString({ ...labels, le: '+Inf' })} ${total}`)
          lines.push(`${name}_sum${labelStr} ${sum}`)
          lines.push(`${name}_count${labelStr} ${total}`)
        }
      }
    }

    return lines.length > 0 ? lines.join('\n') + '\n' : ''
  }

  /** Reset all metrics — useful in tests. */
  reset(): void {
    this.metrics.clear()
  }
}

/**
 * Pre-configured metrics helper with all SDK metrics pre-declared.
 *
 * Use the high-level `record*` methods rather than the registry directly to
 * ensure consistent metric names across all SDK operations.
 */
export class SdkMetrics {
  /** The underlying registry — expose it so callers can serve `/metrics`. */
  readonly registry: MetricsRegistry

  constructor(config?: MetricsConfig) {
    this.registry = new MetricsRegistry(config)
  }

  /**
   * Increment `soroban_restore_total{status="success|failure"}`.
   *
   * # HELP soroban_restore_total Total number of restoration operations
   * # TYPE soroban_restore_total counter
   */
  recordRestore(status: 'success' | 'failure'): void {
    this.registry.incrementCounter(
      'restore_total',
      { status },
      'Total number of restoration operations',
    )
  }

  /**
   * Observe `soroban_restore_duration_ms` histogram.
   *
   * # HELP soroban_restore_duration_ms Restoration duration in ms
   * # TYPE soroban_restore_duration_ms histogram
   */
  recordRestoreDuration(durationMs: number): void {
    this.registry.observeHistogram(
      'restore_duration_ms',
      durationMs,
      {},
      'Restoration duration in ms',
    )
  }

  /**
   * Add to `soroban_keys_restored_total`.
   *
   * # HELP soroban_keys_restored_total Total number of ledger keys restored
   * # TYPE soroban_keys_restored_total counter
   */
  recordKeysRestored(count: number): void {
    this.registry.addCounter(
      'keys_restored_total',
      count,
      {},
      'Total number of ledger keys restored',
    )
  }

  /**
   * Increment `soroban_rpc_errors_total{type=...}`.
   *
   * # HELP soroban_rpc_errors_total RPC call errors by type
   * # TYPE soroban_rpc_errors_total counter
   */
  recordRpcError(type: 'timeout' | 'network' | 'simulation' | 'unknown'): void {
    this.registry.incrementCounter(
      'rpc_errors_total',
      { type },
      'RPC call errors by type',
    )
  }

  /**
   * Render all metrics as a Prometheus text-format string.
   */
  collect(): string {
    return this.registry.collect()
  }
}

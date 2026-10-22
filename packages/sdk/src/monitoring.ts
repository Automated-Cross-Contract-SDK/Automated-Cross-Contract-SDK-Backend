import { createHash } from 'node:crypto'
import { VERSION } from './version.js'

/**
 * Result of {@link SorobanResurrect.getHealth}, a self-diagnostic probe that
 * verifies the SDK can reach its RPC endpoint and is configured correctly.
 * Intended for monitoring endpoints and container readiness probes.
 */
export interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy'
  rpcConnected: boolean
  rpcLatencyMs: number
  networkPassphraseValid: boolean
  accountAccessible: boolean
  sdkVersion: string
  uptimeMs: number
  lastRestoreSuccess: boolean
  lastRestoreTimestamp?: number
}

/**
 * Opt-in, anonymized telemetry configuration. When enabled, the SDK POSTs a
 * small {@link TelemetryEvent} to `endpoint` after each restoration attempt.
 * No private keys, transaction content, user identities or IP addresses are
 * ever collected — contract IDs are one-way hashed before transmission.
 */
export interface TelemetryConfig {
  enabled: boolean
  endpoint: string
}

/** Anonymized payload sent to the configured telemetry endpoint. */
export interface TelemetryEvent {
  sdkVersion: string
  /** SHA-256 hashes of the contract IDs involved in the restoration. */
  contractIdHashes: string[]
  /** Total number of archived keys restored (or attempted). */
  keyCount: number
  /** Size of each restore batch that was built. */
  batchSizes: number[]
  outcome: 'success' | 'failure'
  sorobanRpcVersion?: string
  timestamp: number
}

/** One-way hash of a contract ID for privacy-preserving telemetry. */
export function hashContractId(contractId: string): string {
  return createHash('sha256').update(contractId).digest('hex')
}

type FetchFn = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string },
) => Promise<unknown>

function resolveFetch(): FetchFn | undefined {
  return (globalThis as { fetch?: FetchFn }).fetch
}

/**
 * Fire-and-forget reporter for {@link TelemetryConfig}. Reporting failures are
 * routed to `onError` and never propagate to the caller.
 */
export class TelemetryReporter {
  constructor(
    private readonly config: TelemetryConfig,
    private readonly onError: (message: string) => void,
  ) {}

  async report(event: Omit<TelemetryEvent, 'sdkVersion' | 'timestamp'>): Promise<void> {
    if (!this.config.enabled || !this.config.endpoint) return
    const fetchFn = resolveFetch()
    if (!fetchFn) {
      this.onError('Telemetry skipped: global fetch is not available in this runtime')
      return
    }
    const payload: TelemetryEvent = { ...event, sdkVersion: VERSION, timestamp: Date.now() }
    try {
      await fetchFn(this.config.endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
    } catch (err) {
      this.onError(`Telemetry report failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
}

/** A single alert emitted when a configured threshold is exceeded. */
export interface Alert {
  type: 'restoreFailureRate' | 'restoreLatency' | 'rpcErrorRate'
  message: string
  /** The observed value that tripped the threshold (percentage or milliseconds). */
  value: number
  threshold: number
  timestamp: number
}

/**
 * Configurable alerting thresholds with a callback hook. Wire `onAlert` into
 * PagerDuty, Slack, email, or a circuit breaker.
 */
export interface AlertingConfig {
  /** Alert if more than X% of restorations fail within the rolling window. */
  restoreFailureThreshold: number
  /** Alert if a single restore takes longer than X milliseconds. */
  restoreLatencyThresholdMs: number
  /** Alert if RPC errors exceed X% within the rolling window. */
  rpcErrorRateThreshold: number
  /** Invoked whenever a threshold is exceeded. */
  onAlert: (alert: Alert) => void
  /** Number of samples retained for rate calculations. Defaults to `20`. */
  windowSize?: number
}

/**
 * Tracks rolling windows of restore and RPC outcomes and invokes
 * {@link AlertingConfig.onAlert} when a threshold is exceeded.
 */
export class AlertManager {
  private readonly restoreOutcomes: boolean[] = []
  private readonly rpcOutcomes: boolean[] = []
  private readonly windowSize: number

  constructor(private readonly config: AlertingConfig) {
    this.windowSize = config.windowSize ?? 20
  }

  recordRestore(success: boolean, latencyMs: number): void {
    this.push(this.restoreOutcomes, success)

    if (latencyMs > this.config.restoreLatencyThresholdMs) {
      this.fire('restoreLatency', `Restore took ${Math.round(latencyMs)}ms`, latencyMs, this.config.restoreLatencyThresholdMs)
    }

    const failureRate = this.rate(this.restoreOutcomes, false)
    if (failureRate > this.config.restoreFailureThreshold) {
      this.fire(
        'restoreFailureRate',
        `Restore failure rate ${failureRate.toFixed(1)}% over last ${this.restoreOutcomes.length} attempts`,
        failureRate,
        this.config.restoreFailureThreshold,
      )
    }
  }

  recordRpcCall(success: boolean): void {
    this.push(this.rpcOutcomes, success)
    const errorRate = this.rate(this.rpcOutcomes, false)
    if (errorRate > this.config.rpcErrorRateThreshold) {
      this.fire(
        'rpcErrorRate',
        `RPC error rate ${errorRate.toFixed(1)}% over last ${this.rpcOutcomes.length} calls`,
        errorRate,
        this.config.rpcErrorRateThreshold,
      )
    }
  }

  private push(window: boolean[], value: boolean): void {
    window.push(value)
    if (window.length > this.windowSize) window.shift()
  }

  private rate(window: boolean[], match: boolean): number {
    if (window.length === 0) return 0
    return (window.filter(v => v === match).length / window.length) * 100
  }

  private fire(type: Alert['type'], message: string, value: number, threshold: number): void {
    try {
      this.config.onAlert({ type, message, value, threshold, timestamp: Date.now() })
    } catch {
      /* user-supplied callback errors must not break the SDK */
    }
  }
}

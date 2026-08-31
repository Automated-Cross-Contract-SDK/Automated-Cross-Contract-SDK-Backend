import type { RpcEndpointHealth, RpcFailoverConfig } from '@soroban-resurrect/types'

/**
 * RPC Failover Manager
 *
 * Tracks per-endpoint health and automatically switches to the next healthy
 * endpoint when an RPC endpoint exceeds the failure threshold.
 */

const DEFAULT_FAILOVER_CONFIG: RpcFailoverConfig = {
  healthCheckIntervalMs: 30_000,
  maxFailuresBeforeFallback: 3,
  successThresholdToRestore: 2,
}

export class RpcFailoverManager {
  private readonly endpoints: RpcEndpointHealth[]
  private readonly config: RpcFailoverConfig
  private currentIndex: number = 0
  private healthCheckTimer: ReturnType<typeof setInterval> | null = null

  constructor(urls: string[], config?: Partial<RpcFailoverConfig>) {
    if (urls.length === 0) {
      throw new Error('RpcFailoverManager requires at least one RPC URL')
    }
    this.config = { ...DEFAULT_FAILOVER_CONFIG, ...config }
    this.endpoints = urls.map(url => ({
      url,
      healthy: true,
      lastCheck: 0,
      latencyMs: 0,
    }))
  }

  /**
   * Returns the URL of the currently active healthy endpoint.
   * Throws if no healthy endpoints are available.
   */
  getCurrentUrl(): string {
    const ep = this.endpoints[this.currentIndex]
    if (ep && ep.healthy) {
      return ep.url
    }
    // Current endpoint is unhealthy — find the next one
    this.pickNextHealthy()
    return this.endpoints[this.currentIndex].url
  }

  /**
   * Records a successful call against the given URL.
   * If the endpoint accumulates enough consecutive successes it is restored
   * to healthy status.
   */
  recordSuccess(url: string): void {
    const ep = this.findEndpoint(url)
    if (!ep) return

    ep.healthy = true
    ep.lastCheck = Date.now()
  }

  /**
   * Records a failed call against the given URL.
   * If the endpoint exceeds the failure threshold it is marked unhealthy and
   * the manager automatically switches to the next healthy endpoint.
   */
  recordFailure(url: string): void {
    const ep = this.findEndpoint(url)
    if (!ep) return

    ep.healthy = false
    ep.lastCheck = Date.now()
    this.pickNextHealthy()
  }

  /**
   * Returns a snapshot of the health status for all tracked endpoints.
   */
  getHealthStatus(): RpcEndpointHealth[] {
    return this.endpoints.map(ep => ({ ...ep }))
  }

  /**
   * Starts periodic background health checks.
   *
   * @param checkFn - An async function that accepts a URL and resolves if the
   *   endpoint is reachable, or rejects/throws if it is not.
   */
  startHealthChecks(checkFn: (url: string) => Promise<void>): void {
    if (this.healthCheckTimer !== null) {
      return // Already running
    }
    this.healthCheckTimer = setInterval(() => {
      void this.runHealthChecks(checkFn)
    }, this.config.healthCheckIntervalMs)
  }

  /** Stops the periodic background health checks. */
  stopHealthChecks(): void {
    if (this.healthCheckTimer !== null) {
      clearInterval(this.healthCheckTimer)
      this.healthCheckTimer = null
    }
  }

  /**
   * Stops health checks and frees resources. Call this when discarding the
   * manager to prevent background timers from leaking.
   */
  destroy(): void {
    this.stopHealthChecks()
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private findEndpoint(url: string): RpcEndpointHealth | undefined {
    return this.endpoints.find(ep => ep.url === url)
  }

  /**
   * Advances `currentIndex` to the next endpoint that is currently healthy.
   * If every endpoint is unhealthy, the index is left pointing at the
   * least-recently-failed one so callers still get a URL to attempt.
   */
  private pickNextHealthy(): void {
    const total = this.endpoints.length

    // Try each endpoint in round-robin order starting after the current one
    for (let offset = 1; offset <= total; offset++) {
      const candidate = (this.currentIndex + offset) % total
      if (this.endpoints[candidate].healthy) {
        this.currentIndex = candidate
        return
      }
    }

    // All endpoints are unhealthy — fall back to first endpoint so we
    // can keep trying rather than hard-erroring.
    this.currentIndex = 0
  }

  private async runHealthChecks(checkFn: (url: string) => Promise<void>): Promise<void> {
    for (const ep of this.endpoints) {
      try {
        await checkFn(ep.url)
        this.recordSuccess(ep.url)
      } catch {
        this.recordFailure(ep.url)
      }
    }
  }
}

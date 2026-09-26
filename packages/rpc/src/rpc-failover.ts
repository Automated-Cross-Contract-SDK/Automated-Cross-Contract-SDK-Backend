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
  stickyDurationMs: 0, // Disabled by default for backwards compatibility
}

export class RpcFailoverManager {
  private readonly endpoints: RpcEndpointHealth[]
  private readonly config: RpcFailoverConfig
  private currentIndex: number = 0
  private healthCheckTimer: ReturnType<typeof setInterval> | null = null
  private stickyEndpointUrl: string | null = null
  private stickyEndpointSince: number | null = null

  constructor(urls: string[], config?: Partial<RpcFailoverConfig>) {
    if (urls.length === 0) {
      throw new Error('RpcFailoverManager requires at least one RPC URL')
    }
    this.config = { ...DEFAULT_FAILOVER_CONFIG, ...config }
    this.endpoints = urls.map(url => ({
      url,
      isHealthy: true,
      consecutiveFailures: 0,
      consecutiveSuccesses: 0,
      lastChecked: null,
    }))
  }

  /**
   * Returns the URL of the currently active healthy endpoint.
   * Throws if no healthy endpoints are available.
   *
   * If stickiness is enabled, prefers the last-known-healthy endpoint within
   * the sticky window. Still fails over immediately if the sticky endpoint
   * becomes unhealthy.
   */
  getCurrentUrl(): string {
    // Check if stickiness is enabled and we have a sticky endpoint
    if (this.config.stickyDurationMs && this.config.stickyDurationMs > 0 && this.stickyEndpointUrl && this.stickyEndpointSince) {
      const stickyElapsed = Date.now() - this.stickyEndpointSince
      const stillSticky = stickyElapsed < this.config.stickyDurationMs

      // If still within sticky window, find the sticky endpoint
      if (stillSticky) {
        const stickyEp = this.endpoints.find(ep => ep.url === this.stickyEndpointUrl)
        // Return sticky endpoint only if it's still healthy
        if (stickyEp && stickyEp.isHealthy) {
          return this.stickyEndpointUrl
        }
        // Sticky endpoint is unhealthy — fall through to pick a new one
      }
      // Sticky window expired — clear sticky state and pick a new endpoint
      this.stickyEndpointUrl = null
      this.stickyEndpointSince = null
    }

    // No stickiness or sticky endpoint is unavailable — use normal selection
    const ep = this.endpoints[this.currentIndex]
    if (ep && ep.isHealthy) {
      // Mark this as the new sticky endpoint if stickiness is enabled
      if (this.config.stickyDurationMs && this.config.stickyDurationMs > 0) {
        this.stickyEndpointUrl = ep.url
        this.stickyEndpointSince = Date.now()
      }
      return ep.url
    }
    // Current endpoint is unhealthy — find the next one
    this.pickNextHealthy()
    const nextEp = this.endpoints[this.currentIndex]
    // Mark the new endpoint as sticky if stickiness is enabled
    if (nextEp && this.config.stickyDurationMs && this.config.stickyDurationMs > 0) {
      this.stickyEndpointUrl = nextEp.url
      this.stickyEndpointSince = Date.now()
    }
    return nextEp.url
  }

  /**
   * Records a successful call against the given URL.
   * If the endpoint accumulates enough consecutive successes it is restored
   * to healthy status.
   */
  recordSuccess(url: string): void {
    const ep = this.findEndpoint(url)
    if (!ep) return

    ep.consecutiveFailures = 0
    ep.consecutiveSuccesses += 1
    ep.lastChecked = Date.now()

    if (!ep.isHealthy && ep.consecutiveSuccesses >= this.config.successThresholdToRestore) {
      ep.isHealthy = true
    }
  }

  /**
   * Records a failed call against the given URL.
   * If the endpoint exceeds the failure threshold it is marked unhealthy and
   * the manager automatically switches to the next healthy endpoint.
   */
  recordFailure(url: string): void {
    const ep = this.findEndpoint(url)
    if (!ep) return

    ep.consecutiveSuccesses = 0
    ep.consecutiveFailures += 1
    ep.lastChecked = Date.now()

    if (ep.consecutiveFailures >= this.config.maxFailuresBeforeFallback) {
      ep.isHealthy = false
      this.pickNextHealthy()
    }
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
   * least-recently-failed one (lowest `consecutiveFailures`) so callers still
   * get a URL to attempt.
   */
  private pickNextHealthy(): void {
    const total = this.endpoints.length

    // Try each endpoint in round-robin order starting after the current one
    for (let offset = 1; offset <= total; offset++) {
      const candidate = (this.currentIndex + offset) % total
      if (this.endpoints[candidate].isHealthy) {
        this.currentIndex = candidate
        return
      }
    }

    // All endpoints are unhealthy — fall back to least-failed endpoint so we
    // can keep trying rather than hard-erroring.
    let leastFailed = 0
    for (let i = 1; i < total; i++) {
      if (this.endpoints[i].consecutiveFailures < this.endpoints[leastFailed].consecutiveFailures) {
        leastFailed = i
      }
    }
    this.currentIndex = leastFailed
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

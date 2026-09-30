/**
 * Wallet Manager
 *
 * Coordinates a set of SorobanWalletAdapter instances: detects which are
 * available in the current environment, orders them by a caller-supplied
 * priority, tracks the active connection, and re-broadcasts each adapter's
 * connection-status / network-change events through a single API.
 */

import type {
  SorobanWalletAdapter,
  WalletConnectionResult,
  WalletConnectionStatus,
  ConnectionStatusListener,
  NetworkChangeListener,
} from './types.js'
import { WalletAdapterError } from './types.js'

export interface WalletManagerConfig {
  adapters: SorobanWalletAdapter[]
  /** Preferred connect order by adapter id. Adapters not listed keep their relative order after the listed ones. */
  priority?: string[]
}

/** Default time to wait for an adapter's connect() to settle before rejecting with CONNECTION_TIMEOUT. */
export const DEFAULT_CONNECT_TIMEOUT_MS = 120_000

export interface ConnectOptions {
  /** Milliseconds to wait for the adapter to settle before rejecting with CONNECTION_TIMEOUT. Defaults to 120000. */
  timeoutMs?: number
}

/** Sorts adapters by a priority list of ids; unlisted adapters keep their relative order, placed after listed ones. */
function orderByPriority(adapters: SorobanWalletAdapter[], priority?: string[]): SorobanWalletAdapter[] {
  if (!priority || priority.length === 0) return adapters
  const rank = new Map(priority.map((id, index) => [id, index]))
  return [...adapters].sort((a, b) => {
    const rankA = rank.has(a.id) ? rank.get(a.id)! : priority.length
    const rankB = rank.has(b.id) ? rank.get(b.id)! : priority.length
    return rankA - rankB
  })
}

export class WalletManager {
  readonly adapters: SorobanWalletAdapter[]

  private active: SorobanWalletAdapter | null = null
  private statusListeners = new Set<ConnectionStatusListener>()
  private networkListeners = new Set<NetworkChangeListener>()
  private activeUnsubscribes: Array<() => void> = []

  constructor(config: WalletManagerConfig) {
    this.adapters = orderByPriority(config.adapters, config.priority)
  }

  get activeAdapter(): SorobanWalletAdapter | null {
    return this.active
  }

  /** Returns the registered adapters whose runtime is currently detectable, in priority order. */
  async detectAvailable(): Promise<SorobanWalletAdapter[]> {
    const flags = await Promise.all(this.adapters.map((adapter) => adapter.isAvailable()))
    return this.adapters.filter((_, index) => flags[index])
  }

  async connect(id: string, options: ConnectOptions = {}): Promise<WalletConnectionResult> {
    const adapter = this.adapters.find((candidate) => candidate.id === id)
    if (!adapter) throw new WalletAdapterError(`No wallet adapter registered with id "${id}"`, 'NOT_INSTALLED')

    const timeoutMs = options.timeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS

    this.detachFromActive()
    this.emitStatus('connecting')
    try {
      const result = await this.withTimeout(adapter, timeoutMs)
      this.active = adapter
      this.attachToActive(adapter)
      this.emitStatus('connected', result)
      return result
    } catch (cause) {
      this.emitStatus('error')
      throw cause
    }
  }

  /**
   * Awaits the adapter's connect() but rejects with a typed CONNECTION_TIMEOUT
   * error if it does not settle within `timeoutMs`. On timeout the adapter is
   * asked to clean up (close iframes/popups) via its optional disconnect().
   */
  private withTimeout(adapter: SorobanWalletAdapter, timeoutMs: number): Promise<WalletConnectionResult> {
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return adapter.connect()

    return new Promise<WalletConnectionResult>((resolve, reject) => {
      let settled = false
      const timer = setTimeout(() => {
        if (settled) return
        settled = true
        // Best-effort cleanup of adapter resources (iframes/popups).
        Promise.resolve()
          .then(() => adapter.disconnect())
          .catch(() => undefined)
        reject(
          new WalletAdapterError(
            `Wallet adapter "${adapter.id}" did not settle within ${timeoutMs}ms`,
            'CONNECTION_TIMEOUT',
          ),
        )
      }, timeoutMs)

      adapter.connect().then(
        (result) => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          resolve(result)
        },
        (cause) => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          reject(cause)
        },
      )
    })
  }

  async disconnect(): Promise<void> {
    if (!this.active) return
    await this.active.disconnect()
    this.detachFromActive()
    this.active = null
    this.emitStatus('disconnected')
  }

  onConnectionChange(listener: ConnectionStatusListener): () => void {
    this.statusListeners.add(listener)
    return () => this.statusListeners.delete(listener)
  }

  onNetworkChange(listener: NetworkChangeListener): () => void {
    this.networkListeners.add(listener)
    return () => this.networkListeners.delete(listener)
  }

  private attachToActive(adapter: SorobanWalletAdapter): void {
    if (adapter.onConnectionChange) {
      this.activeUnsubscribes.push(adapter.onConnectionChange((status, result) => this.emitStatus(status, result)))
    }
    if (adapter.onNetworkChange) {
      this.activeUnsubscribes.push(adapter.onNetworkChange((change) => this.networkListeners.forEach((listener) => listener(change))))
    }
  }

  private detachFromActive(): void {
    this.activeUnsubscribes.forEach((unsubscribe) => unsubscribe())
    this.activeUnsubscribes = []
  }

  private emitStatus(status: WalletConnectionStatus, result?: WalletConnectionResult): void {
    this.statusListeners.forEach((listener) => listener(status, result))
  }
}

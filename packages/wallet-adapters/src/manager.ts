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

  async connect(id: string): Promise<WalletConnectionResult> {
    const adapter = this.adapters.find((candidate) => candidate.id === id)
    if (!adapter) throw new WalletAdapterError(`No wallet adapter registered with id "${id}"`, 'NOT_INSTALLED')

    this.detachFromActive()
    this.emitStatus('connecting')
    try {
      const result = await adapter.connect()
      this.active = adapter
      this.attachToActive(adapter)
      this.emitStatus('connected', result)
      return result
    } catch (cause) {
      this.emitStatus('error')
      throw cause
    }
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

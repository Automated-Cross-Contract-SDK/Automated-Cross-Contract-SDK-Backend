/**
 * Wallet Manager
 *
 * Coordinates a set of SorobanWalletAdapter instances: detects which are
 * available in the current environment, orders them deterministically, tracks
 * the active connection, and re-broadcasts each adapter's connection-status /
 * network-change events through a single API.
 *
 * Ordering contract (see issue #441):
 *   1. An app-level override list (`priority`) pins explicit wallet ids first,
 *      in the exact order given.
 *   2. Everything else is ordered by each adapter's declared `priority`
 *      (lower first), falling back to `DEFAULT_ADAPTER_PRIORITY`.
 *   3. Ties are broken by registration order — which is also the order the
 *      `isAvailable()` probes fire in — so the result is stable across runs.
 */

import type {
  SorobanWalletAdapter,
  WalletCapabilities,
  WalletConnectionResult,
  WalletConnectionStatus,
  WalletDescriptor,
  ConnectionStatusListener,
  NetworkChangeListener,
} from './types.js'
import { WalletAdapterError, DEFAULT_ADAPTER_PRIORITY, DEFAULT_WALLET_CAPABILITIES } from './types.js'

/**
 * Base rank applied to adapters that are *not* in the app-level override list.
 * Keeping this far above any override rank guarantees that listed wallets are
 * always offered before unlisted ones, whatever their intrinsic priority is.
 */
const OVERRIDE_UNLISTED_BASE = 1_000_000

export interface WalletManagerConfig {
  adapters: SorobanWalletAdapter[]
  /**
   * Preferred connect order by adapter id. Listed adapters are ordered exactly
   * as given and always come before unlisted ones; unlisted adapters keep
   * their relative order by (declared priority, registration order).
   */
  priority?: string[]
}

/** Ranks a single adapter for sorting: override position wins, then declared priority. */
function rankAdapter(
  adapter: SorobanWalletAdapter,
  overrideRanks: Map<string, number>,
  hasOverride: boolean,
): number {
  const overrideRank = overrideRanks.get(adapter.id)
  if (overrideRank !== undefined) return overrideRank
  const declared = adapter.priority ?? DEFAULT_ADAPTER_PRIORITY
  return hasOverride ? OVERRIDE_UNLISTED_BASE + declared : declared
}

/**
 * Sorts adapters deterministically: app-level override list first, then each
 * adapter's declared priority, with registration order as the stable tiebreak.
 */
function orderByPriority(adapters: SorobanWalletAdapter[], priority?: string[]): SorobanWalletAdapter[] {
  const overrideRanks = new Map<string, number>()
  for (const id of priority ?? []) {
    if (!overrideRanks.has(id)) overrideRanks.set(id, overrideRanks.size)
  }
  const hasOverride = overrideRanks.size > 0

  return adapters
    .map((adapter, index) => ({ adapter, index }))
    .sort((a, b) => {
      const rankA = rankAdapter(a.adapter, overrideRanks, hasOverride)
      const rankB = rankAdapter(b.adapter, overrideRanks, hasOverride)
      if (rankA !== rankB) return rankA - rankB
      return a.index - b.index
    })
    .map((entry) => entry.adapter)
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

  /** Returns the registered adapters whose runtime is currently detectable, in deterministic order. */
  async detectAvailable(): Promise<SorobanWalletAdapter[]> {
    const flags = await Promise.all(this.adapters.map((adapter) => adapter.isAvailable()))
    return this.adapters.filter((_, index) => flags[index])
  }

  /**
   * Static descriptors for every registered adapter, in deterministic order.
   * Availability is not probed, so this is safe to call synchronously for
   * rendering a stable wallet list.
   */
  getWalletDescriptors(): WalletDescriptor[] {
    return this.adapters.map((adapter) => this.describe(adapter))
  }

  /**
   * Probes every registered adapter and returns descriptors for the ones
   * available in the current environment, in deterministic order. Availability
   * checks fire concurrently in registration order, so priority ties resolve
   * the same way on every run.
   */
  async getAvailableWallets(): Promise<WalletDescriptor[]> {
    const flags = await Promise.all(this.adapters.map((adapter) => adapter.isAvailable()))
    return this.adapters.filter((_, index) => flags[index]).map((adapter) => this.describe(adapter))
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

  /** Merges an adapter's declared metadata with the documented defaults. */
  private describe(adapter: SorobanWalletAdapter): WalletDescriptor {
    const capabilities: WalletCapabilities = {
      ...DEFAULT_WALLET_CAPABILITIES,
      ...adapter.capabilities,
    }
    return {
      id: adapter.id,
      name: adapter.name,
      icon: adapter.icon,
      priority: adapter.priority ?? DEFAULT_ADAPTER_PRIORITY,
      capabilities,
    }
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

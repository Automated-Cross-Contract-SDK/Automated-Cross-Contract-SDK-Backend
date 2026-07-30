/**
 * Freighter Wallet Adapter
 *
 * Deep integration with the Freighter browser extension: reacts to account
 * and network changes emitted by `window.freighter`, handles disconnection
 * gracefully, and persists the connection across page reloads.
 *
 * https://docs.freighter.app
 */

import type {
  SorobanWalletAdapter,
  SignTransactionOptions,
  WalletConnectionResult,
  WalletConnectionStatus,
  ConnectionStatusListener,
  NetworkChangeListener,
} from '../types.js'
import { WalletAdapterError, mapCommonWalletError } from '../types.js'

const STORAGE_KEY = 'soroban-resurrect:freighter:connected'

interface FreighterApi {
  requestAccess?(): Promise<unknown>
  isAllowed?(): Promise<boolean>
  getAddress(): Promise<{ address: string }>
  getNetworkDetails(): Promise<{ networkPassphrase: string; networkUrl?: string }>
  signTransaction(xdr: string, opts?: { networkPassphrase?: string; address?: string }): Promise<{ signedTxXdr: string }>
  on?(event: 'accountChange' | 'networkChange' | 'disconnect', handler: (payload?: unknown) => void): void
  off?(event: 'accountChange' | 'networkChange' | 'disconnect', handler: (payload?: unknown) => void): void
}

function getFreighter(): FreighterApi | undefined {
  return typeof window !== 'undefined' ? (window as unknown as { freighterApi?: FreighterApi }).freighterApi : undefined
}

function readStorage(key: string): string | null {
  return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null
}

function writeStorage(key: string, value: string | null): void {
  if (typeof localStorage === 'undefined') return
  if (value === null) localStorage.removeItem(key)
  else localStorage.setItem(key, value)
}

export class FreighterAdapter implements SorobanWalletAdapter {
  readonly id = 'freighter'
  readonly name = 'Freighter'

  private address: string | null = null
  private connectionListeners = new Set<ConnectionStatusListener>()
  private networkListeners = new Set<NetworkChangeListener>()
  private detachHandlers: Array<() => void> = []

  async isAvailable(): Promise<boolean> {
    return !!getFreighter()
  }

  async connect(): Promise<WalletConnectionResult> {
    const api = getFreighter()
    if (!api) throw new WalletAdapterError('Freighter extension not found', 'NOT_INSTALLED')
    this.emitStatus('connecting')
    try {
      await api.requestAccess?.()
      const { address } = await api.getAddress()
      const network = await this.safeGetNetwork(api)
      this.address = address
      writeStorage(STORAGE_KEY, '1')
      this.attachListeners(api)
      const result = { address, network }
      this.emitStatus('connected', result)
      return result
    } catch (cause) {
      this.emitStatus('error')
      throw mapCommonWalletError(this.name, cause)
    }
  }

  async disconnect(): Promise<void> {
    this.address = null
    writeStorage(STORAGE_KEY, null)
    this.detachListeners()
    this.emitStatus('disconnected')
  }

  async signTransaction(xdr: string, opts?: SignTransactionOptions): Promise<string> {
    const api = getFreighter()
    if (!api) throw new WalletAdapterError('Freighter extension not found', 'NOT_INSTALLED')
    try {
      const { signedTxXdr } = await api.signTransaction(xdr, {
        networkPassphrase: opts?.networkPassphrase,
        address: opts?.accountToSign ?? this.address ?? undefined,
      })
      return signedTxXdr
    } catch (cause) {
      throw mapCommonWalletError(this.name, cause)
    }
  }

  onConnectionChange(listener: ConnectionStatusListener): () => void {
    this.connectionListeners.add(listener)
    return () => this.connectionListeners.delete(listener)
  }

  onNetworkChange(listener: NetworkChangeListener): () => void {
    this.networkListeners.add(listener)
    return () => this.networkListeners.delete(listener)
  }

  /** Re-establishes the connection on page load if a prior session was persisted and Freighter still allows access. */
  async restoreSession(): Promise<WalletConnectionResult | null> {
    if (readStorage(STORAGE_KEY) !== '1') return null
    const api = getFreighter()
    if (!api) return null
    try {
      const allowed = await api.isAllowed?.()
      if (allowed === false) {
        writeStorage(STORAGE_KEY, null)
        return null
      }
      return await this.connect()
    } catch {
      writeStorage(STORAGE_KEY, null)
      return null
    }
  }

  private attachListeners(api: FreighterApi): void {
    if (typeof api.on !== 'function') return

    const onAccountChange = async () => {
      try {
        const { address } = await api.getAddress()
        if (!address) {
          await this.disconnect()
          return
        }
        this.address = address
        this.emitStatus('connected', { address })
      } catch {
        this.emitStatus('error')
      }
    }

    const onNetworkChange = async () => {
      const network = await this.safeGetNetwork(api)
      this.networkListeners.forEach((listener) => listener({ networkPassphrase: network }))
    }

    const onDisconnect = () => {
      this.disconnect().catch(() => undefined)
    }

    api.on('accountChange', onAccountChange)
    api.on('networkChange', onNetworkChange)
    api.on('disconnect', onDisconnect)
    this.detachHandlers.push(
      () => api.off?.('accountChange', onAccountChange),
      () => api.off?.('networkChange', onNetworkChange),
      () => api.off?.('disconnect', onDisconnect),
    )
  }

  private detachListeners(): void {
    this.detachHandlers.forEach((detach) => detach())
    this.detachHandlers = []
  }

  private async safeGetNetwork(api: FreighterApi): Promise<string | undefined> {
    try {
      const details = await api.getNetworkDetails()
      return details.networkPassphrase
    } catch {
      return undefined
    }
  }

  private emitStatus(status: WalletConnectionStatus, result?: WalletConnectionResult): void {
    this.connectionListeners.forEach((listener) => listener(status, result))
  }
}

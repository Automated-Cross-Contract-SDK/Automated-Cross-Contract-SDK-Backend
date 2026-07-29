import type { ReactNode } from 'react'

/**
 * Adapter contract that any wallet integration (Freighter, xBull, Albedo, …)
 * must implement to plug into the wallet registry.
 */
export interface WalletAdapter {
  id: string
  name: string
  icon?: string
  isAvailable(): boolean | Promise<boolean>
  connect(): Promise<{ publicKey: string }>
  disconnect(): Promise<void>
  signTransaction(txXDR: string, opts?: { networkPassphrase?: string }): Promise<string>
}

export interface WalletDescriptor {
  id: string
  name: string
  icon?: string
  isAvailable: boolean
}

export interface StoredWalletSession {
  walletId: string
  publicKey: string
  connectedAt: number
}

export interface WalletProviderProps {
  /** All wallet adapters this dApp supports. */
  wallets: WalletAdapter[]
  /** Auto-disconnect after this many ms of an established session. */
  sessionTimeoutMs?: number
  /** localStorage key used to persist the active session. Defaults to a namespaced key. */
  storageKey?: string
  /** Attempt to restore a persisted session on mount. Defaults to `true`. */
  autoReconnect?: boolean
  children: ReactNode
}

export interface WalletContextValue {
  wallets: WalletAdapter[]
  activeWallet: WalletAdapter | null
  publicKey: string | null
  isConnecting: boolean
  error: string | null
  /** Connect to a specific wallet by id. */
  connect(walletId: string): Promise<void>
  /** Try each wallet id in order, stopping at the first successful connection. */
  connectWithFallback(walletIds: string[]): Promise<void>
  disconnect(): Promise<void>
  /** Disconnect the active wallet (if any) and connect to a different one. */
  switchWallet(walletId: string): Promise<void>
}

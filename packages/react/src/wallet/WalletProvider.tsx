'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { WalletContext } from './WalletContext.js'
import { saveWalletSession, loadWalletSession, clearWalletSession, DEFAULT_STORAGE_KEY } from './storage.js'
import type { WalletContextValue, WalletProviderProps } from './types.js'

export function WalletProvider({
  wallets,
  sessionTimeoutMs,
  storageKey = DEFAULT_STORAGE_KEY,
  autoReconnect = true,
  children,
}: WalletProviderProps) {
  const [activeWalletId, setActiveWalletId] = useState<string | null>(null)
  const [publicKey, setPublicKey] = useState<string | null>(null)
  const [connectedAt, setConnectedAt] = useState<number | null>(null)
  const [isConnecting, setIsConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const reconnectAttempted = useRef(false)

  const walletsById = useMemo(() => new Map(wallets.map((w) => [w.id, w] as const)), [wallets])

  const connect = useCallback(async (walletId: string) => {
    const wallet = walletsById.get(walletId)
    if (!wallet) {
      const message = `Unknown wallet: ${walletId}`
      setError(message)
      throw new Error(message)
    }

    setIsConnecting(true)
    setError(null)
    try {
      const available = await wallet.isAvailable()
      if (!available) {
        throw new Error(`Wallet "${wallet.name}" is not available`)
      }
      const { publicKey: key } = await wallet.connect()
      const now = Date.now()
      setActiveWalletId(wallet.id)
      setPublicKey(key)
      setConnectedAt(now)
      saveWalletSession({ walletId: wallet.id, publicKey: key, connectedAt: now }, storageKey)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
      throw err
    } finally {
      setIsConnecting(false)
    }
  }, [walletsById, storageKey])

  const connectWithFallback = useCallback(async (walletIds: string[]) => {
    let lastError: unknown = new Error('No wallets provided in fallback chain')
    for (const walletId of walletIds) {
      try {
        await connect(walletId)
        return
      } catch (err) {
        lastError = err
      }
    }
    const message = lastError instanceof Error ? lastError.message : String(lastError)
    setError(message)
    throw lastError instanceof Error ? lastError : new Error(message)
  }, [connect])

  const disconnect = useCallback(async () => {
    const wallet = activeWalletId ? walletsById.get(activeWalletId) : null
    try {
      await wallet?.disconnect()
    } finally {
      setActiveWalletId(null)
      setPublicKey(null)
      setConnectedAt(null)
      clearWalletSession(storageKey)
    }
  }, [activeWalletId, walletsById, storageKey])

  const switchWallet = useCallback(async (walletId: string) => {
    const current = activeWalletId ? walletsById.get(activeWalletId) : null
    if (current) {
      await current.disconnect().catch(() => {})
    }
    await connect(walletId)
  }, [activeWalletId, walletsById, connect])

  // Restore a persisted session on mount, if the wallet extension is still available.
  useEffect(() => {
    if (!autoReconnect || reconnectAttempted.current) return
    reconnectAttempted.current = true

    const session = loadWalletSession(storageKey, sessionTimeoutMs)
    if (!session) return

    const wallet = walletsById.get(session.walletId)
    if (!wallet) {
      clearWalletSession(storageKey)
      return
    }

    void (async () => {
      try {
        const available = await wallet.isAvailable()
        if (!available) {
          clearWalletSession(storageKey)
          return
        }
        const { publicKey: key } = await wallet.connect()
        setActiveWalletId(wallet.id)
        setPublicKey(key)
        setConnectedAt(session.connectedAt)
        saveWalletSession({ walletId: wallet.id, publicKey: key, connectedAt: session.connectedAt }, storageKey)
      } catch {
        clearWalletSession(storageKey)
      }
    })()
  }, [autoReconnect, storageKey, sessionTimeoutMs, walletsById])

  // Auto-disconnect once the session exceeds sessionTimeoutMs.
  useEffect(() => {
    if (!sessionTimeoutMs || connectedAt == null) return
    const remaining = sessionTimeoutMs - (Date.now() - connectedAt)
    const timer = setTimeout(() => {
      void disconnect()
    }, Math.max(remaining, 0))
    return () => clearTimeout(timer)
  }, [sessionTimeoutMs, connectedAt, disconnect])

  const activeWallet = activeWalletId ? walletsById.get(activeWalletId) ?? null : null

  const value = useMemo<WalletContextValue>(() => ({
    wallets,
    activeWallet,
    publicKey,
    isConnecting,
    error,
    connect,
    connectWithFallback,
    disconnect,
    switchWallet,
  }), [wallets, activeWallet, publicKey, isConnecting, error, connect, connectWithFallback, disconnect, switchWallet])

  return (
    <WalletContext.Provider value={value}>
      {children}
    </WalletContext.Provider>
  )
}

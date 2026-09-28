'use client'

import { useContext, useEffect } from 'react'
import { WalletContext } from './WalletContext.js'
import { DEFAULT_STORAGE_KEY, loadWalletSession } from './storage.js'
import type { WalletAdapter } from './types.js'

export interface UseActiveWalletReturn {
  wallet: WalletAdapter | null
  publicKey: string | null
  isConnecting: boolean
  error: string | null
  connect: (walletId: string) => Promise<void>
  connectWithFallback: (walletIds: string[]) => Promise<void>
  disconnect: () => Promise<void>
  switchWallet: (walletId: string) => Promise<void>
}

/** Returns the currently active wallet plus connection controls. */
export function useActiveWallet(): UseActiveWalletReturn {
  const ctx = useContext(WalletContext)
  if (!ctx) throw new Error('useActiveWallet must be used within a WalletProvider')

  const { syncFromStorage } = ctx

  // Keep the active wallet in sync across tabs: when another tab writes the
  // persisted session, re-read it and update this tab's state.
  useEffect(() => {
    if (typeof window === 'undefined') return

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== null && event.key !== DEFAULT_STORAGE_KEY) return
      syncFromStorage(loadWalletSession())
    }

    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [syncFromStorage])

  return {
    wallet: ctx.activeWallet,
    publicKey: ctx.publicKey,
    isConnecting: ctx.isConnecting,
    error: ctx.error,
    connect: ctx.connect,
    connectWithFallback: ctx.connectWithFallback,
    disconnect: ctx.disconnect,
    switchWallet: ctx.switchWallet,
  }
}

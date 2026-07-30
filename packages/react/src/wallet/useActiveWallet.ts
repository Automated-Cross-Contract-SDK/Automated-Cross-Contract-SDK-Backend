'use client'

import { useContext } from 'react'
import { WalletContext } from './WalletContext.js'
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

'use client'

import { useContext, useEffect, useState } from 'react'
import { WalletContext } from './WalletContext.js'
import type { WalletDescriptor } from './types.js'

/**
 * Returns every registered wallet adapter along with its live availability
 * (e.g. whether the browser extension is installed).
 */
export function useWallets(): WalletDescriptor[] {
  const ctx = useContext(WalletContext)
  if (!ctx) throw new Error('useWallets must be used within a WalletProvider')

  const [availability, setAvailability] = useState<Record<string, boolean>>({})

  useEffect(() => {
    let cancelled = false
    void Promise.all(
      ctx.wallets.map(async (wallet) => [wallet.id, await wallet.isAvailable()] as const),
    ).then((entries) => {
      if (!cancelled) setAvailability(Object.fromEntries(entries))
    })
    return () => {
      cancelled = true
    }
  }, [ctx.wallets])

  return ctx.wallets.map((wallet) => ({
    id: wallet.id,
    name: wallet.name,
    icon: wallet.icon,
    isAvailable: availability[wallet.id] ?? false,
  }))
}

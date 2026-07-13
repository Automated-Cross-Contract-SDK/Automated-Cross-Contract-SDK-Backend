'use client'

import { type ReactNode, useMemo } from 'react'
import { SorobanResurrectContext } from './SorobanResurrectContext.js'
import { useSorobanResurrect } from './useSorobanResurrect.js'
import type { UseSorobanResurrectOptions } from './types.js'

export interface SorobanResurrectProviderProps extends UseSorobanResurrectOptions {
  children: ReactNode
}

export function SorobanResurrectProvider({
  children,
  ...options
}: SorobanResurrectProviderProps) {
  const resurrect = useSorobanResurrect(options)

  const config = useMemo(
    () => ({
      rpcUrl: options.rpcUrl,
      networkPassphrase: options.networkPassphrase,
    }),
    [options.rpcUrl, options.networkPassphrase],
  )

  const value = useMemo(
    () => ({ resurrect, config }),
    [resurrect, config],
  )

  return (
    <SorobanResurrectContext.Provider value={value}>
      {children}
    </SorobanResurrectContext.Provider>
  )
}

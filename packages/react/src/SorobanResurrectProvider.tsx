'use client'

import { type ReactNode, useMemo } from 'react'
import { SorobanResurrectContext } from './SorobanResurrectContext.js'
import { useSorobanResurrect } from './useSorobanResurrect.js'
import type { UseSorobanResurrectOptions, SigningStrategy } from './types.js'

export interface SorobanResurrectProviderProps<TSigner extends SigningStrategy = SigningStrategy>
  extends UseSorobanResurrectOptions<TSigner> {
  children: ReactNode
}

export function SorobanResurrectProvider<TSigner extends SigningStrategy = SigningStrategy>({
  children,
  ...options
}: SorobanResurrectProviderProps<TSigner>) {
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

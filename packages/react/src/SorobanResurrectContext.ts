'use client'

import { createContext, useContext } from 'react'
import type { SorobanResurrectContextValue } from './types.js'

export const SorobanResurrectContext = createContext<SorobanResurrectContextValue>({
  resurrect: null,
  config: null,
})

export function useSorobanResurrectContext(): SorobanResurrectContextValue {
  const ctx = useContext(SorobanResurrectContext)
  if (!ctx.resurrect && !ctx.config) {
    throw new Error(
      'useSorobanResurrectContext must be used within a <SorobanResurrectProvider>',
    )
  }
  return ctx
}

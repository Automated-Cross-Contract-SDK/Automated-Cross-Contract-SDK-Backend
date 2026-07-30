import { createContext } from 'react'
import type { WalletContextValue } from './types.js'

export const WalletContext = createContext<WalletContextValue | null>(null)

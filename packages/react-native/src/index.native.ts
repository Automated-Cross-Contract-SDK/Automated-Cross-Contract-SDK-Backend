// Platform-specific entry point (Metro/react-native resolves `.native.ts`
// before falling back to `.ts`). Re-exports the shared React hooks/provider
// — none of `@soroban-resurrect/react`'s own code touches `window` or the
// DOM directly, so it works unmodified under Hermes once the crypto
// polyfill below has been installed.
export {
  useSorobanResurrect,
  SorobanResurrectProvider,
  SorobanResurrectContext,
  useSorobanResurrectContext,
} from '@soroban-resurrect/react'
export type {
  UseSorobanResurrectOptions,
  UseSorobanResurrectReturn,
  SorobanResurrectContextValue,
  SorobanResurrectProviderProps,
} from '@soroban-resurrect/react'

export { installCryptoPolyfill } from './crypto.js'
export type { RandomValuesProvider } from './crypto.js'

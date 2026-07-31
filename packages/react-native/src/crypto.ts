/**
 * `@stellar/stellar-sdk` (and libsodium underneath it) relies on
 * `crypto.getRandomValues`, which only exists on `window` in browsers.
 * React Native / Hermes has neither `window` nor `crypto` by default, so we
 * install a global shim backed by whichever native crypto module is
 * available in the host app.
 */
export interface RandomValuesProvider {
  getRandomValues: <T extends ArrayBufferView>(array: T) => T
}

/**
 * Installs `global.crypto.getRandomValues` (and `window.crypto` if `window`
 * exists, e.g. under some polyfilled RN test environments) using the given
 * provider. Call this once, before any Soroban SDK code runs — typically at
 * the top of the app's entry file (`index.js` / `App.tsx`).
 */
export function installCryptoPolyfill(provider: RandomValuesProvider): void {
  const g = globalThis as typeof globalThis & { crypto?: RandomValuesProvider; window?: { crypto?: RandomValuesProvider } }

  if (!g.crypto) {
    g.crypto = provider
  } else if (!g.crypto.getRandomValues) {
    g.crypto.getRandomValues = provider.getRandomValues
  }

  if (g.window && !g.window.crypto) {
    g.window.crypto = g.crypto
  }
}

/**
 * Lazily resolves a `RandomValuesProvider` from `react-native-quick-crypto`.
 * Prefer this on bare React Native (Hermes) apps — it's backed by a native
 * JSI module and works without any additional native crypto polyfill.
 *
 * Usage:
 * ```ts
 * import { installCryptoPolyfill, quickCryptoProvider } from '@soroban-resurrect/react-native/crypto/quick-crypto'
 * installCryptoPolyfill(quickCryptoProvider())
 * ```
 */
export function quickCryptoProvider(): RandomValuesProvider {
  // Imported lazily/dynamically by consumers so this package has no hard
  // dependency on `react-native-quick-crypto` being installed.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { QuickCrypto } = require('react-native-quick-crypto')
  return {
    getRandomValues: <T extends ArrayBufferView>(array: T) => QuickCrypto.getRandomValues(array),
  }
}

/**
 * Lazily resolves a `RandomValuesProvider` from `expo-crypto`. Prefer this on
 * Expo-managed apps (`getRandomValues` polyfill ships as
 * `expo-crypto`'s `getRandomValues` export as of SDK 50+).
 *
 * Usage:
 * ```ts
 * import { installCryptoPolyfill, expoCryptoProvider } from '@soroban-resurrect/react-native/crypto/expo-crypto'
 * installCryptoPolyfill(expoCryptoProvider())
 * ```
 */
export function expoCryptoProvider(): RandomValuesProvider {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const ExpoCrypto = require('expo-crypto')
  return {
    getRandomValues: <T extends ArrayBufferView>(array: T) => ExpoCrypto.getRandomValues(array),
  }
}

# @soroban-resurrect/react-native

React Native bindings for `@soroban-resurrect/react`, adapted for Hermes and
apps without a `window`/DOM global.

## Setup

1. Install one native crypto provider (pick one):
   - Bare RN: `react-native-quick-crypto`
   - Expo managed: `expo-crypto`
2. Install the polyfill at the very top of your app entry point, before any
   other Soroban SDK import:

```ts
// index.js (bare RN)
import { installCryptoPolyfill } from '@soroban-resurrect/react-native/crypto/quick-crypto'
installCryptoPolyfill()

// App.tsx (Expo)
import { installCryptoPolyfill } from '@soroban-resurrect/react-native/crypto/expo-crypto'
installCryptoPolyfill()
```

3. Import hooks/provider as usual from `@soroban-resurrect/react-native`
   (Metro resolves the `.native.ts` entry point automatically):

```ts
import { SorobanResurrectProvider, useSorobanResurrect } from '@soroban-resurrect/react-native'
```

## DOM APIs replaced for React Native

| Web/DOM API                     | React Native replacement                                   |
|----------------------------------|-------------------------------------------------------------|
| `window.crypto.getRandomValues`  | `react-native-quick-crypto` or `expo-crypto` (see `crypto.ts`) |
| `fetch` (RPC calls)              | RN's built-in `fetch` — no change needed                    |
| `localStorage` (if caching)      | not used by `@soroban-resurrect/sdk`; bring your own (e.g. `@react-native-async-storage/async-storage`) if you persist `SimulationCache` externally |

## Hermes compatibility

- No `eval`, `Function` constructor, or other Hermes-unsupported patterns are
  used in this package.
- `BigInt` (used by `@stellar/stellar-sdk` XDR codecs) requires Hermes with
  BigInt support, enabled by default since RN 0.70+.
- `crypto.ts`'s `require(...)` calls are intentionally lazy/dynamic so
  bundling doesn't fail when only one of the two crypto providers is
  installed.

## Manual test checklist (iOS simulator / Android emulator)

- [ ] `installCryptoPolyfill` runs without throwing on app boot
- [ ] `useSorobanResurrect().checkTransaction` completes against a testnet RPC
- [ ] Signing + `executeWithRestore` round-trip succeeds on-device
- [ ] No Hermes bytecode compile warnings/errors in Metro logs

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

## Choosing a crypto provider

| Criterion | `react-native-quick-crypto` | `expo-crypto` |
|---|---|---|
| **Use when** | Bare React Native (custom native build) | Expo-managed workflow (SDK 44+) |
| **Expo Go** | ❌ needs custom dev client | ✅ supported |
| **EAS Build** | ✅ with pod install / gradle | ✅ out of the box |
| **SHA-256 digest** | ✅ full SubtleCrypto | ✅ expo-crypto ≥ 11.0.0 |
| **Hermes** | ✅ RN ≥ 0.70 | ✅ RN ≥ 0.70 |

Choose based on your build setup. Run the benchmark on a real device if you
need to compare actual numbers for your target hardware.

## Benchmark

`scripts/benchmark-crypto.cjs` is a small micro-benchmark that measures
`getRandomValues(32 bytes)` — the exact operation that `crypto.ts` wraps for
the Soroban SDK. It is written in plain CommonJS so it runs in both
**Hermes / React Native** and **Node.js** without any Node.js-only built-ins.

### Running the benchmark

**In Node.js / CI (no RN providers — for harness verification only):**

```bash
node packages/react-native/scripts/benchmark-crypto.cjs
# or from inside the package:
cd packages/react-native && npm run benchmark
```

Output when neither provider is installed (expected in CI):

```
=== crypto provider benchmark: getRandomValues ===
operation : getRandomValues(32 bytes)
iterations: 500 (+ 1 warm-up, discarded)
timer     : Date.now() (~1 ms granularity)

No providers available.
react-native-quick-crypto and expo-crypto require a native
React Native build. This environment (Node.js / CI) cannot
run either provider. Run the benchmark on a device.

--- provider selection ---
...
```

> **Important:** Neither provider is available in Node.js / CI. The above
> output confirms the harness works but produces **no comparison numbers**.
> Only on-device results are meaningful.

**On a React Native device or simulator (bare workflow):**

```js
// In a dev screen or debug menu:
const { runBenchmark } = require('./scripts/benchmark-crypto.cjs')
runBenchmark()
// Check the Metro / Hermes console for results
```

**On a React Native device or simulator (Expo managed):**

```js
const { runBenchmark } = require('../../packages/react-native/scripts/benchmark-crypto.cjs')
runBenchmark()
```

### What the benchmark measures

| Operation | Payload | Why |
|---|---|---|
| `getRandomValues` | 32 bytes | The operation `crypto.ts` wraps; called by the Soroban SDK to seed libsodium |

500 iterations with one warm-up call (discarded). Timer: `Date.now()` (~1 ms
granularity) — available in both Hermes and Node.js.

### Interpreting results

- Results vary by device, OS, and build configuration.
- Run multiple times and compare means; do not rely on a single run.
- No performance winner is declared here — run the benchmark on your target
  hardware and decide based on those numbers.

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

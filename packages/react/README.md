# @soroban-resurrect/react

React hooks and context provider for `@soroban-resurrect/sdk`.

## Install

```bash
npm install @soroban-resurrect/react @soroban-resurrect/sdk
```

## Usage

```tsx
import { SorobanResurrectProvider, useSorobanResurrect } from '@soroban-resurrect/react'

function App() {
  return (
    <SorobanResurrectProvider
      rpcUrl="https://soroban-testnet.stellar.org"
      networkPassphrase="Test SDF Network ; September 2015"
    >
      <WithdrawButton />
    </SorobanResurrectProvider>
  )
}
```

## Simulation cache keys and degraded hashing

`useSorobanResurrect` caches simulation results keyed by a hash of the transaction XDR.

- **Preferred path:** when `crypto.subtle` is available (secure contexts / modern WebViews), keys use a SHA-256 digest of the XDR.
- **Degraded fallback:** when `crypto.subtle` is unavailable (non-HTTPS contexts, older WebViews), the hook falls back to a non-cryptographic 32-bit hash. This path is weaker and can theoretically collide across transactions, so the fallback key also includes the raw XDR length and a prefix slice to reduce the collision blast radius. A one-time warning is logged to the console when this degraded mode is first used.

If you require strong cache-key guarantees, serve your app over HTTPS (or another secure context) so the SHA-256 path is used.

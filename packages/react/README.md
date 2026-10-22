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

## Reconfiguring the provider

`SorobanResurrectProvider` builds a client from its configuration props
(`rpcUrl`, `networkPassphrase`, and any other client options). When those props
change, the provider **reconfigures** rather than retaining the previous client:

- A new client is created for the new configuration and becomes the active
  client for all consumers.
- The previous client is disposed/released so it is not kept alive or reused.
- Consumers re-render against the new client; in-flight work tied to the old
  client is cancelled.

### Supported behavior and edge cases

- **Rapid prop changes:** only the latest configuration is active. Intermediate
  clients created during a burst of prop changes are disposed, so no stale
  clients accumulate.
- **Unmount during reconfiguration:** if the provider unmounts while a
  reconfiguration is in progress, the pending client is disposed and no work is
  scheduled against it.
- **Invalid or partial configuration:** if the new configuration is invalid or
  incomplete, the provider does not silently keep the stale client. The error
  surfaces to consumers (via the provider's error boundary/state) and the
  previous client is released.

### Compatibility

Reconfiguration is an additive behavior; the provider's public props and the
`useSorobanResurrect` hook signature are unchanged. Existing apps that pass a
static configuration are unaffected.

## Simulation cache keys and degraded hashing

`useSorobanResurrect` caches simulation results keyed by a hash of the transaction XDR.

- **Preferred path:** when `crypto.subtle` is available (secure contexts / modern WebViews), keys use a SHA-256 digest of the XDR.
- **Degraded fallback:** when `crypto.subtle` is unavailable (non-HTTPS contexts, older WebViews), the hook falls back to a non-cryptographic 32-bit hash. This path is weaker and can theoretically collide across transactions, so the fallback key also includes the raw XDR length and a prefix slice to reduce the collision blast radius. A one-time warning is logged to the console when this degraded mode is first used.

If you require strong cache-key guarantees, serve your app over HTTPS (or another secure context) so the SHA-256 path is used.

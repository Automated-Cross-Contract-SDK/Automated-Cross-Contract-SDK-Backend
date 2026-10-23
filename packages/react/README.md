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

## Cancelling hook operations on unmount

`useSorobanResurrect` starts asynchronous work (simulation, submission, and
polling for transaction status). When the component that owns the hook
unmounts, that work is **cancelled** rather than left running:

- Each hook instance owns an `AbortController`. Its signal is threaded into the
  SDK calls the hook starts.
- On unmount, the controller is aborted, so pending requests are cancelled and
  any polling loop stops.
- State updates are suppressed after unmount, so a late resolution cannot call
  `setState` on an unmounted component (no "state update on unmounted
  component" warnings).

### Supported behavior and edge cases

- **Abort during a pending request:** the in-flight request is aborted and its
  result is discarded; no state is written.
- **Abort before the first resolution:** if the component unmounts before the
  initial request resolves, the result is ignored and no state is written.
- **Cleanup idempotency:** cleanup is safe to run more than once; aborting an
  already-aborted controller is a no-op.
- **Already-settled operations:** if the operation has already completed before
  unmount, aborting has no effect and the settled result is unaffected.

### Compatibility

Unmount cancellation is an additive behavior; the hook's public signature and
return shape are unchanged. Existing call sites need no changes. If you pass
`AbortSignal`-aware options to the underlying SDK, the hook's signal is combined
with yours so both can cancel the operation.

## Simulation cache keys and degraded hashing

`useSorobanResurrect` caches simulation results keyed by a hash of the transaction XDR.

- **Preferred path:** when `crypto.subtle` is available (secure contexts / modern WebViews), keys use a SHA-256 digest of the XDR.
- **Degraded fallback:** when `crypto.subtle` is unavailable (non-HTTPS contexts, older WebViews), the hook falls back to a non-cryptographic 32-bit hash. This path is weaker and can theoretically collide across transactions, so the fallback key also includes the raw XDR length and a prefix slice to reduce the collision blast radius. A one-time warning is logged to the console when this degraded mode is first used.

If you require strong cache-key guarantees, serve your app over HTTPS (or another secure context) so the SHA-256 path is used.

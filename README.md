# Soroban-Resurrect

Automated Cross-Contract State Restoration SDK & Wallet Middleware for Soroban.

Detects archived ledger entries (TTL expired) across cross-contract calls and seamlessly restores them before executing the user's original transaction.

## Problem

Soroban archives "Persistent" data once its TTL rent expires. If a front-end or nested cross-contract call fails to predict an archived key, the transaction crashes. This SDK automates detection and restoration.

## Packages

The monorepo ships a modular set of packages. `@soroban-resurrect/sdk` is now a compatibility façade over the modular packages — new code should depend on the focused packages directly, and existing code can migrate via `@soroban-resurrect/compat`.

### Core

| Package | Description | Status |
|---------|-------------|--------|
| `@soroban-resurrect/sdk` | Compatibility façade — intercepts simulations, detects archived keys, builds restore transactions | Stable |
| `@soroban-resurrect/core` | Framework-agnostic restoration engine (detection + restore transaction building) | Stable |
| `@soroban-resurrect/types` | Shared TypeScript types for the restoration pipeline | Stable |
| `@soroban-resurrect/errors` | Typed error classes and error codes | Stable |
| `@soroban-resurrect/rpc` | Soroban RPC client wrapper used across packages | Stable |
| `@soroban-resurrect/utils` | Shared helpers (XDR, encoding, TTL math) | Stable |
| `@soroban-resurrect/footprint-parser` | Parses transaction footprints to find archived ledger keys | Stable |
| `@soroban-resurrect/footprint-parser-wasm` | WASM-accelerated footprint parser | Experimental |
| `@soroban-resurrect/compat` | Migration shim for projects moving off the monolithic SDK | Stable |
| `@soroban-resurrect/wallet-adapters` | Adapters for common Stellar wallets | Experimental |

### Framework bindings

| Package | Description | Status |
|---------|-------------|--------|
| `@soroban-resurrect/react` | React hooks & context provider for dApp integration | Stable |
| `@soroban-resurrect/next` | Next.js integration (client/server helpers) | Stable |
| `@soroban-resurrect/react-native` | React Native bindings | Experimental |
| `@soroban-resurrect/angular` | Angular service & module bindings | Experimental |
| `@soroban-resurrect/vue` | Vue composables & plugin | Experimental |
| `@soroban-resurrect/svelte` | Svelte stores & helpers | Experimental |

### Tooling

| Package | Description | Status |
|---------|-------------|--------|
| `@soroban-resurrect/mock-rpc` | Lightweight mock RPC server — deterministic unit testing, fixture recording/replay, network simulation | Stable |
| `@soroban-resurrect/cli` | Command-line tooling for restoration workflows | Experimental |
| `@soroban-resurrect/devtools-extension` | Browser DevTools extension for inspecting restoration activity | Experimental |
| `@soroban-resurrect/vscode-extension` | VS Code extension for Soroban-Resurrect projects | Experimental |
| `@soroban-resurrect/example` | Example dApp demonstrating end-to-end restoration | Experimental |

[![CI](https://github.com/Automated-Cross-Contract-SDK/Automated-Cross-Contract-SDK-Backend/actions/workflows/ci.yml/badge.svg)](https://github.com/Automated-Cross-Contract-SDK/Automated-Cross-Contract-SDK-Backend/actions/workflows/ci.yml)
[![Integration Tests](https://github.com/Automated-Cross-Contract-SDK/Automated-Cross-Contract-SDK-Backend/actions/workflows/ci.yml/badge.svg?event=schedule)](https://github.com/Automated-Cross-Contract-SDK/Automated-Cross-Contract-SDK-Backend/actions/workflows/ci.yml)

## Quick Start (React)

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

function WithdrawButton() {
  const { executeWithRestore, isExecuting, needsRestore, error } =
    useSorobanResurrect({ rpcUrl, networkPassphrase })

  const handleSubmit = async () => {
    const result = await executeWithRestore(txXDR, wallet.signTransaction)
    if (result.success) {
      console.log(`Restored ${result.entriesRestored} entries`)
    }
  }

  return <button onClick={handleSubmit} disabled={isExecuting}>
    {isExecuting ? 'Restoring & Submitting...' : 'Submit'}
  </button>
}
```

## SDK Usage (Node/Any Framework)

```ts
import { SorobanResurrect } from '@soroban-resurrect/sdk'

const client = new SorobanResurrect({
  rpcUrl: 'https://soroban-testnet.stellar.org',
  networkPassphrase: 'Test SDF Network ; September 2015',
})

// Pre-flight check
const { needsRestoration, restoreTransactionXDR } =
  await client.checkAndPrepare(txXDR, sourceAccount)

if (needsRestoration) {
  // Wallet signs the restore tx, then restore + original execute in sequence
  const result = await client.executeRestoreThenOriginal(
    restoreTransactionXDR,
    txXDR,
    signTransaction,
  )
}
```

## Migrating from the monolithic SDK

`@soroban-resurrect/sdk` remains available as a compatibility façade, but new projects should depend on the focused packages (`core`, `rpc`, `footprint-parser`, framework bindings). Existing projects can adopt the modular packages incrementally via `@soroban-resurrect/compat`, which re-exports the legacy surface while delegating to the modular implementation.

```ts
// Legacy import — still works, now backed by the modular packages
import { SorobanResurrect } from '@soroban-resurrect/compat'
```

## Architecture

```
User Action → dApp → SorobanResurrect SDK
                         │
                    simulateTransaction ──► detect archived keys
                         │
                   ┌─────┴─────┐
                   │           │
              No keys     Keys archived
              archived        │
                   │    buildRestoreFootprintOp
                   │           │
            execute original   │
              transaction  execute restore tx
                              │
                         execute original tx
```

## Governance & proposals

- [`GOVERNANCE.md`](./GOVERNANCE.md) — maintainer roles, decision-making, RFC
  process, contribution ladder, release rotation.
- [`docs/proposals/native-ttl-refresh-on-cross-contract-access.md`](./docs/proposals/native-ttl-refresh-on-cross-contract-access.md)
  — draft protocol proposal to make Soroban refresh TTL natively on
  cross-contract entry access, removing the need for the SDK-level workaround.

## Development

```bash
npm install
npm run build       # Build all packages
npm run test        # Run SDK tests
npm run example     # Start example app
```

## Developer notes

- Node: `>=18` is required (see `packages/*/package.json` engines).
- To run the full test matrix including integration tests (if available):

```bash
npm ci
npm run test --workspaces
npm run test -w packages/sdk --if-present # integration tests via vitest config
```

- Dependencies: run `npm audit` and `npm audit fix` regularly. Dependabot is enabled (weekly) to keep deps up-to-date.

- CI: ensure CI uses Node 18+ and consider adding `npm audit` to the CI pipeline or a scheduled job.

## Handsoff notes

<!-- handsoff-issue-438 -->
- #438: [react] Progress events not wired: IDLE_PROGRESS exists but restore:batch:complete is never mapped to setProgress

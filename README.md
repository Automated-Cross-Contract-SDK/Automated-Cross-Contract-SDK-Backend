# Soroban-Resurrect

Automated Cross-Contract State Restoration SDK & Wallet Middleware for Soroban.

Detects archived ledger entries (TTL expired) across cross-contract calls and seamlessly restores them before executing the user's original transaction.

## Problem

Soroban archives "Persistent" data once its TTL rent expires. If a front-end or nested cross-contract call fails to predict an archived key, the transaction crashes. This SDK automates detection and restoration.

## Packages

| Package | Description |
|---------|-------------|
| `@soroban-resurrect/sdk` | Core SDK — intercepts simulations, detects archived keys, builds restore transactions |
| `@soroban-resurrect/react` | React hooks & context provider for dApp integration |

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

## Development

```bash
npm install
npm run build       # Build all packages
npm run test        # Run SDK tests
npm run example     # Start example app
```

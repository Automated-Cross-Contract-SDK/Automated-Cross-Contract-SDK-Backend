# @soroban-resurrect/sdk

Core SDK for automated Soroban state restoration.

## Install

```bash
npm install @soroban-resurrect/sdk
```

## Usage

```typescript
import { SorobanResurrect } from '@soroban-resurrect/sdk'

const client = new SorobanResurrect({
  rpcUrl: 'https://soroban-testnet.stellar.org',
  networkPassphrase: 'Test SDF Network ; September 2015',
})

const { needsRestoration, restoreTransactionXDR } =
  await client.checkAndPrepare(txXDR, sourceAccount)
```

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

### Bounded history

`useSorobanResurrect({ maxHistorySize })` caps the in-memory and persisted transaction history (default `100`, oldest dropped first). Pass `Infinity` to keep every record.

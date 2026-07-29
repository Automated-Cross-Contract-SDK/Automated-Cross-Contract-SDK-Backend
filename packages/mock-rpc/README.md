# @soroban-resurrect/mock-rpc

Lightweight deterministic mock RPC server for Soroban unit testing.

## Features

- **Pre-record and replay** RPC responses from fixtures
- **Simulate network conditions** — timeout, error, slow response
- **Simulate ledger state** with configurable TTL expiry
- **Deterministic sequence numbers** — fully predictable account sequences
- **Fast** — zero network calls, designed for CI

## Install

```bash
npm install @soroban-resurrect/mock-rpc
```

## Quick Start

```typescript
import { MockRpcServer } from '@soroban-resurrect/mock-rpc'

const mock = new MockRpcServer({
  networkPassphrase: 'Test SDF Network ; September 2015',
})

// Get a mock server that SorobanResurrect can use
const server = mock.getServer()

// All RPC methods work with zero network calls
const health = await server.getHealth()
const network = await server.getNetwork()
```

## Simulating Network Conditions

```typescript
// Global condition for all methods
mock.setNetworkCondition('timeout')  // throws on every call
mock.setNetworkCondition('error')    // throws with error message
mock.setNetworkCondition('slow')     // adds artificial delay
mock.setNetworkCondition('healthy')  // normal operation

// Per-method overrides
mock.setMethodCondition('simulateTransaction', {
  condition: 'error',
  errorMessage: 'Custom simulation failure',
})
```

## Simulating Ledger State & TTL Expiry

```typescript
// Add ledger entries with TTL metadata
mock.ledgerState.addEntry({
  key: someLedgerKey,
  keyBase64: '...',
  data: 'xdr-encoded-entry',
  lastLiveLedgerSeq: 100,
  ttl: 4095360, // ~30 days
  entryType: 'contractData',
  contractId: 'CA...',
})

// Advance the ledger to expire entries
mock.ledgerState.setCurrentLedgerSeq(10_000_000)

// Or archive specific entries all at once
mock.ledgerState.archiveAll()

// Check archived entries
const archived = mock.ledgerState.getArchivedCount()
```

## Deterministic Sequence Numbers

```typescript
mock.sequenceManager.setSequence('GABC...', '123')
const seq = mock.sequenceManager.getAndIncrement('GABC...')
// seq === '123', next will be '124'
```

## Fixture Recording & Replay

```typescript
// Record mode
mock.startRecording()
const server = mock.getServer()
await server.getHealth()
await server.getNetwork()
const interactions = mock.stopRecording()

// Save to file
mock.saveFixture('./fixtures/test.json', 'my-fixture')

// Replay mode
mock.loadFixtureFromFile('./fixtures/test.json')
// All subsequent calls return pre-recorded responses
```

## Method Overrides

```typescript
mock.setMethodOverride('getHealth', () => ({
  status: 'custom',
  extraField: true,
}))
```

## Statistics

```typescript
const stats = mock.getStats()
// {
//   totalCalls: 5,
//   callsByMethod: { getHealth: 2, getNetwork: 3 },
//   timeouts: 0,
//   errors: 0,
//   slowResponses: 0,
//   totalDelayMs: 0,
// }
```

## License

MIT

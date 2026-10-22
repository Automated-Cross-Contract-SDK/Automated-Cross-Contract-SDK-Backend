# Multi-Batch and Concurrent Restoration

This guide is for dApp developers who restore archived state. It covers when the SDK
uses one transaction, sequential batches, or concurrent batches; what each restore
transaction costs; and how to recover when a batch fails.

## Result types at a glance

| Mode | Entry point | Result type | Failure fields |
|------|-------------|-------------|----------------|
| Sequential multi-batch | `executeRestoreThenOriginalBatches` | `RestoreAllBatchesResult` | `failedAtBatchIndex` |
| Concurrent multi-batch | `executeRestoreThenOriginalBatchesConcurrent` | `ConcurrentRestoreResult` | `failedBatchCount`, `failedBatchIndices`, `concurrencyUsed` |

Both are wrapped in `ExecutionResult`, which exposes `batchResults` (sequential) or
`concurrentBatchResults` (concurrent), plus `failedBatchIndex` and
`partialEntriesRestored` when a restore stops partway.

## Decision tree

```
Archived keys found?
├── No  → submit the original transaction
└── Yes → how many keys?
          ├── ≤ maxRestoreBatchSize (default 50) and within maxRestoreFeeStroops
          │     → 1 restore transaction, then the original transaction
          └── More than one batch
                ├── Batches are independent and you want lower latency
                │     → executeRestoreThenOriginalBatchesConcurrent
                │       (up to maxConcurrency batches in flight)
                └── Otherwise
                      → executeRestoreThenOriginalBatches (one batch at a time)
```

### Configuration knobs

- **`maxRestoreBatchSize`** (default `50`): maximum keys per restore transaction.
- **`maxRestoreFeeStroops`** (optional, needs `dynamicFeeEstimation`): fee budget per
  batch. Batching stops adding keys once the estimated fee would exceed it.
- **`maxConcurrency`**: in-flight batch limit for concurrent mode. Override per call
  with `options.concurrency`.

A batch boundary is set by whichever limit is hit first.

## Fee math

Each batch is a separate transaction, so each carries its own base fee and resource
fee. For a batch of `n` keys:

```
batchFee ≈ estimateRestoreFee(n)
totalFee  = Σ batchFee over all batches
```

`estimateRestoreFee(batchSize)` returns the estimate for one batch. Splitting 300 keys
into six batches of 50 pays six base fees. Use `maxRestoreFeeStroops` to cap
per-batch spend.

## Example: sequential restore

```typescript
import { SorobanResurrect } from '@soroban-resurrect/sdk'

const client = new SorobanResurrect({
  rpcUrl: 'https://soroban-testnet.stellar.org',
  networkPassphrase: 'Test SDF Network ; September 2015',
  maxRestoreBatchSize: 50,
})

const result = await client.executeRestoreThenOriginalBatches(
  restoreBatches,
  originalXDR,
  signTransaction,
)

if (!result.success) {
  console.log(result.failedBatchIndex)           // first failing batch (0-based)
  console.log(result.partialEntriesRestored)     // keys restored before the failure
  console.log(result.batchResults?.failedAtBatchIndex)
}
```

## Example: concurrent restore

```typescript
const result = await client.executeRestoreThenOriginalBatchesConcurrent(
  archivedKeys,
  originalXDR,
  sourceAccountID,
  signTransaction,
  { requireAllBatches: true, concurrency: 4 },
)

const concurrent = result.concurrentBatchResults
if (concurrent && !concurrent.success) {
  console.log(concurrent.failedBatchCount)
  console.log(concurrent.failedBatchIndices)
  console.log(concurrent.concurrencyUsed)
}
```

## Failure semantics

| Option | Behavior |
|--------|----------|
| `requireAllBatches: true` (default) | The original transaction is not submitted if any batch fails. |
| `requireAllBatches: false` | The original transaction is submitted anyway. It may still fail if the unrestored keys are needed. |

In sequential mode, batches after `failedAtBatchIndex` are never submitted. In
concurrent mode, batches already in flight may succeed even when others fail, which
is why `failedBatchIndices` lists exactly which ones to retry.

### Resuming after a partial failure

When a restore fails partway, the SDK stores the unfinished work:

```typescript
const state = client.getFailedKeys()   // FailedRestoreState | null

if (state) {
  const retried = await client.retryFailedRestore(state, signTransaction)
  if (!retried.success) {
    // Inspect retried.partialEntriesRestored and try again later.
  }
}
```

`FailedRestoreState` contains `failedBatches` (the exact `RestoreBatchResult` objects
to resubmit), `failedKeys` (flattened, for logging and UX), `failedBatchIndex`, and
`partialEntriesRestored`.

## Sequence diagram

```mermaid
sequenceDiagram
    participant App as dApp
    participant SDK as SorobanResurrect
    participant RPC as Soroban RPC
    App->>SDK: executeRestoreThenOriginalBatches(batches, originalXDR)
    loop each batch (or up to maxConcurrency in parallel)
        SDK->>App: signTransaction(restore batch XDR)
        App-->>SDK: signed XDR
        SDK->>RPC: sendTransaction(restore batch)
        RPC-->>SDK: result
    end
    alt all batches succeeded
        SDK->>App: signTransaction(originalXDR)
        SDK->>RPC: sendTransaction(original)
        RPC-->>SDK: result
        SDK-->>App: ExecutionResult { success: true }
    else a batch failed
        SDK-->>App: ExecutionResult { success: false, failedBatchIndex, partialEntriesRestored }
        App->>SDK: retryFailedRestore(getFailedKeys(), signTransaction)
    end
```

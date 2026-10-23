# Restore Batching Configuration

## Overview

The Soroban Resurrect SDK batches archived ledger keys for efficient restoration. Batching is controlled by configurable size limits that can be based on key count, transaction XDR size, or restore fee budget.

## Batching Constraints

Restore batches are split when **any** of the following limits is exceeded:

| Constraint | Config Field | Type | Purpose |
|-----------|--------------|------|---------|
| Entry count | `maxRestoreBatchSize` | number | Maximum number of keys per batch |
| XDR size | (internal) | bytes | Transaction XDR size limit (100 KB) |
| Fee budget | `maxRestoreFeeStroops` | string | Maximum restore fee per batch in stroops |

The actual batch boundary is determined by whichever limit is hit **first** — no single constraint takes precedence over others.

## Configuration

### maxRestoreBatchSize (default: 50)

Maximum number of ledger keys to include in a single restore batch.

```typescript
const client = new SorobanResurrect({
  rpcUrl: '...',
  networkPassphrase: '...',
  maxRestoreBatchSize: 100  // Larger batches (max 100 keys per batch)
})
```

**Behavior**: A batch stops accepting new keys when it reaches this count, even if XDR size and fee budget would allow more.

### maxRestoreFeeStroops (optional, requires dynamicFeeEstimation)

Maximum fee budget in stroops for a single restore batch. When set, batching stops adding entries once the estimated restore fee would exceed this budget.

```typescript
const client = new SorobanResurrect({
  rpcUrl: '...',
  networkPassphrase: '...',
  restoreFee: '100000',           // Base/fallback fee
  dynamicFeeEstimation: true,     // Required for accurate fee tracking
  maxRestoreFeeStroops: '1000000' // Max 1M stroops per batch
})
```

**Behavior**: A batch stops accepting new keys when adding another key would push the estimated fee over the budget, even if entry count (`maxRestoreBatchSize`) has not been reached.

**Requirements**:
- `dynamicFeeEstimation` should be enabled for accurate fee estimation
- Fee estimation uses the existing `estimateRestoreFee` path (simulates a minimal restore transaction)
- A 10% buffer is added to simulated fees to account for ledger-state variance

**When omitted**: Batching uses only `maxRestoreBatchSize` and XDR size constraints (original behavior).

## Usage Examples

### Example 1: Default Behavior

```typescript
const client = new SorobanResurrect({
  rpcUrl: 'https://soroban-testnet.stellar.org',
  networkPassphrase: 'Test SDF Network ; September 2015',
})
// Uses: maxRestoreBatchSize=50, XDR size limit=100KB, no fee budget
```

### Example 2: Strict Entry Count Limit

```typescript
const client = new SorobanResurrect({
  rpcUrl: 'https://soroban-testnet.stellar.org',
  networkPassphrase: 'Test SDF Network ; September 2015',
  maxRestoreBatchSize: 20  // Smaller batches
})
// Uses: maxRestoreBatchSize=20, XDR size limit=100KB, no fee budget
```

### Example 3: Fee-Budget-Aware Batching

```typescript
const client = new SorobanResurrect({
  rpcUrl: 'https://soroban-testnet.stellar.org',
  networkPassphrase: 'Test SDF Network ; September 2015',
  dynamicFeeEstimation: true,
  maxRestoreBatchSize: 50,
  maxRestoreFeeStroops: '500000'  // Max 500K stroops per batch
})
// Uses: maxRestoreBatchSize=50, XDR size limit=100KB, fee budget=500K stroops
// Batch stops when ANY of these limits is hit first
```

### Example 4: Conservative Fee Budget with Small Batches

```typescript
const client = new SorobanResurrect({
  rpcUrl: 'https://soroban-testnet.stellar.org',
  networkPassphrase: 'Test SDF Network ; September 2015',
  dynamicFeeEstimation: true,
  maxRestoreBatchSize: 10,
  maxRestoreFeeStroops: '200000'  // Very conservative: 200K stroops
})
// Uses: maxRestoreBatchSize=10, XDR size limit=100KB, fee budget=200K stroops
```

## Interaction with Concurrent Restoration

When using `buildRestoreTransactionBatchesConcurrent` and `executeRestoreBatchesConcurrent`:

- Batches from **different contracts** are independent and execute in parallel
- Batches from the **same contract** execute sequentially (data dependencies)
- Fee budget constraints apply **per contract group**, then per individual batch
- The final concurrency is bounded by `maxConcurrency` (default: 5)

```typescript
const client = new SorobanResurrect({
  rpcUrl: '...',
  networkPassphrase: '...',
  maxConcurrency: 5,              // Up to 5 parallel batches
  dynamicFeeEstimation: true,
  maxRestoreFeeStroops: '500000'  // Each batch budgeted at 500K stroops
})

const batches = await client.buildRestoreTransactionBatchesConcurrent(
  archivedKeys,
  sourceAccountID
)
// Resulting batches are optimized for concurrent execution while respecting fee budget
```

## Fee Estimation Details

When `maxRestoreFeeStroops` is set:

1. For each potential batch boundary, `estimateRestoreFee(batchSize)` is called
2. The estimated fee includes a **10% buffer** on top of the simulated minimum fee
3. If estimation fails, batching falls back to only `maxRestoreBatchSize` and XDR size constraints
4. Logging at info level shows estimated fees for debugging:
   ```
   Dynamic fee estimate for batch of 42: 110000 stroops (min=100000)
   ```

## Best Practices

1. **For Most Cases**: Use the default `maxRestoreBatchSize=50` without a fee budget
   - Simple to reason about
   - Reasonable balance of batch count vs. transaction size

2. **For Fee-Conscious Operations**: Set `maxRestoreFeeStroops` alongside `dynamicFeeEstimation=true`
   - Ensures restore costs stay within budget
   - Useful when restoring very large key sets
   - Adds overhead of fee estimation calls

3. **For High-Volume Restores**: Increase `maxRestoreBatchSize` to reduce overhead
   - Fewer batches → fewer transactions to sign/submit
   - Watch XDR size limit (100 KB) as the hard ceiling
   - May increase per-batch cost slightly

4. **For Network Congestion**: Decrease `maxRestoreBatchSize` or lower `maxRestoreFeeStroops`
   - Reduces risk of any single batch exceeding acceptable cost
   - More batches required, but each is cheaper

## Configuration Type Reference

```typescript
interface SorobanResurrectConfig {
  // ... other fields ...

  /**
   * Maximum number of keys per restore batch.
   * Default: 50
   */
  maxRestoreBatchSize?: number

  /**
   * Maximum fee budget in stroops per restore batch.
   * When set (alongside dynamicFeeEstimation), batching stops adding entries
   * once the estimated fee would exceed this budget.
   * Default: undefined (fee budget not enforced)
   */
  maxRestoreFeeStroops?: string

  /**
   * Whether to estimate restore fees dynamically via simulation.
   * Required for accurate fee tracking when maxRestoreFeeStroops is set.
   * Default: false
   */
  dynamicFeeEstimation?: boolean

  // ... other fields ...
}
```

## Troubleshooting

**Q: Why are my batches smaller than maxRestoreBatchSize suggests?**

A: Either the XDR size limit (100 KB) or fee budget is being hit first. Check logs for:
- Transaction size warnings
- Fee estimation logs at info level

**Q: Fee estimation is failing, why?**

A: Possible causes:
- RPC server is temporarily unavailable (falls back to `maxRestoreBatchSize`)
- Simulation endpoint is returning errors (falls back to `maxRestoreBatchSize`)
- Network passphrase mismatch

Check `onLog` output at warn/error level for details.

**Q: My batches are all tiny, but fee budget seems high?**

A: The XDR size limit (100 KB) is likely the real constraint. Each key's XDR representation (in base64) plus overhead pushes this limit quickly. Reduce `maxRestoreBatchSize` or increase key-entry density, not the fee budget.

## Safety Checks Before the Original Transaction

These checks run around every restore-then-original flow.

- **Restoration confirmation (#508).** Before the original transaction is submitted, each successful restore transaction is read back with `getTransaction` and must report `SUCCESS`. Otherwise the call rejects with `RESTORE_NOT_CONFIRMED`.

## React StrictMode: Duplicate Restore Side Effects (#555)

React 18+ StrictMode intentionally mounts, unmounts, and remounts components in development to surface unsafe side effects. If a restore is triggered from an effect (e.g. `useEffect(() => { client.restore(...) }, [])`), StrictMode's double invocation can otherwise submit the **same restore twice**.

### Supported behavior

Restore side effects are **idempotent and deduplicated** so that StrictMode's double effect invocation does not produce duplicate restore operations:

- **In-flight deduplication.** Concurrent restore requests for the same set of archived keys (same source account and network) share a single in-flight restore operation. The second caller awaits the same result instead of submitting a new transaction.
- **Post-completion deduplication.** Once a restore for a given key set has completed successfully, a subsequent identical restore request within the same client instance is a no-op that resolves with the prior result. This covers the mount → unmount → remount cycle where the first effect's restore has already finished before the second effect runs.
- **Cleanup safety.** Aborting or unmounting between the two effect invocations does not cancel an already-submitted restore; the deduplicated second invocation simply observes the shared result.

### Edge cases

| Scenario | Behavior |
|----------|----------|
| Two effects fire before the first restore resolves | Both await the same in-flight restore; one transaction submitted |
| First restore completes, then remount fires again | Second request is deduplicated against the completed result; no new transaction |
| Restore fails | The failure is surfaced to all awaiting callers; a later retry is **not** deduplicated against the failed attempt |
| Different key sets / source accounts | Treated as distinct operations; no cross-deduplication |
| Rapid mount/unmount/mount | No duplicate submission; cleanup does not orphan an in-flight restore |

### Compatibility notes

- This is a **behavioral hardening**, not an API change. Existing method signatures and return types are unchanged.
- Deduplication is scoped to a single client instance; separate client instances do not share restore state.
- Deduplication keys on the archived key set plus source account and network passphrase, so intentionally re-restoring a *different* key set is unaffected.
- If you need to force a fresh restore attempt after a failure, simply retry — failed attempts are not cached.

### Example

```typescript
function RestoreOnMount({ client, keys, source }: Props) {
  useEffect(() => {
    // Safe under StrictMode: the double invocation is deduplicated.
    void client.restore(keys, source)
  }, [client, keys, source])

  return null
}
```

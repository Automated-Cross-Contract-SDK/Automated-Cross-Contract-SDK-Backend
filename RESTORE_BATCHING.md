# Restore Batching Configuration

## Overview

The Soroban Resurrect SDK batches archived ledger keys for efficient restoration. Batching is controlled by configurable size limits that can be based on key count, transaction XDR size, or restore fee budget.

## Batching Constraints

Restore batches are split when **any** of the following limits are exceeded:

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

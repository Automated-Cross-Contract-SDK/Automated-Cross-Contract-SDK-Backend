# Episode 5: Batching, Caching, and Performance Optimization

**Duration:** 4-5 minutes (~700 words)

## Narration

Welcome to episode 5. We've built a working restoration-aware dApp, but we can do better. Let's talk about optimizing for speed and cost: batching, caching, and memory efficiency.

### The Performance Challenge

Restoration has a cost. Every restore operation pays a fee. If your dApp needs to restore many entries, those fees add up. Additionally, if users are calling the same contracts repeatedly, we might be simulating the same transactions multiple times.

Soroban Resurrect provides tools to minimize these costs and maximize speed.

### Strategy 1: Batching

When the SDK detects multiple archived entries, it builds restore transactions. By default, it groups related entries together to minimize the number of separate transactions sent to the chain.

The `maxRestoreBatchSize` config controls how many keys fit in a single restore batch:

```typescript
const sdk = new SorobanResurrect({
  rpcUrl: 'https://soroban-testnet.stellar.org',
  networkPassphrase: 'Test SDF Network ; September 2015',
  maxRestoreBatchSize: 100, // Default is 50
})
```

Why does this matter? Each restore transaction pays a base fee plus a per-key cost. Batching more keys together reduces the number of base fees you pay.

However, there's a trade-off: XDR size. The Soroban network has transaction size limits. Too many keys in one batch, and your transaction becomes too large.

For most use cases, the default of 50 keys per batch is well-tuned. You can increase it if your keys are small, or decrease it if you're dealing with large keys.

### Strategy 2: Simulation Caching

Every time you call `simulate()`, the SDK sends a request to the RPC server. If the same transaction is simulated twice (maybe in different parts of your app), you're making redundant requests.

Enable simulation caching:

```typescript
const sdk = new SorobanResurrect({
  rpcUrl: 'https://soroban-testnet.stellar.org',
  networkPassphrase: 'Test SDF Network ; September 2015',
  simulationCache: { maxSize: 100 }, // Cache up to 100 results
})
```

With caching enabled, the second simulation of the same transaction returns instantly from memory instead of hitting the RPC.

```typescript
// First call: hits RPC
const result1 = await sdk.simulate(txXDR)

// Second call with same txXDR: served from cache
const result2 = await sdk.simulate(txXDR)
```

The cache is keyed by the transaction XDR, so identical transactions are recognized and reused.

### Strategy 3: Footprint Caching

Similar to simulation caching, you can cache footprint extraction results:

```typescript
const sdk = new SorobanResurrect({
  rpcUrl: 'https://soroban-testnet.stellar.org',
  networkPassphrase: 'Test SDF Network ; September 2015',
  footprintCache: { maxSize: 500 }, // Cache up to 500 footprints
})
```

When you call `extractFootprint()` multiple times on the same transaction, the cached result is returned immediately.

You should invalidate this cache when the ledger closes (indicating that cached footprints might be stale):

```typescript
// When you detect a new ledger close
sdk.onLedgerClose()
```

Or invalidate a specific transaction's cached footprint:

```typescript
sdk.invalidateFootprintCache(txXDR)
```

### Strategy 4: Concurrent Restoration

If you're restoring many batches, the SDK can submit them in parallel:

```typescript
const result = await sdk.executeRestoreThenOriginalBatchesConcurrent(
  archivedKeys,
  originalTxXDR,
  sourceAccountID,
  signTransaction,
  { concurrency: 4 } // Submit up to 4 restore transactions in parallel
)
```

This reduces total time if you have many batches to restore. Be careful not to set concurrency too high—the RPC might rate-limit you.

### Strategy 5: Memory Efficiency

For very large transactions (>1MB), use the streaming parser instead of the full-object parser:

```typescript
import { extractFootprintFromTransactionStreaming, STREAMING_PARSER_MEMORY_TARGET } from '@soroban-resurrect/sdk'

// This processes the XDR incrementally, using much less memory
const footprint = extractFootprintFromTransactionStreaming(largeXDR)
```

The streaming parser is designed to stay under a 50MB memory ceiling, making it safe for large footprints without OOM errors.

### Real-World Scenario

Let's say your dApp has 100 daily active users, each making 5 transactions per day. That's 500 simulations per day.

**Without optimization:**
- 500 RPC calls for simulation
- 500 footprint extractions
- Many small restore batches
- Lots of fees

**With optimization:**
- Maybe 50 unique transaction types (due to caching), so ~50 RPC calls
- Footprints cached, saved extraction work
- Larger batches, fewer base fees
- 10x reduction in costs

### Measuring Impact

Enable logging to see what's happening:

```typescript
const sdk = new SorobanResurrect({
  rpcUrl: 'https://soroban-testnet.stellar.org',
  networkPassphrase: 'Test SDF Network ; September 2015',
  onLog: (level, message, data) => {
    console.log(`[${level}] ${message}`, data)
  },
})
```

Watch the logs to see cache hits, batch sizes, and restoration times.

### Performance Benchmark

For reference, our benchmarks show:
- **Simulation:** 50ms–200ms per request (depends on RPC latency)
- **Cached simulation:** <1ms
- **Footprint extraction:** 1ms–5ms per transaction
- **Restoration:** 30s–60s for large batches (depends on chain latency)

Memory usage stays under 50MB for transactions up to 50MB in XDR size when using the streaming parser.

### Key Takeaways

- Increase `maxRestoreBatchSize` to reduce fees (if XDR size allows)
- Enable simulation caching to avoid redundant RPC calls
- Enable footprint caching for repeated transactions
- Invalidate caches when the ledger closes
- Use concurrent restoration for multiple batches
- Use the streaming parser for large transactions

### Next Episode

In our final episode, we'll cover common pitfalls and debugging strategies. What can go wrong, and how to fix it?

---

## On-Screen Elements

- **Code examples:** Each optimization shown with before/after
- **Bar chart:** Cost comparison with and without optimization
- **Timeline diagram:** Concurrent restore batches showing parallelism
- **Memory graph:** Peak memory usage with streaming parser vs. full parser
- **Key points (text overlay):**
  - "Batch to reduce base fees"
  - "Cache to avoid redundant work"
  - "Concurrency for speed"
  - "Streaming parser for large transactions"
  - "Monitor with logging"

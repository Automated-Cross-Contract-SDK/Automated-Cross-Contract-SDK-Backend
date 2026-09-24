# Episode 6: Debugging and Common Restoration Pitfalls

**Duration:** 4-5 minutes (~700 words)

## Narration

Welcome to the final episode in the Soroban Resurrect series. We've covered everything from TTL basics to performance optimization. Now, let's talk about what can go wrong and how to fix it.

### Pitfall 1: Forgetting to Extend TTL

**The Problem:**
You've successfully restored archived entries, but you don't update their TTL (extend the expiration time). Your transaction runs, but a few minutes later, the data expires again.

**The Solution:**
When you build restoration operations, the SDK automatically extends TTL for restored entries. However, if you're only calling the contract without restoration, you might want to extend TTL proactively:

```typescript
// Check if TTL is expiring soon
const footprint = await sdk.extractFootprint(txXDR)
const archivedKeys = await sdk.checkArchivedKeys(footprint)

if (archivedKeys.length > 0) {
  // Proactively restore before data actually expires
  await sdk.restore(txXDR, sourceAccountID, signTransaction)
}
```

### Pitfall 2: Not Handling Network Errors

**The Problem:**
During restoration, the RPC server goes down or becomes slow. Your app crashes or hangs.

**The Solution:**
The SDK has built-in retry logic, but you should still handle timeouts:

```typescript
try {
  const result = await sdk.checkAndPrepare(txXDR, sourceAccountID, signTransaction)
} catch (err) {
  if (err.code === 'NETWORK_ERROR') {
    console.error('Network error. Retrying with fallback RPC...')
    // Use a fallback RPC or retry
  }
}
```

You can also configure multiple RPC endpoints:

```typescript
const sdk = new SorobanResurrect({
  rpcUrl: [
    'https://soroban-testnet.stellar.org',
    'https://backup-soroban-rpc.example.com', // Fallback
  ],
})
```

The SDK will automatically try the backup if the primary fails.

### Pitfall 3: Mismatched Network Passphrase

**The Problem:**
You configure the SDK with `networkPassphrase: 'Test SDF Network ; September 2015'`, but the RPC server is on a different network. Transactions fail with cryptic errors.

**The Solution:**
The SDK validates the network passphrase at startup. If there's a mismatch, it logs a warning. Enable strict validation to fail fast:

```typescript
const sdk = new SorobanResurrect({
  rpcUrl: 'https://soroban-testnet.stellar.org',
  networkPassphrase: 'Test SDF Network ; September 2015',
  strictNetworkValidation: true, // Throw if mismatch
})
```

When troubleshooting, log the network from the RPC:

```typescript
const network = await sdk.getRpcServer().getNetwork()
console.log(`RPC network: ${network.passphrase}`)
```

### Pitfall 4: Ignoring Invalid XDR

**The Problem:**
You pass malformed transaction XDR to the SDK. It throws an `INVALID_XDR` error, and you're unsure where the XDR came from.

**The Solution:**
Always validate transaction XDR before passing it to the SDK. Log it for debugging:

```typescript
try {
  const result = await sdk.simulate(txXDR)
} catch (err) {
  if (err.code === 'INVALID_XDR') {
    console.error('Invalid XDR:', txXDR.substring(0, 100) + '...')
    console.error('Error:', err.message)
    // Re-build the transaction
  }
}
```

Use `TransactionBuilder.fromXDR` to validate XDR syntax before passing to the SDK:

```typescript
try {
  TransactionBuilder.fromXDR(txXDR, networkPassphrase)
} catch {
  console.error('Malformed XDR')
}
```

### Pitfall 5: Memory Issues with Large Footprints

**The Problem:**
When processing a 50MB+ transaction, your Node.js process runs out of memory and crashes.

**The Solution:**
Use the streaming parser instead of the full-object parser:

```typescript
import { extractFootprintFromTransactionStreaming } from '@soroban-resurrect/sdk'

// Safe for large transactions
const footprint = extractFootprintFromTransactionStreaming(hugeXDR)
```

The streaming parser uses bounded memory (under 50MB) regardless of transaction size.

If you're still running out of memory, increase your Node.js heap:

```bash
node --max-old-space-size=4096 your-app.js
```

### Pitfall 6: Signing Callback Never Returns

**The Problem:**
Your signing callback hangs because the user's wallet or signer is unresponsive. The SDK waits forever.

**The Solution:**
Set a timeout on the signing callback:

```typescript
const signWithTimeout = async (xdr) => {
  return Promise.race([
    wallet.signTransaction(xdr),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Signing timed out')), 10000)
    ),
  ])
}

const result = await sdk.checkAndPrepare(txXDR, sourceAccountID, signWithTimeout)
```

Also configure the SDK's request timeout:

```typescript
const sdk = new SorobanResurrect({
  rpcUrl: 'https://soroban-testnet.stellar.org',
  networkPassphrase: 'Test SDF Network ; September 2015',
  timeout: 30000, // 30 second timeout for RPC requests
})
```

### Pitfall 7: Cache Staleness

**The Problem:**
You've enabled caching, but the ledger closed and new data arrived. Your app still uses cached results from the old ledger.

**The Solution:**
Invalidate caches when the ledger closes. Listen to ledger close events:

```typescript
const subscription = sdk.getRpcServer().on('ledgerclose', () => {
  sdk.onLedgerClose() // Invalidates footprint cache
})

// When the dApp closes:
subscription.unsubscribe()
```

For simulation cache, you might want a TTL-based expiration:

```typescript
// Clear simulation cache after 5 minutes
setInterval(() => {
  sdk.clearSimulationCache?.()
}, 5 * 60 * 1000)
```

### Debugging Tools

**Enable verbose logging:**

```typescript
const sdk = new SorobanResurrect({
  rpcUrl: 'https://soroban-testnet.stellar.org',
  networkPassphrase: 'Test SDF Network ; September 2015',
  onLog: (level, message, data) => {
    console.log(`[${level.toUpperCase()}] ${message}`, data || '')
  },
})
```

**Inspect SDK state:**

```typescript
console.log('RPC health:', sdk.getFailoverStatus())
console.log('Cache stats:', sdk.getFootprintCacheStats())
```

### Key Takeaways

- Always handle network errors and timeouts
- Validate XDR before processing
- Use streaming parser for large transactions
- Invalidate caches on ledger close
- Enable logging to track what the SDK is doing
- Provide a timeout on signing callbacks

### Wrapping Up

You've now seen the full lifecycle of building restoration-aware dApps:
1. Understanding TTL expiration
2. Using the core SDK
3. Integrating with React
4. Building a full dApp
5. Optimizing for performance
6. Debugging and troubleshooting

Soroban Resurrect handles the complexity of TTL expiration for you, so your users can focus on their transactions. Happy building!

---

## On-Screen Elements

- **Code examples:** Error handling patterns shown
- **Logging output:** Example log messages demonstrating verbosity
- **Flowchart:** Decision tree for debugging common issues
- **Error cards:** Common error codes and solutions
- **Key points (text overlay):**
  - "Validate network passphrase"
  - "Handle network errors gracefully"
  - "Use streaming parser for large data"
  - "Invalidate caches on ledger close"
  - "Enable logging for debugging"
  - "Set timeouts to prevent hangs"
  - "Test with retry logic"

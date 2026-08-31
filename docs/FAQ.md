# Frequently Asked Questions (FAQ)

This page answers common questions about the Automated Cross-Contract SDK.

## General Questions

### Why not just increase TTL?

**Q:** Why can't we just increase the Time To Live (TTL) for ledger entries instead of using restoration?

**A:** While increasing TTL is one approach, it has significant limitations:

1. **TTL Limits:** Soroban has a maximum TTL of ~6 months. After that, entries expire regardless.
2. **Cost:** Every TTL extension on-chain consumes XLM fees and resources
3. **Maintenance Burden:** Requires active monitoring and periodic extensions
4. **Scaling Issues:** Not practical for applications managing thousands of keys

The restoration service provides:
- Automatic lifecycle management without per-entry fees
- Proactive restoration preventing failures
- Better predictability and reliability

### Does this work with decentralized RPC?

**Q:** Can the restoration service work with decentralized RPC endpoints?

**A:** Yes, with considerations:

1. **Node Consistency:** All nodes should be synchronized. Decentralized RPC may have slight delays
2. **Ledger State:** Restoration requires consistent ledger state across nodes
3. **Testing Required:** Test with your specific decentralized RPC setup
4. **Fallback:** Implement fallback to trusted RPC for critical operations

```typescript
const rpcEndpoints = [
  'https://decentralized-rpc-1.example.com',
  'https://decentralized-rpc-2.example.com',
  'https://soroban-testnet.stellar.org', // fallback
];

// SDK will automatically retry across endpoints
const service = new RestorationService(config, { rpcEndpoints });
```

### What are the gas costs of restoration?

**Q:** How much does it cost to restore keys?

**A:** Costs depend on several factors:

1. **Per-Key Cost:** Approximately 1000-2000 stroops per key
2. **Batch Size:** 50 keys in a single transaction
3. **Network Fees:** Current Soroban network baseline fee
4. **Total Estimate:** For 100 keys with 2000 stroops/key:
   - 100 keys ÷ 50 keys/batch = 2 batches
   - 2 batches × 2,000 stroops = 4,000 stroops (~0.0004 XLM)

```typescript
// Estimate restoration cost
const estimatedCost = Math.ceil(keys.length / 50) * 2000;
console.log(`Estimated cost: ${estimatedCost} stroops`);

// Check current network fees
const feeStats = await server.feeStats();
console.log(`Network fee: ${feeStats.sorobanNetworkFee} stroops`);
```

**Cost Optimization:**
- Batch keys together (SDK does this automatically)
- Restore during network low-load periods
- Use scheduled restoration for predictable cost

## Technical Questions

### Is there a limit on how many keys can be restored?

**Q:** Can I restore unlimited keys?

**A:** There are practical limits:

1. **Per-Transaction Limit:** 50 keys per batch (100KB max payload)
2. **RPC Rate Limits:** Most RPC providers have request limits
3. **Memory Limits:** Very large batches may cause memory issues
4. **Wallet Constraints:** Wallets must sign restoration transactions

**Recommended Limits:**
- Single restoration: Up to 1,000 keys
- Hourly rate: Up to 10,000 keys
- Daily rate: Up to 100,000 keys

```typescript
// Safe restoration of large key sets
const keys = getKeysToRestore();
const maxKeysPerHour = 10000;

for (let i = 0; i < keys.length; i += maxKeysPerHour) {
  const batch = keys.slice(i, i + maxKeysPerHour);
  await service.restoreKeys(batch);
  // Wait before next batch to respect rate limits
  await delay(3600000); // 1 hour
}
```

### Does this work with Soroban auth entries?

**Q:** Can I restore authorization entries?

**A:** Yes, auth entries can be restored:

1. **Native Support:** Soroban auth entries are standard ledger entries
2. **Automatic Handling:** SDK treats auth entries like any other key
3. **Lifecycle:** Auth entries follow same TTL and restoration rules

```typescript
import { ContractDataEntry } from 'js-stellar-sdk';

// Restore both contract data and auth entries
const entries = [
  // Contract data entries
  ContractDataEntry.contractData(...),
  // Auth entries
  AuthEntry.fromAuthSorobanAuthorizedInvocation(...),
];

const results = await service.restoreKeys(entries);
```

**Important:** Auth entries have specific format requirements. Ensure proper XDR structure.

### What happens if the restore succeeds but the original fails?

**Q:** Can restoration succeed but the original transaction still fail?

**A:** Yes, this is possible in certain scenarios:

**Scenario 1: Contract State Changed**
```
1. Restore keys (succeeds)
2. Another transaction modifies contract state
3. Original transaction fails due to state mismatch
```

**Scenario 2: Time Bounds Expired**
```
1. Restore keys (succeeds)
2. Too much time passes (transaction expired)
3. Original transaction rejected as stale
```

**Scenario 3: Fee Insufficient**
```
1. Restore keys (succeeds with current fees)
2. Network fees increase
3. Original transaction fails due to insufficient fee
```

**Mitigation Strategy:**
```typescript
// 1. Restore keys with verification
const restoreResult = await service.restoreKeys(keys);
if (!restoreResult.success) throw new Error('Restoration failed');

// 2. Wait for restoration to settle
await waitForLedger(1);

// 3. Verify keys are accessible
const verified = await verifyKeysAccessible(keys);
if (!verified) throw new Error('Keys not accessible after restore');

// 4. Update transaction time bounds
transaction.timeBounds = {
  minTime: Math.floor(Date.now() / 1000),
  maxTime: Math.floor(Date.now() / 1000) + 3600, // 1 hour
};

// 5. Resubmit original transaction
const submitResult = await server.submitTransaction(transaction);
```

## Wallet and Integration Questions

### Can I restore keys proactively (before they expire)?

**Q:** Should I wait until keys are close to expiration?

**A:** No, proactive restoration is recommended:

**Benefits:**
1. **Prevents Failures:** Avoid transaction failures from expired keys
2. **Better UX:** Silent background restoration vs. user-facing errors
3. **Flexible Timing:** Restore during low-fee periods
4. **Monitoring:** Catch issues early

```typescript
// Proactive restoration strategy
async function proactiveRestoration(service, keys) {
  // Restore keys when ~50% of TTL remains
  const ttlThreshold = 0.5;
  
  const keysNeedingRestore = keys.filter(key => {
    const ttlRemaining = getTTLRemaining(key);
    const ttlTotal = getTTLTotal(key);
    return ttlRemaining < (ttlTotal * ttlThreshold);
  });
  
  if (keysNeedingRestore.length > 0) {
    await service.restoreKeys(keysNeedingRestore);
  }
}

// Schedule proactive restoration
setInterval(() => {
  proactiveRestoration(service, contractKeys);
}, 24 * 60 * 60 * 1000); // Daily check
```

### How does batching work?

**Q:** How does the SDK batch keys for restoration?

**A:** Batching is automatic with these rules:

1. **Size Limits:**
   - Maximum 50 keys per batch
   - Maximum 100KB payload per batch
   - Strictly enforced

2. **Batching Strategy:**
   ```
   Keys: [1, 2, 3, ..., 150]
   
   Batch 1: Keys 1-50 (single transaction)
   Batch 2: Keys 51-100 (single transaction)
   Batch 3: Keys 101-150 (single transaction)
   ```

3. **Automatic Handling:**
   ```typescript
   // No need to manually batch
   const result = await service.restoreKeys(largeKeyArray);
   // SDK automatically creates multiple transactions
   ```

4. **Batch Configuration:**
   ```typescript
   const config = {
     batchSize: 50,
     maxPayloadSize: 100 * 1024, // 100KB
     parallelBatches: 1, // Process one at a time
   };
   
   const service = new RestorationService(config);
   ```

### What wallets are supported?

**Q:** Which wallets are compatible with the restoration service?

**A:** Supported wallets:

1. **Stellar Wallets:**
   - Freighter (recommended)
   - LOBSTR
   - Stellar Expert
   - rabet (beta)

2. **Requirements:**
   - Soroban transaction signing support
   - Message channel support
   - XDR transaction encoding capability

3. **Checking Support:**
   ```typescript
   const capabilities = await wallet.getCapabilities?.();
   if (capabilities?.includes('soroban')) {
     console.log('Wallet supports Soroban');
   }
   ```

4. **Adding New Wallets:**
   See [Wallet Adapter Documentation](./docs/wallet_adapters.md)

### How do I contribute?

**Q:** How can I contribute to the project?

**A:** We welcome contributions:

1. **Report Issues:**
   - Use GitHub Issues for bugs and feature requests
   - Include reproduction steps and environment details

2. **Submit Pull Requests:**
   - Fork the repository
   - Create a feature branch
   - Follow the contributing guidelines
   - Ensure tests pass

3. **Contribute Documentation:**
   - Fix typos and improve clarity
   - Add examples
   - Expand guides

4. **Community:**
   - Join Discord for discussions
   - Participate in GitHub Discussions
   - Help others troubleshoot

**Contributing Guidelines:**
```markdown
# Before contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make changes with tests
4. Ensure all tests pass: `npm test`
5. Submit a pull request

# Commit message format

feat: Add new feature
fix: Fix bug
docs: Update documentation
test: Add/modify tests
refactor: Code refactoring

Include issue number: "Closes #123"
```

## Performance and Optimization Questions

### What's the expected performance?

**Q:** How fast can keys be restored?

**A:** Performance depends on several factors:

1. **Network Latency:** ~500ms-2s per batch
2. **RPC Performance:** RPC node response time
3. **Batch Size:** 50 keys per 1-2 seconds

**Benchmark Results:**
```
Environment: Testnet
RPC: soroban-testnet.stellar.org
Batch Size: 50 keys
Average Time: 1.5 seconds per batch
Throughput: ~33 keys/second

For 1000 keys: ~45 seconds (20 batches)
For 10000 keys: ~7.5 minutes (200 batches)
```

4. **Optimization Tips:**
   ```typescript
   // Use scheduled restoration during low-load periods
   const lowFeeHour = 3; // 3 AM UTC
   
   // Batch keys smartly
   const smartBatch = keys.slice(0, 50);
   
   // Monitor performance
   const startTime = performance.now();
   const result = await service.restoreKeys(smartBatch);
   const duration = performance.now() - startTime;
   console.log(`Restored ${smartBatch.length} keys in ${duration}ms`);
   ```

### How do I minimize costs?

**Q:** What's the most cost-effective restoration strategy?

**A:** Cost optimization strategies:

1. **Batch Efficiently:** Use automatic batching (50 keys per transaction)
2. **Time Selection:** Restore during network low-fee periods
3. **Proactive Restoration:** Avoid emergency restorations
4. **Monitoring:** Track TTL and restore before expiration

```typescript
// Cost tracking
async function trackCost(service, keys) {
  const feeStats = await server.feeStats();
  const estimatedCost = Math.ceil(keys.length / 50) * feeStats.sorobanNetworkFee;
  
  console.log(`Estimated cost: ${estimatedCost} stroops`);
  
  const result = await service.restoreKeys(keys);
  console.log(`Actual cost: ${result.actualCost} stroops`);
}
```

## Troubleshooting Questions

### What if something still doesn't work?

**Q:** I've tried everything and restoration still fails. What now?

**A:** Follow these steps:

1. **Enable Debug Mode:**
   ```typescript
   import { setDebugMode } from '@soroban-resurrect/sdk';
   setDebugMode(true);
   ```

2. **Check Prerequisites:**
   - Verify account exists and has balance
   - Ensure keys are valid Soroban entries
   - Check network connectivity
   - Confirm RPC endpoint accessibility

3. **Review Logs:**
   - Look for specific error codes
   - Check RPC responses
   - Verify transaction XDR

4. **File a Detailed Issue:**
   - Include debug logs
   - Provide minimal reproduction
   - Share environment details

5. **Get Community Help:**
   - Ask on GitHub Discussions
   - Join Discord community
   - Contact support for enterprise users

## Additional Resources

- **[Migration Guide](./MIGRATION_GUIDE.md)** - Upgrade from v0.1.0 to v1.0.0
- **[Troubleshooting Guide](./TROUBLESHOOTING.md)** - Detailed error solutions
- **[Architecture Decisions](./adr/)** - Design rationale
- **[API Documentation](./api/)** - Complete API reference
- **[Examples](../examples/)** - Example projects
- **[GitHub Discussions](https://github.com/Automated-Cross-Contract-SDK/Automated-Cross-Contract-SDK-Backend/discussions)** - Community support

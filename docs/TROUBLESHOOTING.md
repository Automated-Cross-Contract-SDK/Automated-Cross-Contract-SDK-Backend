# Troubleshooting Guide

This guide helps you diagnose and resolve common issues when using the Automated Cross-Contract SDK.

## Common Errors and Their Causes

### Transaction Not Simulating

**Symptoms:** `TransactionSimulationError` or simulation timeout

**Possible Causes:**
1. Invalid account state - account doesn't exist or has been cleaned up
2. Insufficient account balance for fees
3. Network connectivity issues
4. Soroban RPC service unavailable
5. Transaction contains unsupported operations

**Solutions:**
```typescript
// 1. Verify account exists
const account = await server.getAccount(accountId);

// 2. Check account balance
if (account.balances.find(b => b.asset_type === 'native').balance < '1') {
  throw new Error('Insufficient XLM balance');
}

// 3. Enable debug logging
import { setDebugMode } from '@soroban-resurrect/sdk';
setDebugMode(true);

// 4. Check RPC connectivity
const health = await server.getHealth();

// 5. Use restoration service with built-in retry
const service = new RestorationService(config);
try {
  const result = await service.restoreKeys(keys);
} catch (error) {
  if (error.code === 'SIMULATION_FAILED') {
    console.log('Simulation details:', error.details);
  }
}
```

### Restore Succeeded But Original Failed

**Symptoms:** Keys were restored successfully, but the original transaction still fails

**Possible Causes:**
1. Original transaction references deleted ledger entries
2. Time-bound transaction (invalid after a certain ledger)
3. Fee-related issues
4. Contract state changed between restore and submission

**Solutions:**
```typescript
// 1. Check transaction time bounds
if (transaction.timeBounds.minTime > Date.now() / 1000) {
  throw new Error('Transaction not yet valid');
}
if (transaction.timeBounds.maxTime < Date.now() / 1000) {
  throw new Error('Transaction expired');
}

// 2. Verify contract state
const contractState = await server.getContractState(contractId);

// 3. Resubmit transaction after restore
const restoreResult = await service.restoreKeys(keys);
if (restoreResult.success) {
  // Wait a block for restoration to settle
  await waitForLedger(1);
  // Resubmit original transaction
  const submitResult = await server.submitTransaction(transaction);
}

// 4. Check for fee-bump transaction restrictions
if (transaction.operations.some(op => op.type === 'feeBump')) {
  throw new Error('Fee-bump transactions not supported');
}
```

### XDR Parsing Errors

**Symptoms:** `XDRParsingError`, `InvalidXDRFormat`, or malformed data

**Possible Causes:**
1. Corrupted transaction XDR
2. Version mismatch between SDK and Soroban
3. Invalid base64 encoding
4. Incomplete or truncated XDR data

**Solutions:**
```typescript
// 1. Validate XDR format
function validateXDR(xdr: string): boolean {
  try {
    // XDR must be valid base64
    Buffer.from(xdr, 'base64');
    return true;
  } catch {
    return false;
  }
}

// 2. Use proper XDR parsing
import { xtx } from 'js-stellar-sdk';
const transaction = xtx.TransactionEnvelope.fromXDR(xdrString, 'base64');

// 3. Check Soroban version compatibility
const networkInfo = await server.getNetworkPassphrase();

// 4. Debug XDR contents
import { setDebugMode } from '@soroban-resurrect/sdk';
setDebugMode(true);
const parsed = await service.debugParseXDR(xdrString);
console.log('Parsed XDR:', parsed);
```

### Wallet Connection Issues

**Symptoms:** Wallet won't sign transactions, connection timeouts, or signing failures

**Possible Causes:**
1. Wallet not installed or not responding
2. User rejected the signing request
3. Wallet doesn't support Soroban transaction types
4. Network connectivity between dapp and wallet
5. Message port communication issues

**Solutions:**
```typescript
// 1. Check wallet availability
const walletId = 'your-wallet-id';
const isAvailable = await checkWalletAvailability(walletId);

// 2. Handle user rejection
try {
  const signature = await wallet.signTransaction(transaction);
} catch (error) {
  if (error.code === 'USER_REJECTION') {
    console.log('User cancelled signing');
  } else if (error.code === 'TIMEOUT') {
    console.log('Signing timeout - wallet may not be responding');
  }
}

// 3. Verify wallet Soroban support
const capabilities = await wallet.getCapabilities();
if (!capabilities.includes('soroban')) {
  throw new Error('Wallet does not support Soroban transactions');
}

// 4. Check message port connectivity
const port = await wallet.connect();
if (!port) {
  throw new Error('Failed to establish wallet connection');
}

// 5. Implement timeout handling
const signWithTimeout = async (txn, timeout = 30000) => {
  return Promise.race([
    wallet.signTransaction(txn),
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Signing timeout')), timeout)
    )
  ]);
};
```

### Network/Firewall Configuration

**Symptoms:** Connection refused, cannot reach RPC, timeout errors

**Possible Causes:**
1. Firewall blocking requests to Soroban RPC
2. Proxy or VPN interference
3. DNS resolution issues
4. Rate limiting from RPC provider
5. Network connectivity problems

**Solutions:**
```typescript
// 1. Test connectivity
const testRPC = async (url: string) => {
  try {
    const response = await fetch(url, { method: 'HEAD' });
    return response.ok;
  } catch (error) {
    console.error('Cannot reach RPC:', error);
    return false;
  }
};

// 2. Configure proxy if needed
import axios from 'axios';
const client = axios.create({
  httpAgent: new HttpProxyAgent('http://proxy:8080'),
  httpsAgent: new HttpsProxyAgent('https://proxy:8080'),
});

// 3. Use DNS resolution
import dns from 'dns';
dns.resolve4('soroban-rpc.stellar.org', (err, addresses) => {
  if (err) console.error('DNS resolution failed:', err);
  console.log('RPC addresses:', addresses);
});

// 4. Implement exponential backoff for rate limiting
const maxRetries = 3;
const backoffMultiplier = 2;
for (let i = 0; i < maxRetries; i++) {
  try {
    return await makeRequest();
  } catch (error) {
    if (error.status === 429) { // Rate limit
      const delay = Math.pow(backoffMultiplier, i) * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
    } else {
      throw error;
    }
  }
}

// 5. Check network connectivity
const isOnline = async () => {
  try {
    await fetch('https://www.google.com', { method: 'HEAD' });
    return true;
  } catch {
    return false;
  }
};
```

## Error Code Reference Table

| Error Code | HTTP Status | Meaning | Action |
|---|---|---|---|
| `SIMULATION_FAILED` | 400 | Transaction simulation failed | Check transaction validity and account state |
| `INVALID_XDR` | 400 | Malformed XDR data | Validate XDR format and encoding |
| `INSUFFICIENT_FEE` | 400 | Transaction fee too low | Increase fee or use auto-fee estimation |
| `ACCOUNT_NOT_FOUND` | 404 | Account doesn't exist | Create account or check account ID |
| `CONTRACT_NOT_FOUND` | 404 | Contract not deployed | Verify contract ID and deployment |
| `TIMEOUT` | 408 | Request timeout | Retry with exponential backoff |
| `RATE_LIMITED` | 429 | Too many requests | Implement backoff and batching |
| `SERVICE_UNAVAILABLE` | 503 | RPC service down | Use fallback RPC or retry later |
| `FEE_BUMP_NOT_SUPPORTED` | 400 | Fee-bump transaction rejected | Use standard transaction instead |
| `USER_REJECTION` | - | User cancelled operation | Prompt user to retry |
| `WALLET_NOT_FOUND` | - | Wallet not available | Check wallet installation |
| `NETWORK_ERROR` | - | Network connectivity issue | Check firewall and internet connection |

## Debug Mode Usage

Enable debug mode to see detailed logging:

```typescript
import { setDebugMode, setDebugLogLevel } from '@soroban-resurrect/sdk';

// Enable debug mode
setDebugMode(true);

// Set specific log levels
setDebugLogLevel('INFO');   // INFO, DEBUG, TRACE, ERROR

// Debug output includes:
// - All HTTP requests and responses
// - XDR parsing steps
// - Retry attempts
// - Event emissions
// - Error stack traces
```

Enable debug mode in the browser:

```typescript
// localStorage
localStorage.setItem('DEBUG', '@soroban-resurrect:*');

// or via environment
process.env.DEBUG = '@soroban-resurrect:*';
```

## Log Analysis Guide

### Reading Debug Logs

```
[2024-01-15T10:30:45.123Z] DEBUG @soroban-resurrect:sdk
  POST https://soroban-rpc.stellar.org:443/
  {
    "jsonrpc": "2.0",
    "method": "simulateTransaction",
    "params": ["...XDR..."],
    "id": 1
  }

[2024-01-15T10:30:45.456Z] DEBUG @soroban-resurrect:sdk
  Simulation failed: "The operation is outside the range [1500000, 8000000]"
  Status: 400
```

**Analysis:**
1. Check HTTP method and URL
2. Review request parameters
3. Look for error messages in response
4. Check timestamp for timing issues
5. Correlate with other services

### Common Log Patterns

**Pattern:** Multiple 429 responses
- **Cause:** Rate limiting from RPC
- **Fix:** Increase retry delays, implement backoff

**Pattern:** Connection reset after N requests
- **Cause:** Connection pooling issue or server limit
- **Fix:** Implement connection pooling with proper limits

**Pattern:** Inconsistent responses for same request
- **Cause:** Load balancing across RPC nodes with different states
- **Fix:** Use specific RPC node or implement request deduplication

## Support Channels and How to File Good Bug Reports

### Support Channels

1. **GitHub Issues** - Bug reports and feature requests
2. **GitHub Discussions** - Questions and community support
3. **Discord** - Real-time community chat
4. **Email** - Direct support for enterprise users

### Filing Good Bug Reports

Include these details:

```markdown
### Description
Brief description of the issue

### Environment
- SDK version: 1.0.0
- Node.js version: 18.x
- Operating System: Linux/macOS/Windows
- Soroban RPC URL: [your RPC endpoint]

### Steps to Reproduce
1. Step 1
2. Step 2
3. Step 3

### Expected Behavior
What should happen

### Actual Behavior
What actually happens

### Error Message
Full error message (if applicable)

### Debug Logs
Output from setDebugMode(true)

### Minimal Reproduction
Minimal code that reproduces the issue
```

### Good Bug Report Example

```markdown
### Description
Transaction simulation fails when restoring keys for large account with 100+ signers

### Environment
- SDK version: 1.0.0
- Node.js version: 18.12.0
- Soroban RPC: https://soroban-testnet.stellar.org

### Steps to Reproduce
1. Create account with 100+ signers
2. Call service.restoreKeys([...])
3. Observe simulation failure

### Error Message
TransactionSimulationError: Host rejected the transaction (status=INVALID_STATE)

### Debug Logs
[Include relevant debug output]

### Minimal Reproduction
[Include minimal code]
```

## Getting More Help

If you need additional help:

1. **Check the FAQ** - Common questions answered
2. **Read the ADRs** - Understand design decisions
3. **Review examples** - Check example projects
4. **Ask the community** - GitHub Discussions or Discord
5. **File a detailed issue** - Include all information above

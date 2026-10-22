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

### Wallet Returned a Fee-Bumped Signed Envelope

**Symptoms:** A wallet's `signTransaction` resolves with a fee-bump envelope instead of the original signed envelope, or the SDK rejects the result with `FEE_BUMP_NOT_SUPPORTED`.

**Supported behavior:** The SDK does **not** accept fee-bumped envelopes returned by a wallet. Per [ADR-001](adr/ADR-001-reject-fee-bump-transactions.md), the SDK only submits the exact envelope it constructed and simulated. A wallet that wraps the transaction in a fee-bump envelope changes the inner transaction hash and the fee source, which invalidates the simulation results and the SDK's integrity guarantees. When a fee-bump envelope is detected, the SDK rejects it with `FEE_BUMP_NOT_SUPPORTED` and does not submit it.

**Possible Causes:**
1. Wallet is configured to auto-bump fees on signing
2. Wallet applies a fee-bump policy for the connected network
3. Wallet returns a `FeeBumpTransactionEnvelope` instead of a `TransactionEnvelope`

**Solutions:**
```typescript
// 1. Detect a fee-bump envelope before submitting
try {
  const signed = await wallet.signTransaction(transaction);
  // The SDK rejects fee-bump envelopes; handle the rejection explicitly
} catch (error) {
  if (error.code === 'FEE_BUMP_NOT_SUPPORTED') {
    // The wallet returned a fee-bump envelope. Disable auto fee-bump
    // in the wallet settings, or use a wallet that returns the
    // original signed envelope unchanged.
    console.error('Wallet returned a fee-bump envelope; not supported');
  }
}

// 2. Disable wallet auto fee-bump and re-sign
await wallet.setAutoFeeBump(false);
const signed = await wallet.signTransaction(transaction);

// 3. If a higher fee is needed, rebuild the transaction with the
//    desired fee and re-simulate instead of fee-bumping after signing
const rebuilt = await service.buildTransaction({ ...params, fee: desiredFee });
const signedRebuilt = await wallet.signTransaction(rebuilt);
```

**Compatibility constraint:** Fee-bump envelopes are intentionally unsupported. If your wallet cannot return the original signed envelope unchanged, use a wallet that can, or rebuild the transaction with the desired fee before signing.

### Hardware Wallet Removed During Signing

**Symptoms:** A hardware wallet is unplugged, disconnected, or loses its transport while a signing request is in flight. The SDK surfaces a recoverable `HARDWARE_WALLET_DISCONNECTED` error instead of a fatal signing failure.

**Supported behavior:** Hardware-wallet removal during signing is treated as a **recoverable** condition. When the device is removed before or during signing, the SDK aborts the in-flight signing request, leaves the transaction unsigned, and rejects with `HARDWARE_WALLET_DISCONNECTED`. The signing state is not corrupted: the original transaction is preserved and can be re-signed once the device is reconnected. This is distinct from fatal signing failures (e.g. `USER_REJECTION`, invalid signatures), which are not retried automatically.

**Possible Causes:**
1. Device unplugged or Bluetooth/USB transport dropped mid-signing
2. Device screen locked or awaiting confirmation when the connection dropped
3. Wallet bridge/transport timed out and closed the channel

**Solutions:**
```typescript
// 1. Detect the recoverable removal error and retry after reconnect
try {
  const signed = await wallet.signTransaction(transaction);
} catch (error) {
  if (error.code === 'HARDWARE_WALLET_DISCONNECTED') {
    // Recoverable: the transaction is still unsigned and intact.
    // Prompt the user to reconnect the device, then retry signing.
    await wallet.reconnect();
    const signed = await wallet.signTransaction(transaction);
  } else {
    // Fatal signing failures are not retried automatically.
    throw error;
  }
}

// 2. Guard against removal before signing starts
if (!(await wallet.isConnected())) {
  throw new Error('Hardware wallet not connected');
}
const signed = await wallet.signTransaction(transaction);
```

**Compatibility constraint:** `HARDWARE_WALLET_DISCONNECTED` is a recoverable error code; callers that previously treated all signing errors as fatal should branch on this code to allow retry. No public API signatures change.

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

// 4. Implement exponential ba

/* … truncated 2185 chars — edit only what you need near the top … */

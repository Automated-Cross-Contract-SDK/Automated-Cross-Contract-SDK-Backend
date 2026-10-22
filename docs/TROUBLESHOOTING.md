# Troubleshooting Guide

This guide helps you diagnose and resolve common issues when using the Automated Cross-Contract SDK.

## RPC URL Credential Redaction

RPC URLs frequently embed credentials — either as userinfo (`https://user:pass@rpc.example.com`) or as sensitive query parameters (`?apiKey=...`, `?token=...`, `?secret=...`, `?password=...`, `?key=...`). To prevent these secrets from leaking into logs, telemetry, or error messages, the SDK redacts RPC URLs before they are logged or surfaced in user-facing errors.

### Behavior

- **Userinfo** (`user:pass@`) is replaced with `***@`.
- **Sensitive query parameters** (`apiKey`, `api_key`, `token`, `secret`, `password`, `key`, `access_token`, `auth`) have their values replaced with `***`.
- **Non-sensitive** parts of the URL (scheme, host, port, path, other query params) are preserved so the URL remains useful for debugging.
- **Malformed URLs** and **non-URL inputs** are handled gracefully: the input is returned as a safe placeholder rather than throwing, so redaction never breaks error reporting.

### Example

```typescript
import { redactRpcUrl } from '@soroban-resurrect/sdk';

redactRpcUrl('https://user:pass@rpc.example.com/?apiKey=abc123&network=testnet');
// => 'https://***@rpc.example.com/?apiKey=***&network=testnet'

redactRpcUrl('not a url');
// => '[redacted]'
```

### Compatibility Constraints

- Redaction is applied automatically wherever the SDK logs or includes an RPC URL in an error. You do not need to call `redactRpcUrl` yourself for SDK-generated output.
- If you build your own error messages or logs that include an RPC URL, call `redactRpcUrl` first to avoid leaking credentials.
- Redaction is best-effort and string-based; it does not validate that the URL is reachable. It is safe to call on any string input.
- The public API shape of existing errors and log messages is unchanged — only the URL text within them is redacted.

## Verifying Signed Transactions Before Submission

Before a wallet-signed transaction is submitted, the SDK verifies that the signed envelope still matches what was requested. This guards against wallets that alter contents, sign for the wrong network, or return an unsigned/malformed envelope.

### Behavior

- **Envelope integrity** — the returned envelope must parse as a valid transaction envelope. Malformed or truncated XDR is rejected before any network call.
- **Network passphrase** — the envelope's network passphrase must match the configured network. A mismatch (e.g. signing for testnet while submitting to mainnet) is rejected.
- **Signature presence** — at least one signature must be present on the envelope. Missing signatures are rejected.
- **Content match** — the signed transaction's operations, source account, fee, and time bounds must match the transaction that was sent for signing. Any alteration after signing is rejected.

### Example

```typescript
import { verifySignedTransaction } from '@soroban-resurrect/sdk';

try {
  verifySignedTransaction({
    expected: unsignedTransaction,
    signed: signedEnvelope,
    networkPassphrase: Networks.TESTNET,
  });
} catch (error) {
  // error.code is one of:
  //   'MALFORMED_ENVELOPE' | 'NETWORK_MISMATCH'
  //   'MISSING_SIGNATURE' | 'CONTENT_MISMATCH'
  console.error('Signed transaction rejected:', error.code, error.message);
}
```

### Compatibility Constraints

- Verification runs automatically before submission; you do not need to call `verifySignedTransaction` yourself for SDK-driven flows.
- If you submit wallet output through your own code path, call `verifySignedTransaction` first to get the same guarantees.
- Verification is read-only and does not modify the envelope; a passing check leaves the signed transaction unchanged.
- The public API shape of existing submission errors is unchanged — verification failures surface as a distinct error with a `code` field.

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

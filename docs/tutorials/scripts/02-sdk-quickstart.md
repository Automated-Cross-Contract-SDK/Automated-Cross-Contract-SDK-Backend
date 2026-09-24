# Episode 2: SDK Quickstart — Install, Import, and Simulate

**Duration:** 4-5 minutes (~700 words)

## Narration

Welcome back to Soroban Resurrect. In episode 1, we learned what TTL expiration is and why it matters. Now it's time to get hands-on. We're going to install the SDK and use it to detect and restore expired state.

### Step 1: Installation

Start by installing the SDK from npm. Open your terminal and type:

```bash
npm install @soroban-resurrect/sdk
```

This installs the core SDK package. It has dependencies on the Stellar SDK, which you'll need for building transactions.

If you're also building a React app, you can install the React integration:

```bash
npm install @soroban-resurrect/react
```

But for this episode, we're focusing on the core SDK.

### Step 2: Create an SDK Instance

In your JavaScript or TypeScript file, import SorobanResurrect and create an instance:

```typescript
import { SorobanResurrect } from '@soroban-resurrect/sdk'

const client = new SorobanResurrect({
  rpcUrl: 'https://soroban-testnet.stellar.org',
  networkPassphrase: 'Test SDF Network ; September 2015',
})
```

You pass two required options:
- **rpcUrl:** The Soroban RPC endpoint you're connecting to. This is where the SDK fetches ledger data.
- **networkPassphrase:** The network identifier. This ensures you're talking to the right chain.

You can also pass optional config like `timeout`, `restoreFee`, or `maxRestoreBatchSize` if you want to customize behavior. For now, the defaults work great.

### Step 3: Check If a Transaction Needs Restoration

The simplest way to use the SDK is to call `simulate` with your transaction XDR:

```typescript
const txXDR = /* your unsigned transaction XDR */
const { needsRestoration, archivedKeys } = await client.simulate(txXDR)

if (needsRestoration) {
  console.log(`Found ${archivedKeys.length} archived entries`)
}
```

The `simulate` method:
1. Sends your transaction to the RPC for simulation
2. Checks whether any required ledger entries are archived
3. Returns a result object with `needsRestoration: boolean` and a list of `archivedKeys`

If `needsRestoration` is false, your transaction is good to go—just sign and submit it.

If true, we need to restore before proceeding.

### Step 4: Restore Archived Keys

To restore the archived keys, use the `restore` method. You pass the transaction XDR, the source account, and a signing function:

```typescript
const restored = await client.restore(
  txXDR,
  sourceAccountID, // "G..." style
  async (xdr: string) => {
    // This callback is where YOU sign the transaction
    // Return the signed XDR
    return signWithYourWallet(xdr)
  }
)

console.log(`Restored ${restored.entriesRestored} entries`)
```

Behind the scenes, the SDK:
1. Builds one or more restore transactions containing the archived keys
2. Passes each to your signing function
3. Submits them to the chain
4. Waits for confirmation
5. Returns success when all restorations are complete

### Step 5: Submit the Original Transaction

Once restoration is complete, sign and submit your original transaction:

```typescript
const signedTx = await wallet.signTransaction(txXDR)
const submitResult = await client.getRpcServer().submitTransaction(signedTx)
console.log(`Original tx hash: ${submitResult.hash}`)
```

### Putting It Together: checkAndPrepare

If you want a one-shot method that handles all of this, use `checkAndPrepare`:

```typescript
const { restoreFailed, ...result } = await client.checkAndPrepare(
  txXDR,
  sourceAccountID,
  async (xdr: string) => signWithYourWallet(xdr)
)

if (restoreFailed) {
  console.error('Restoration failed:', result.error)
} else {
  console.log('Transaction is ready. Submit it with:', result.preparedTxXDR)
}
```

This does simulation, restoration (if needed), and returns a transaction ready to sign and submit.

### What We've Covered

- Installing the SDK
- Creating an SDK instance with RPC configuration
- Simulating a transaction to check for archived entries
- Restoring archived keys using a signing callback
- Understanding the flow from detection to restoration to submission

### Next Episode

In the next episode, we'll integrate this into React using the provider and hooks. We'll see how to make this seamless in a frontend app.

Thanks for watching!

---

## On-Screen Elements

- **Code blocks:** Show each code snippet as you narrate it
- **Terminal recording:** npm install command running
- **Flowchart (animated):**
  - Simulate TX → Archived Keys Found? → Restore → Submit Original TX
- **Key points (text overlay):**
  - "Install with npm"
  - "Create SDK instance with RPC URL"
  - "Use simulate() to detect archived entries"
  - "Use restore() to bring them back on-chain"

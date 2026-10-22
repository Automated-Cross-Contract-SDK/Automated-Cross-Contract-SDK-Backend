# Episode 4: Full Restoration-Aware dApp Walkthrough

**Duration:** 5 minutes (~750 words)

## Narration

In episodes 2 and 3, we learned the SDK's primitives. Now, let's build a complete example: a simple token swap dApp that handles TTL expiration gracefully.

### Our Example: Swap dApp

Imagine we're building a UI for swapping tokens on Soroban. Users connect a wallet, enter amounts, and click "Swap." Behind the scenes, we're calling a swap contract.

The catch: the user's balance entry or the liquidity pool state might be archived, which would cause the transaction to fail. We need to handle that transparently.

### Architecture Overview

Our dApp has three layers:
1. **UI layer:** React components with button and status display
2. **Transaction layer:** Building swap transactions
3. **SDK layer:** Using Soroban Resurrect to detect and restore

### Building the Transaction

First, let's write a function that builds a swap transaction:

```typescript
import { TransactionBuilder, Account, Operation, BASE_FEE } from '@stellar/stellar-sdk'

async function buildSwapTransaction(
  userAddress: string,
  tokenA: string,
  tokenB: string,
  amountA: string
): Promise<string> {
  // Fetch the user's account from the RPC
  const rpc = client.getRpcServer()
  const account = await rpc.getAccount(userAddress)

  // Build the transaction
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: 'Test SDF Network ; September 2015',
  })
    .addOperation(Operation.invokeHostFunction({
      hostFunction: xdr.HostFunction.hostFunctionTypeInvokeContract([
        /* contract invocation details */
      ]),
      auth: [],
    }))
    .setTimeout(300)
    .build()

  // Return the unsigned XDR
  return tx.toXDR()
}
```

### Creating the SwapButton Component

Now, let's create a React component that uses this:

```tsx
import { useSorobanResurrect } from '@soroban-resurrect/react'
import { useEffect, useState } from 'react'

function SwapButton({ userAddress, tokenA, tokenB, amountA, onSuccess }) {
  const sdk = useSorobanResurrect()
  const wallet = useWallet() // Your wallet hook
  
  const [state, setState] = useState('idle') // 'idle', 'checking', 'restoring', 'signing', 'submitting', 'done', 'error'
  const [message, setMessage] = useState('')
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    // Listen to SDK events and update state
    const unsubs = [
      sdk.on('restore:start', (keys) => {
        setState('restoring')
        setMessage(`Restoring ${keys.length} archived entries...`)
        setProgress(0)
      }),
      sdk.on('restore:batch:complete', (idx, total) => {
        setProgress(Math.round(((idx + 1) / total) * 100))
      }),
      sdk.on('restore:complete', () => {
        setState('signing')
        setMessage('Restore complete. Signing transaction...')
      }),
      sdk.on('error', (err) => {
        setState('error')
        setMessage(`Error: ${err.message}`)
      }),
    ]

    return () => unsubs.forEach(u => u())
  }, [sdk])

  const handleSwap = async () => {
    try {
      setState('checking')
      setMessage('Building and checking transaction...')

      // Build the swap transaction
      const txXDR = await buildSwapTransaction(userAddress, tokenA, tokenB, amountA)

      // Use SDK to detect and restore archived entries if needed
      const result = await sdk.checkAndPrepare(
        txXDR,
        userAddress,
        async (xdr) => {
          setState('signing')
          setMessage('Awaiting wallet signature...')
          return wallet.signTransaction(xdr)
        }
      )

      if (result.restoreFailed) {
        setState('error')
        setMessage('Failed to restore archived entries. Please try again.')
        return
      }

      // Submit the transaction
      setState('submitting')
      setMessage('Submitting transaction...')

      const rpc = sdk.getRpcServer()
      const submitResult = await rpc.submitTransaction(result.preparedTxXDR)

      setState('done')
      setMessage(`Transaction submitted! Hash: ${submitResult.hash}`)
      onSuccess(submitResult.hash)

    } catch (err) {
      setState('error')
      setMessage(`Unexpected error: ${err.message}`)
    }
  }

  const isLoading = ['checking', 'restoring', 'signing', 'submitting'].includes(state)
  const isError = state === 'error'

  return (
    <div className="swap-card">
      <h3>Swap Tokens</h3>
      <div className="swap-form">
        {/* Input fields for tokenA, tokenB, amountA */}
      </div>

      <button 
        onClick={handleSwap} 
        disabled={isLoading || isError}
        style={{ opacity: isLoading ? 0.6 : 1 }}
      >
        {isLoading ? 'Processing...' : 'Swap'}
      </button>

      {message && (
        <p className={`status ${isError ? 'error' : 'success'}`}>
          {message}
        </p>
      )}

      {progress > 0 && progress < 100 && (
        <progress value={progress} max={100} />
      )}
    </div>
  )
}
```

### The Full Flow

Here's what happens when the user clicks "Swap":

1. **Checking:** SDK simulates the transaction to see if it needs restoration.
2. **Restoring (if needed):** SDK builds and submits restore transactions. Our UI shows progress.
3. **Signing:** User signs the original swap transaction via their wallet.
4. **Submitting:** The signed swap transaction is sent to the chain.
5. **Done:** The transaction is confirmed, and the user sees the result.

If the data was archived and needed restoration, all of this happened transparently. The user just sees the progress updates.

### Error Handling

We've built in resilience:
- If restoration fails, we show an error and let the user retry.
- If the wallet signs, we proceed directly to submission.
- All errors are caught and displayed clearly.

### Customization

You can customize behavior via SDK config:
- **Custom fees:** Set `restoreFee` if you want to control how much to pay per restore.
- **Batch size:** Adjust `maxRestoreBatchSize` if you're restoring many keys.
- **Logging:** Provide an `onLog` callback to track what the SDK is doing.

### Key Takeaways

- Transaction building is the same as usual.
- `checkAndPrepare` handles detection and restoration.
- Listen to SDK events for real-time UI updates.
- Error handling ensures a smooth user experience.

### Next Episode

We've built a working dApp. In episode 5, we'll optimize it: batching, caching, and performance tuning to reduce costs and improve speed.

---

## On-Screen Elements

- **Code blocks:** Full component code displayed
- **State diagram:** idle → checking → restoring → signing → submitting → done
- **Progress bar animation:** Shows batch completion during restoration
- **UI mockup:** SwapButton component rendering with status messages
- **Key points (text overlay):**
  - "SDK handles detection and restoration"
  - "Listen to events for real-time updates"
  - "User sees transparent progress"
  - "Errors are handled gracefully"

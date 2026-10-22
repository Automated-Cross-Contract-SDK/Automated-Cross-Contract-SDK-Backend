# Episode 3: React Integration — Providers and Hooks

**Duration:** 4-5 minutes (~700 words)

## Narration

Welcome to episode 3. We've covered the core SDK, and now we're going to see how to integrate it seamlessly into a React application using the Soroban Resurrect React package.

### Why a React Package?

If you're building a browser dApp, you're probably using React. The core SDK works great, but having React-specific hooks and a context provider makes your code cleaner and more idiomatic.

The `@soroban-resurrect/react` package provides:
- A context provider to make the SDK instance available throughout your app
- Hooks to access SDK methods and listen to state changes
- Automatic cleanup when components unmount

### Step 1: Install the React Package

```bash
npm install @soroban-resurrect/react @soroban-resurrect/sdk
```

### Step 2: Wrap Your App with the Provider

In your root component or app shell, use the `SorobanResurrectProvider`:

```tsx
import { SorobanResurrectProvider } from '@soroban-resurrect/react'

function App() {
  return (
    <SorobanResurrectProvider
      rpcUrl="https://soroban-testnet.stellar.org"
      networkPassphrase="Test SDF Network ; September 2015"
    >
      <YourApp />
    </SorobanResurrectProvider>
  )
}
```

The provider takes the same RPC configuration as the core SDK. Once it's set up, any component inside can access the SDK via the `useSorobanResurrect` hook.

### Step 3: Use the Hook in Your Components

Here's a simple example—a button that checks and prepares a transaction:

```tsx
import { useSorobanResurrect } from '@soroban-resurrect/react'
import { useState } from 'react'

function SendButton() {
  const sdk = useSorobanResurrect()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)

  const handleSend = async () => {
    try {
      setIsLoading(true)
      const txXDR = buildMyTransaction() // Your logic

      const { restoreFailed, preparedTxXDR } = await sdk.checkAndPrepare(
        txXDR,
        mySourceAccountID,
        async (xdr) => {
          // Sign with wallet
          return wallet.sign(xdr)
        }
      )

      if (restoreFailed) {
        setError('Failed to restore archived entries')
      } else {
        // Submit preparedTxXDR
        submitToChain(preparedTxXDR)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div>
      <button onClick={handleSend} disabled={isLoading}>
        {isLoading ? 'Checking...' : 'Send Transaction'}
      </button>
      {error && <p style={{ color: 'red' }}>{error}</p>}
    </div>
  )
}
```

### Step 4: Listen to Lifecycle Events

The SDK emits events throughout the restoration process. You can listen using the `on` method:

```tsx
function RestorationStatus() {
  const sdk = useSorobanResurrect()
  const [status, setStatus] = useState('idle')
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    const unsubRestoreStart = sdk.on('restore:start', (keys) => {
      setStatus(`Restoring ${keys.length} archived entries...`)
    })

    const unsubBatchComplete = sdk.on('restore:batch:complete', (idx, total) => {
      setProgress(Math.round((idx / total) * 100))
    })

    const unsubRestoreComplete = sdk.on('restore:complete', () => {
      setStatus('Restoration complete!')
    })

    const unsubError = sdk.on('error', (err) => {
      setStatus(`Error: ${err.message}`)
    })

    return () => {
      unsubRestoreStart()
      unsubBatchComplete()
      unsubRestoreComplete()
      unsubError()
    }
  }, [sdk])

  return (
    <div>
      <p>{status}</p>
      {progress > 0 && <progress value={progress} max={100} />}
    </div>
  )
}
```

### Step 5: Using RxJS Observables (Advanced)

If you prefer RxJS, the SDK exposes `state$`, `progress$`, and `events$` observables:

```tsx
import { useEffect, useState } from 'react'

function RestorationProgress() {
  const sdk = useSorobanResurrect()
  const [percentage, setPercentage] = useState(0)

  useEffect(() => {
    const sub = sdk.progress$.pipe(
      map(p => Math.round((p.batchIndex / p.totalBatches) * 100))
    ).subscribe(pct => setPercentage(pct))

    return () => sub.unsubscribe()
  }, [sdk])

  return <progress value={percentage} max={100} />
}
```

### State Management Integration

If you're using Redux or Zustand, you can dispatch actions from SDK events:

```tsx
const unsub = sdk.on('restore:complete', (result) => {
  dispatch(restoreCompleted(result))
})
```

Or with Zustand:

```tsx
const unsub = sdk.on('error', (err) => {
  store.addError(err)
})
```

### What We've Covered

- Installing the React package
- Setting up the `SorobanResurrectProvider`
- Using the `useSorobanResurrect` hook
- Listening to lifecycle events
- Integrating with state management libraries
- Using RxJS observables for reactive updates

### Next Episode

Now that we know how to integrate restoration into React, let's see how to build a full dApp that handles restoration transparently for users.

---

## On-Screen Elements

- **Code blocks:** Each example displayed as you narrate
- **Component tree diagram:** App → Provider → Component with hook
- **Event flow diagram:** Transaction check → Restore start → Batch complete → Restore complete
- **Key points (text overlay):**
  - "SorobanResurrectProvider wraps your app"
  - "useSorobanResurrect gives you the SDK instance"
  - "Listen to events for UI updates"
  - "Works with Redux, Zustand, RxJS"

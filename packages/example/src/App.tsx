import { useState, useEffect, useCallback } from 'react'
import { SorobanResurrect } from '@soroban-resurrect/sdk'
import type { ExecutionResult } from '@soroban-resurrect/sdk'
import { SorobanResurrectProvider, useSorobanResurrect } from '@soroban-resurrect/react'

const RPC_URL = 'https://soroban-testnet.stellar.org'
const NETWORK_PASSPHRASE = 'Test SDF Network ; September 2015'

declare global {
  interface Window {
    freighter?: {
      isConnected: () => Promise<{ isConnected: boolean }>
      getPublicKey: () => Promise<string>
      signTransaction: (xdr: string, opts?: { networkPassphrase: string }) => Promise<string>
      getNetwork: () => Promise<{ network: string; networkPassphrase: string }>
    }
  }
}

function FreighterStatus({ publicKey, onConnect }: { publicKey: string | null; onConnect: () => void }) {
  return (
    <div style={{
      padding: '0.75rem 1rem',
      background: publicKey ? '#d4edda' : '#fff3cd',
      border: `1px solid ${publicKey ? '#c3e6cb' : '#ffc107'}`,
      borderRadius: 6,
      marginBottom: '1rem',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
    }}>
      <span>
        {publicKey
          ? `Connected: ${publicKey.slice(0, 8)}...${publicKey.slice(-4)}`
          : 'Freighter wallet not connected'}
      </span>
      {!publicKey && (
        <button
          onClick={onConnect}
          style={{
            padding: '0.375rem 0.75rem',
            background: '#ffc107',
            border: 'none',
            borderRadius: 4,
            cursor: 'pointer',
            fontWeight: 600,
          }}
        >
          Connect Freighter
        </button>
      )}
    </div>
  )
}

function WithdrawButton() {
  const {
    executeWithRestore,
    checkTransaction,
    isChecking,
    isExecuting,
    needsRestore,
    archivedKeys,
    lastResult,
    error,
    reset,
  } = useSorobanResurrect({
    rpcUrl: RPC_URL,
    networkPassphrase: NETWORK_PASSPHRASE,
    preFlight: {
      enabled: true,
      onRestoreNeeded: (keys) => {
        console.log(`Detected ${keys.length} archived entries`)
      },
      onRestoreComplete: (result) => {
        console.log('Restoration flow complete', result)
      },
    },
  })

  const [publicKey, setPublicKey] = useState<string | null>(null)
  const [txXDR, setTxXDR] = useState('')

  useEffect(() => {
    if (window.freighter) {
      window.freighter.isConnected().then((r) => {
        if (r.isConnected) {
          window.freighter!.getPublicKey().then(setPublicKey)
        }
      })
    }
  }, [])

  const connectFreighter = useCallback(async () => {
    if (!window.freighter) {
      alert('Please install Freighter wallet: https://freighter.app')
      return
    }
    try {
      const { isConnected } = await window.freighter.isConnected()
      if (!isConnected) {
        alert('Please unlock Freighter first')
        return
      }
      const pk = await window.freighter.getPublicKey()
      setPublicKey(pk)
    } catch (err) {
      console.error('Freighter connection failed:', err)
    }
  }, [])

  const signWithFreighter = useCallback(async (xdr: string): Promise<string> => {
    if (!window.freighter || !publicKey) {
      throw new Error('Freighter not connected')
    }
    return window.freighter.signTransaction(xdr, {
      networkPassphrase: NETWORK_PASSPHRASE,
    })
  }, [publicKey])

  const handlePreFlightCheck = async () => {
    reset()
    try {
      const result = await checkTransaction(txXDR)
      if (result.needsRestoration) {
        console.log(`Need to restore ${result.archivedKeys.length} archived entries`)
      } else {
        console.log('No restoration needed')
      }
    } catch (err) {
      console.error('Pre-flight failed:', err)
    }
  }

  const handleSubmit = async () => {
    if (!publicKey) {
      alert('Connect Freighter first')
      return
    }
    try {
      const result: ExecutionResult = await executeWithRestore(txXDR, signWithFreighter)
      if (result.success) {
        console.log(`Complete! Restored ${result.entriesRestored} entries`)
      }
    } catch (err) {
      console.error('Transaction failed:', err)
    }
  }

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ margin: 0 }}>Soroban-Resurrect</h1>
      <p style={{ color: '#666', marginTop: '0.25rem' }}>
        Automated Cross-Contract State Restoration
      </p>

      <FreighterStatus publicKey={publicKey} onConnect={connectFreighter} />

      <div style={{ marginBottom: '1rem' }}>
        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>
          Transaction XDR
        </label>
        <textarea
          value={txXDR}
          onChange={e => setTxXDR(e.target.value)}
          rows={4}
          style={{
            width: '100%',
            padding: '0.5rem',
            fontFamily: 'ui-monospace, monospace',
            fontSize: '0.875rem',
            borderRadius: 6,
            border: '1px solid #ccc',
          }}
          placeholder="Paste transaction XDR here..."
        />
      </div>

      {archivedKeys.length > 0 && (
        <div style={{
          padding: '1rem',
          background: '#fff3cd',
          border: '1px solid #ffc107',
          borderRadius: 6,
          marginBottom: '1rem',
        }}>
          <strong>Archived Entries Detected:</strong> {archivedKeys.length} key(s)
          <ul style={{ marginTop: '0.5rem', fontSize: '0.875rem' }}>
            {archivedKeys.map((k, i) => (
              <li key={i}>[{k.keyType}] {k.contractId ? k.contractId.slice(0, 16) + '...' : ''}</li>
            ))}
          </ul>
        </div>
      )}

      {error && (
        <div style={{
          padding: '1rem',
          background: '#f8d7da',
          border: '1px solid #f5c6cb',
          borderRadius: 6,
          marginBottom: '1rem',
          color: '#721c24',
        }}>
          {error}
        </div>
      )}

      {lastResult?.success && (
        <div style={{
          padding: '1rem',
          background: '#d4edda',
          border: '1px solid #c3e6cb',
          borderRadius: 6,
          marginBottom: '1rem',
          color: '#155724',
        }}>
          <strong>Success!</strong> Restored {lastResult.entriesRestored} entries.
          {lastResult.restoreTxHash && (
            <div style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>
              Restore tx: {lastResult.restoreTxHash.slice(0, 16)}...
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        <button
          onClick={handlePreFlightCheck}
          disabled={isChecking || isExecuting || !txXDR}
          style={btnStyle('#6c757d', isChecking || isExecuting)}
        >
          {isChecking ? 'Checking...' : 'Pre-Flight Check'}
        </button>

        <button
          onClick={handleSubmit}
          disabled={isChecking || isExecuting || !txXDR || !publicKey}
          style={btnStyle('#0d6efd', isChecking || isExecuting || !publicKey)}
        >
          {isExecuting
            ? needsRestore ? 'Restoring & Submitting...' : 'Submitting...'
            : needsRestore ? 'Submit with Restoration' : 'Submit Transaction'}
        </button>

        <button
          onClick={reset}
          disabled={isChecking || isExecuting}
          style={btnStyle('#6c757d', isChecking || isExecuting, true)}
        >
          Reset
        </button>
      </div>

      <div style={{ marginTop: '2rem', padding: '1rem', background: '#f8f9fa', borderRadius: 6 }}>
        <h3 style={{ margin: 0, fontSize: '1rem' }}>Status</h3>
        <pre style={{ fontSize: '0.8rem', marginTop: '0.5rem' }}>
          {JSON.stringify({ isChecking, isExecuting, needsRestore, archivedKeys: archivedKeys.length, connected: !!publicKey }, null, 2)}
        </pre>
      </div>
    </div>
  )
}

function btnStyle(bg: string, disabled: boolean, outline?: boolean): React.CSSProperties {
  const base: React.CSSProperties = {
    padding: '0.5rem 1.25rem',
    border: outline ? `1px solid ${bg}` : 'none',
    borderRadius: 6,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    fontWeight: 500,
  }
  if (outline) {
    return { ...base, background: 'transparent', color: bg }
  }
  return { ...base, background: bg, color: 'white' }
}

function App() {
  return (
    <SorobanResurrectProvider
      rpcUrl={RPC_URL}
      networkPassphrase={NETWORK_PASSPHRASE}
    >
      <WithdrawButton />
    </SorobanResurrectProvider>
  )
}

export default App

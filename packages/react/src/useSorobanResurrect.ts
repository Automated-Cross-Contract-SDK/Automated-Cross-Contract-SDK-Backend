'use client'

import { useState, useCallback, useRef } from 'react'
import { TransactionBuilder, Transaction } from '@stellar/stellar-sdk'
import { SorobanResurrect, SorobanResurrectError } from '@soroban-resurrect/sdk'
import type { SorobanResurrectConfig, ExecutionResult, ArchivedKey } from '@soroban-resurrect/sdk'
import type { UseSorobanResurrectOptions, UseSorobanResurrectReturn } from './types.js'

function parseSource(txXDR: string, networkPassphrase: string): string {
  try {
    const tx = TransactionBuilder.fromXDR(txXDR, networkPassphrase)
    if ('source' in tx) {
      return tx.source as string
    }
    return ''
  } catch {
    return ''
  }
}

function computeHash(signedXDR: string, networkPassphrase: string): string {
  try {
    const tx = new Transaction(signedXDR, networkPassphrase)
    return tx.hash().toString('hex')
  } catch {
    return ''
  }
}

export function useSorobanResurrect(options: UseSorobanResurrectOptions): UseSorobanResurrectReturn {
  const clientRef = useRef<SorobanResurrect | null>(null)

  const [isChecking, setIsChecking] = useState(false)
  const [isExecuting, setIsExecuting] = useState(false)
  const [lastResult, setLastResult] = useState<ExecutionResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [needsRestore, setNeedsRestore] = useState(false)
  const [archivedKeys, setArchivedKeys] = useState<ArchivedKey[]>([])

  const getClient = useCallback((): SorobanResurrect => {
    if (!clientRef.current) {
      const config: SorobanResurrectConfig = {
        rpcUrl: options.rpcUrl,
        networkPassphrase: options.networkPassphrase,
        allowHttp: options.allowHttp,
        onLog: (level, message) => {
          if (options.preFlight?.enabled ?? true) {
            if (level === 'error') console.error(`[SorobanResurrect] ${message}`)
            else console.debug(`[SorobanResurrect] ${message}`)
          }
        },
      }
      clientRef.current = new SorobanResurrect(config)
    }
    return clientRef.current
  }, [options.rpcUrl, options.networkPassphrase, options.allowHttp, options.preFlight?.enabled])

  const checkTransaction = useCallback(async (txXDR: string) => {
    setIsChecking(true)
    setError(null)
    try {
      const client = getClient()
      const result = await client.simulate(txXDR)

      setNeedsRestore(result.needsRestoration)
      setArchivedKeys(result.archivedKeys)

      if (result.needsRestoration) {
        options.preFlight?.onRestoreNeeded?.(result.archivedKeys)
      }

      return {
        needsRestoration: result.needsRestoration,
        archivedKeys: result.archivedKeys,
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
      const error = err instanceof Error ? err : new Error(message)
      options.onError?.(error)
      options.preFlight?.onError?.(error)
      throw err
    } finally {
      setIsChecking(false)
    }
  }, [getClient, options])

  const executeWithRestore = useCallback(async (
    txXDR: string,
    signTransaction: (xdr: string) => Promise<string>,
  ): Promise<ExecutionResult> => {
    setIsExecuting(true)
    setError(null)
    try {
      const client = getClient()

      const simulation = await client.simulate(txXDR)

      if (!simulation.needsRestoration) {
        const signedXDR = await signTransaction(txXDR)
        const hash = computeHash(signedXDR, options.networkPassphrase)
        const result: ExecutionResult = {
          success: true,
          originalTxHash: hash,
          entriesRestored: 0,
        }
        setLastResult(result)
        options.preFlight?.onRestoreComplete?.(result)
        return result
      }

      setNeedsRestore(true)
      setArchivedKeys(simulation.archivedKeys)
      options.preFlight?.onRestoreNeeded?.(simulation.archivedKeys)

      const accountID = parseSource(txXDR, options.networkPassphrase)
      const restoreTx = await client.buildRestoreTransaction(
        simulation.archivedKeys,
        accountID,
      )

      const result = await client.executeRestoreThenOriginal(
        restoreTx.transactionXDR,
        txXDR,
        async (xdr: string) => {
          const signed = await signTransaction(xdr)
          return signed
        },
      )

      setLastResult(result)
      options.preFlight?.onRestoreComplete?.(result)
      return result
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
      const error = err instanceof Error ? err : new Error(message)
      options.onError?.(error)
      options.preFlight?.onError?.(error)
      if (err instanceof SorobanResurrectError) throw err
      throw new SorobanResurrectError(message, 'ORIGINAL_TX_FAILED', err)
    } finally {
      setIsExecuting(false)
    }
  }, [getClient, options])

  const reset = useCallback(() => {
    setIsChecking(false)
    setIsExecuting(false)
    setLastResult(null)
    setError(null)
    setNeedsRestore(false)
    setArchivedKeys([])
  }, [])

  return {
    executeWithRestore,
    checkTransaction,
    isChecking,
    isExecuting,
    lastResult,
    error,
    needsRestore,
    archivedKeys,
    reset,
  }
}

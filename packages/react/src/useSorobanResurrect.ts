'use client'

import { useState, useCallback, useRef, useMemo } from 'react'
import { TransactionBuilder, Transaction } from '@stellar/stellar-sdk'
import { SorobanResurrect, SorobanResurrectError } from '@soroban-resurrect/sdk'
import type { SorobanResurrectConfig, ExecutionResult, ArchivedKey } from '@soroban-resurrect/sdk'
import type {
  UseSorobanResurrectOptions,
  UseSorobanResurrectReturn,
  SigningStrategy,
  TransactionRecord,
} from './types.js'

const DEFAULT_HISTORY_STORAGE_KEY = 'soroban-resurrect:history'

function resolveSigner(strategy: SigningStrategy | undefined): ((xdr: string) => Promise<string>) | undefined {
  if (!strategy) return undefined
  if (typeof strategy === 'function') return (xdr: string) => strategy(xdr)
  return (xdr: string) => strategy.signTransaction(xdr)
}

function generateId(): string {
  const cryptoObj = typeof globalThis !== 'undefined' ? (globalThis as any).crypto : undefined
  if (cryptoObj?.randomUUID) return cryptoObj.randomUUID()
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`
}

function loadHistory(storageKey: string | undefined): TransactionRecord[] {
  if (!storageKey || typeof window === 'undefined' || !window.localStorage) return []
  try {
    const raw = window.localStorage.getItem(storageKey)
    return raw ? (JSON.parse(raw) as TransactionRecord[]) : []
  } catch {
    return []
  }
}

function saveHistory(storageKey: string | undefined, history: TransactionRecord[]): void {
  if (!storageKey || typeof window === 'undefined' || !window.localStorage) return
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(history))
  } catch {
    // Ignore storage failures (quota exceeded, private browsing, etc.)
  }
}

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

type SimulationCacheEntry = {
  expiresAt: number
  simulation: {
    needsRestoration: boolean
    archivedKeys: ArchivedKey[]
  }
}

const CACHE_TTL_MS = 30_000

const IDLE_PROGRESS: RestoreProgress = {
  status: 'idle',
  currentBatch: 0,
  totalBatches: 0,
  keysRestored: 0,
  totalKeys: 0,
}

async function hashTxXDR(txXDR: string): Promise<string> {
  const cryptoObj = typeof globalThis !== 'undefined' ? (globalThis as any).crypto : undefined
  if (cryptoObj?.subtle?.digest) {
    const encoder = new TextEncoder()
    const buffer = await cryptoObj.subtle.digest('SHA-256', encoder.encode(txXDR))
    return Array.from(new Uint8Array(buffer)).map((byte: number) => byte.toString(16).padStart(2, '0')).join('')
  }

  let hash = 5381
  for (let i = 0; i < txXDR.length; i += 1) {
    hash = ((hash << 5) + hash) ^ txXDR.charCodeAt(i)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

export function useSorobanResurrect<TSigner extends SigningStrategy = SigningStrategy>(
  options: UseSorobanResurrectOptions<TSigner>,
): UseSorobanResurrectReturn<TSigner> {
  const clientRef = useRef<SorobanResurrect | null>(null)
  const simulationCacheRef = useRef<Map<string, SimulationCacheEntry>>(new Map())
  const abortControllerRef = useRef<AbortController | null>(null)

  const [isChecking, setIsChecking] = useState(false)
  const [isExecuting, setIsExecuting] = useState(false)
  const [lastResult, setLastResult] = useState<ExecutionResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [needsRestore, setNeedsRestore] = useState(false)
  const [archivedKeys, setArchivedKeys] = useState<ArchivedKey[]>([])
  const [isOptimistic, setIsOptimistic] = useState(false)
  const [progress, setProgress] = useState<RestoreProgress>(IDLE_PROGRESS)

  const historyStorageKey = options.persistHistory
    ? (typeof options.persistHistory === 'string' ? options.persistHistory : DEFAULT_HISTORY_STORAGE_KEY)
    : undefined
  const [history, setHistory] = useState<TransactionRecord[]>(() => loadHistory(historyStorageKey))

  const addHistoryRecord = useCallback((record: TransactionRecord) => {
    setHistory((prev) => {
      const next = [...prev, record]
      saveHistory(historyStorageKey, next)
      return next
    })
  }, [historyStorageKey])

  const clearHistory = useCallback(() => {
    setHistory([])
    saveHistory(historyStorageKey, [])
  }, [historyStorageKey])

  // Stabilize onLog so it doesn't trigger config re-memoization when options change
  const preFlightEnabled = options.preFlight?.enabled ?? true
  const onLog = useCallback<NonNullable<SorobanResurrectConfig['onLog']>>(
    (level, message) => {
      if (preFlightEnabled) {
        if (level === 'error') console.error(`[SorobanResurrect] ${message}`)
        else console.debug(`[SorobanResurrect] ${message}`)
      }
    },
    [preFlightEnabled],
  )

  // Memoize the config object so SorobanResurrect is only re-instantiated when
  // connection-relevant options actually change.
  const config = useMemo<SorobanResurrectConfig>(
    () => ({
      rpcUrl: options.rpcUrl,
      networkPassphrase: options.networkPassphrase,
      allowHttp: options.allowHttp,
      timeout: options.timeout,
      pollIntervalMs: options.pollIntervalMs,
      maxPollAttempts: options.maxPollAttempts,
      onLog,
    }),
    [options.rpcUrl, options.networkPassphrase, options.allowHttp, options.timeout, options.pollIntervalMs, options.maxPollAttempts, onLog],
  )

  // Re-instantiate SorobanResurrect only when the memoized config changes
  const getClient = useCallback((): SorobanResurrect => {
    if (!clientRef.current) {
      clientRef.current = new SorobanResurrect(config)
    }
    return clientRef.current
  }, [config])

  // When config changes (rpcUrl, passphrase, etc.) we need a fresh client instance
  const prevConfigRef = useRef<SorobanResurrectConfig | null>(null)
  if (prevConfigRef.current !== config) {
    prevConfigRef.current = config
    clientRef.current = null // force re-instantiation on next getClient() call
    simulationCacheRef.current.clear()
  }

  const getCachedSimulation = useCallback(async (txXDR: string, forceRefresh = false) => {
    const cacheKey = await hashTxXDR(txXDR)
    if (!forceRefresh) {
      const cached = simulationCacheRef.current.get(cacheKey)
      if (cached && cached.expiresAt > Date.now()) {
        return cached.simulation
      }
    }

    const client = getClient()
    const simulation = await client.simulate(txXDR)
    simulationCacheRef.current.set(cacheKey, {
      simulation: {
        needsRestoration: simulation.needsRestoration,
        archivedKeys: simulation.archivedKeys,
      },
      expiresAt: Date.now() + CACHE_TTL_MS,
    })
    return simulation
  }, [getClient])

  const checkTransaction = useCallback(async (
    txXDR: string,
    { forceRefresh = false }: { forceRefresh?: boolean } = {},
  ) => {
    setIsChecking(true)
    setError(null)
    try {
      const result = await getCachedSimulation(txXDR, forceRefresh)

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

  const abort = useCallback(() => {
    abortControllerRef.current?.abort()
  }, [])

  const executeWithRestore = useCallback(async (
    txXDR: string,
    signTransaction?: (xdr: string) => Promise<string>,
    { forceRefresh = false }: { forceRefresh?: boolean } = {},
  ): Promise<ExecutionResult> => {
    const sign = signTransaction ?? resolveSigner(options.signingStrategy)
    if (!sign) {
      throw new Error(
        'executeWithRestore requires a signTransaction argument or a signingStrategy option',
      )
    }

    const startedAt = Date.now()
    setIsExecuting(true)
    setError(null)
    setProgress({ ...IDLE_PROGRESS, status: 'checking' })

    const client = getClient()
    let listeners: Array<[string, (...args: any[]) => void]> = []
    const addListener = (event: string, listener: (...args: any[]) => void) => {
      listeners.push([event, listener])
      ;(client as any).on(event, listener)
    }
    const removeListeners = () => {
      for (const [event, listener] of listeners) (client as any).off(event, listener)
      listeners = []
    }

    try {
      const simulation = await getCachedSimulation(txXDR, forceRefresh)
      throwIfAborted()

      if (!simulation.needsRestoration) {
        const signedXDR = await sign(txXDR)
        const hash = computeHash(signedXDR, options.networkPassphrase)
        const result: ExecutionResult = {
          success: true,
          originalTxHash: hash,
          entriesRestored: 0,
        }
        setLastResult(result)
        setProgress(p => ({ ...p, status: 'done' }))
        options.preFlight?.onRestoreComplete?.(result)
        addHistoryRecord({
          id: generateId(),
          originalTxHash: result.originalTxHash,
          archivedKeys: [],
          status: 'success',
          timestamp: startedAt,
          durationMs: Date.now() - startedAt,
        })
        return result
      }

      setNeedsRestore(true)
      setArchivedKeys(simulation.archivedKeys)
      options.preFlight?.onRestoreNeeded?.(simulation.archivedKeys)

      setProgress({
        status: 'restoring',
        currentBatch: 0,
        totalBatches: 0,
        keysRestored: 0,
        totalKeys: simulation.archivedKeys.length,
      })

      if (optimisticEnabled) {
        setLastResult({
          success: true,
          entriesRestored: simulation.archivedKeys.length,
        })
        setIsOptimistic(true)
      }

      const batchStartTime = Date.now()
      addListener('restore:batch:complete', (batchIndex: number, totalBatches: number) => {
        const completed = batchIndex + 1
        const elapsed = Date.now() - batchStartTime
        const avgPerBatch = elapsed / completed
        const remainingBatches = Math.max(totalBatches - completed, 0)
        setProgress(p => ({
          ...p,
          currentBatch: completed,
          totalBatches,
          estimatedTimeRemainingMs: Math.round(avgPerBatch * remainingBatches),
        }))
      })
      addListener('restore:complete', (result: { keysRestored: number }) => {
        setProgress(p => ({ ...p, keysRestored: result.keysRestored }))
      })
      addListener('original:start', () => {
        setProgress(p => ({ ...p, status: 'submitting', estimatedTimeRemainingMs: 0 }))
      })

      const accountID = parseSource(txXDR, options.networkPassphrase)
      const restoreTx = await client.buildRestoreTransaction(
        simulation.archivedKeys,
        accountID,
      )
      throwIfAborted()

      const result = await client.executeRestoreThenOriginal(
        restoreTx.transactionXDR,
        txXDR,
        async (xdr: string) => {
          const signed = await sign(xdr)
          return signed
        },
      )
      throwIfAborted()

      setLastResult(result)
      setIsOptimistic(false)
      setProgress(p => ({ ...p, status: 'done', keysRestored: restoreTx.keysRestored }))
      options.preFlight?.onRestoreComplete?.(result)
      addHistoryRecord({
        id: generateId(),
        originalTxHash: result.originalTxHash,
        restoreTxHash: result.restoreTxHash,
        archivedKeys: simulation.archivedKeys,
        status: result.success ? 'success' : 'failed',
        error: result.error,
        timestamp: startedAt,
        durationMs: Date.now() - startedAt,
      })
      return result
    } catch (err) {
      const aborted = err instanceof SorobanResurrectError && err.code === 'ABORTED'
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
      setProgress(p => ({ ...p, status: 'error' }))

      if (optimisticEnabled) {
        setLastResult(prevLastResult)
        setIsOptimistic(false)
      }
      if (aborted) {
        setNeedsRestore(prevNeedsRestore)
        setArchivedKeys(prevArchivedKeys)
      }

      const error = err instanceof Error ? err : new Error(message)
      options.onError?.(error)
      options.preFlight?.onError?.(error)
      addHistoryRecord({
        id: generateId(),
        archivedKeys,
        status: 'failed',
        error: message,
        timestamp: startedAt,
        durationMs: Date.now() - startedAt,
      })
      if (err instanceof SorobanResurrectError) throw err
      throw new SorobanResurrectError(message, 'ORIGINAL_TX_FAILED', err)
    } finally {
      removeListeners()
      if (abortControllerRef.current === controller) abortControllerRef.current = null
      setIsExecuting(false)
    }
  }, [getClient, options, addHistoryRecord, archivedKeys])

  const reset = useCallback(() => {
    setIsChecking(false)
    setIsExecuting(false)
    setLastResult(null)
    setError(null)
    setNeedsRestore(false)
    setArchivedKeys([])
    setIsOptimistic(false)
    setProgress(IDLE_PROGRESS)
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
    signer: options.signingStrategy,
    history,
    clearHistory,
  }
}

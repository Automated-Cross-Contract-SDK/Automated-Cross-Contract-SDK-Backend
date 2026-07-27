import { writable, derived } from 'svelte/store'
import { Transaction, TransactionBuilder } from '@stellar/stellar-sdk'
import { SorobanResurrect, SorobanResurrectError } from '@soroban-resurrect/sdk'
import type { SorobanResurrectConfig, ExecutionResult, ArchivedKey } from '@soroban-resurrect/sdk'
import type { UseSorobanResurrectOptions, SorobanResurrectStores } from './types.js'

function parseSource(txXDR: string, networkPassphrase: string): string {
  try {
    const tx = TransactionBuilder.fromXDR(txXDR, networkPassphrase)
    return 'source' in tx ? (tx.source as string) : ''
  } catch {
    return ''
  }
}

function computeHash(signedXDR: string, networkPassphrase: string): string {
  try {
    return new Transaction(signedXDR, networkPassphrase).hash().toString('hex')
  } catch {
    return ''
  }
}

export function useSorobanResurrect(options: UseSorobanResurrectOptions): SorobanResurrectStores {
  let client: SorobanResurrect | null = null

  const isChecking = writable(false)
  const isExecuting = writable(false)
  const lastResult = writable<ExecutionResult | null>(null)
  const error = writable<string | null>(null)
  const needsRestore = writable(false)
  const archivedKeys = writable<ArchivedKey[]>([])

  function getClient(): SorobanResurrect {
    if (!client) {
      const config: SorobanResurrectConfig = {
        rpcUrl: options.rpcUrl,
        networkPassphrase: options.networkPassphrase,
        allowHttp: options.allowHttp,
        timeout: options.timeout,
        onLog: (level, message) => {
          if (options.preFlight?.enabled ?? true) {
            if (level === 'error') console.error(`[SorobanResurrect] ${message}`)
            else console.debug(`[SorobanResurrect] ${message}`)
          }
        },
      }
      client = new SorobanResurrect(config)
    }
    return client
  }

  async function checkTransaction(txXDR: string) {
    isChecking.set(true)
    error.set(null)
    try {
      const c = getClient()
      const result = await c.simulate(txXDR)
      needsRestore.set(result.needsRestoration)
      archivedKeys.set(result.archivedKeys)
      if (result.needsRestoration) {
        options.preFlight?.onRestoreNeeded?.(result.archivedKeys)
      }
      return { needsRestoration: result.needsRestoration, archivedKeys: result.archivedKeys }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      error.set(message)
      const e = err instanceof Error ? err : new Error(message)
      options.onError?.(e)
      options.preFlight?.onError?.(e)
      throw err
    } finally {
      isChecking.set(false)
    }
  }

  async function executeWithRestore(
    txXDR: string,
    signTransaction: (xdr: string) => Promise<string>,
  ): Promise<ExecutionResult> {
    isExecuting.set(true)
    error.set(null)
    try {
      const c = getClient()
      const simulation = await c.simulate(txXDR)

      if (!simulation.needsRestoration) {
        const signedXDR = await signTransaction(txXDR)
        const hash = computeHash(signedXDR, options.networkPassphrase)
        const result: ExecutionResult = { success: true, originalTxHash: hash, entriesRestored: 0 }
        lastResult.set(result)
        options.preFlight?.onRestoreComplete?.(result)
        return result
      }

      needsRestore.set(true)
      archivedKeys.set(simulation.archivedKeys)
      options.preFlight?.onRestoreNeeded?.(simulation.archivedKeys)

      const accountID = parseSource(txXDR, options.networkPassphrase)
      const restoreTx = await c.buildRestoreTransaction(simulation.archivedKeys, accountID)

      const result = await c.executeRestoreThenOriginal(
        restoreTx.transactionXDR,
        txXDR,
        async (xdr: string) => signTransaction(xdr),
      )

      lastResult.set(result)
      options.preFlight?.onRestoreComplete?.(result)
      return result
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      error.set(message)
      const e = err instanceof Error ? err : new Error(message)
      options.onError?.(e)
      options.preFlight?.onError?.(e)
      if (err instanceof SorobanResurrectError) throw err
      throw new SorobanResurrectError(message, 'ORIGINAL_TX_FAILED', err)
    } finally {
      isExecuting.set(false)
    }
  }

  function reset() {
    isChecking.set(false)
    isExecuting.set(false)
    lastResult.set(null)
    error.set(null)
    needsRestore.set(false)
    archivedKeys.set([])
  }

  return {
    isChecking: derived(isChecking, (v) => v),
    isExecuting: derived(isExecuting, (v) => v),
    lastResult: derived(lastResult, (v) => v),
    error: derived(error, (v) => v),
    needsRestore: derived(needsRestore, (v) => v),
    archivedKeys: derived(archivedKeys, (v) => v),
    checkTransaction,
    executeWithRestore,
    reset,
  }
}

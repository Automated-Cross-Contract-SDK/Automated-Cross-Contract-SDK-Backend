import { ref, shallowRef, computed, watch, type Ref } from 'vue'
import { Transaction, TransactionBuilder } from '@stellar/stellar-sdk'
import { SorobanResurrect, SorobanResurrectError } from '@soroban-resurrect/sdk'
import type { SorobanResurrectConfig, ExecutionResult, ArchivedKey } from '@soroban-resurrect/sdk'
import type { UseSorobanResurrectOptions, UseSorobanResurrectReturn } from '../types.js'

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

export function useSorobanResurrect(options: UseSorobanResurrectOptions): UseSorobanResurrectReturn {
  const clientRef = shallowRef<SorobanResurrect | null>(null)

  const isChecking = ref(false)
  const isExecuting = ref(false)
  const lastResult: Ref<ExecutionResult | null> = ref(null)
  const error: Ref<string | null> = ref(null)
  const needsRestore = ref(false)
  const archivedKeys: Ref<ArchivedKey[]> = ref([])

  const config = computed<SorobanResurrectConfig>(() => ({
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
  }))

  watch(config, () => {
    clientRef.value = null
  })

  function getClient(): SorobanResurrect {
    if (!clientRef.value) {
      clientRef.value = new SorobanResurrect(config.value)
    }
    return clientRef.value
  }

  async function checkTransaction(txXDR: string) {
    isChecking.value = true
    error.value = null
    try {
      const client = getClient()
      const result = await client.simulate(txXDR)
      needsRestore.value = result.needsRestoration
      archivedKeys.value = result.archivedKeys
      if (result.needsRestoration) {
        options.preFlight?.onRestoreNeeded?.(result.archivedKeys)
      }
      return { needsRestoration: result.needsRestoration, archivedKeys: result.archivedKeys }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      error.value = message
      const e = err instanceof Error ? err : new Error(message)
      options.onError?.(e)
      options.preFlight?.onError?.(e)
      throw err
    } finally {
      isChecking.value = false
    }
  }

  async function executeWithRestore(
    txXDR: string,
    signTransaction: (xdr: string) => Promise<string>,
  ): Promise<ExecutionResult> {
    isExecuting.value = true
    error.value = null
    try {
      const client = getClient()
      const simulation = await client.simulate(txXDR)

      if (!simulation.needsRestoration) {
        const signedXDR = await signTransaction(txXDR)
        const hash = computeHash(signedXDR, options.networkPassphrase)
        const result: ExecutionResult = { success: true, originalTxHash: hash, entriesRestored: 0 }
        lastResult.value = result
        options.preFlight?.onRestoreComplete?.(result)
        return result
      }

      needsRestore.value = true
      archivedKeys.value = simulation.archivedKeys
      options.preFlight?.onRestoreNeeded?.(simulation.archivedKeys)

      const accountID = parseSource(txXDR, options.networkPassphrase)
      const restoreTx = await client.buildRestoreTransaction(simulation.archivedKeys, accountID)

      const result = await client.executeRestoreThenOriginal(
        restoreTx.transactionXDR,
        txXDR,
        async (xdr: string) => signTransaction(xdr),
      )

      lastResult.value = result
      options.preFlight?.onRestoreComplete?.(result)
      return result
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      error.value = message
      const e = err instanceof Error ? err : new Error(message)
      options.onError?.(e)
      options.preFlight?.onError?.(e)
      if (err instanceof SorobanResurrectError) throw err
      throw new SorobanResurrectError(message, 'ORIGINAL_TX_FAILED', err)
    } finally {
      isExecuting.value = false
    }
  }

  function reset() {
    isChecking.value = false
    isExecuting.value = false
    lastResult.value = null
    error.value = null
    needsRestore.value = false
    archivedKeys.value = []
  }

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

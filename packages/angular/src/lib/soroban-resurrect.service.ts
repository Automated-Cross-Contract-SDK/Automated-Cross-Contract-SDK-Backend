import { Injectable, signal, type Signal } from '@angular/core'
import { Transaction, TransactionBuilder } from '@stellar/stellar-sdk'
import { SorobanResurrect, SorobanResurrectError } from '@soroban-resurrect/sdk'
import type { SorobanResurrectConfig, ExecutionResult, ArchivedKey } from '@soroban-resurrect/sdk'

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

@Injectable({ providedIn: 'root' })
export class SorobanResurrectService {
  private client: SorobanResurrect | null = null
  private networkPassphrase = ''

  private readonly _isChecking = signal(false)
  private readonly _isExecuting = signal(false)
  private readonly _lastResult = signal<ExecutionResult | null>(null)
  private readonly _error = signal<string | null>(null)
  private readonly _needsRestore = signal(false)
  private readonly _archivedKeys = signal<ArchivedKey[]>([])

  readonly isChecking: Signal<boolean> = this._isChecking.asReadonly()
  readonly isExecuting: Signal<boolean> = this._isExecuting.asReadonly()
  readonly lastResult: Signal<ExecutionResult | null> = this._lastResult.asReadonly()
  readonly error: Signal<string | null> = this._error.asReadonly()
  readonly needsRestore: Signal<boolean> = this._needsRestore.asReadonly()
  readonly archivedKeys: Signal<ArchivedKey[]> = this._archivedKeys.asReadonly()

  configure(config: SorobanResurrectConfig): void {
    this.networkPassphrase = config.networkPassphrase
    this.client = new SorobanResurrect(config)
  }

  private getClient(): SorobanResurrect {
    if (!this.client) {
      throw new Error('SorobanResurrectService.configure() must be called before use')
    }
    return this.client
  }

  async checkTransaction(txXDR: string): Promise<{ needsRestoration: boolean; archivedKeys: ArchivedKey[] }> {
    this._isChecking.set(true)
    this._error.set(null)
    try {
      const client = this.getClient()
      const result = await client.simulate(txXDR)
      this._needsRestore.set(result.needsRestoration)
      this._archivedKeys.set(result.archivedKeys)
      return { needsRestoration: result.needsRestoration, archivedKeys: result.archivedKeys }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      this._error.set(message)
      throw err
    } finally {
      this._isChecking.set(false)
    }
  }

  async executeWithRestore(
    txXDR: string,
    signTransaction: (xdr: string) => Promise<string>,
  ): Promise<ExecutionResult> {
    this._isExecuting.set(true)
    this._error.set(null)
    try {
      const client = this.getClient()
      const simulation = await client.simulate(txXDR)

      if (!simulation.needsRestoration) {
        const signedXDR = await signTransaction(txXDR)
        const hash = computeHash(signedXDR, this.networkPassphrase)
        const result: ExecutionResult = { success: true, originalTxHash: hash, entriesRestored: 0 }
        this._lastResult.set(result)
        return result
      }

      this._needsRestore.set(true)
      this._archivedKeys.set(simulation.archivedKeys)

      const accountID = parseSource(txXDR, this.networkPassphrase)
      const restoreTx = await client.buildRestoreTransaction(simulation.archivedKeys, accountID)

      const result = await client.executeRestoreThenOriginal(
        restoreTx.transactionXDR,
        txXDR,
        async (xdr: string) => signTransaction(xdr),
      )

      this._lastResult.set(result)
      return result
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      this._error.set(message)
      if (err instanceof SorobanResurrectError) throw err
      throw new SorobanResurrectError(message, 'ORIGINAL_TX_FAILED', err)
    } finally {
      this._isExecuting.set(false)
    }
  }

  reset(): void {
    this._isChecking.set(false)
    this._isExecuting.set(false)
    this._lastResult.set(null)
    this._error.set(null)
    this._needsRestore.set(false)
    this._archivedKeys.set([])
  }
}

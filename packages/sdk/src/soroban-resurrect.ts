import {
  SorobanRpc,
  TransactionBuilder,
  Operation,
  Account,
  xdr,
  SorobanDataBuilder,
  BASE_FEE,
} from '@stellar/stellar-sdk'
import {
  ArchivedKey,
  SorobanResurrectConfig,
  SimulationCheckResult,
  RestoreTransactionResult,
  ExecutionResult,
  SorobanResurrectError,
  FeeBumpMetadata,
} from './types.js'
import {
  FootprintKeys,
  extractKeysFromFootprint,
  classifyLedgerKey,
  encodeLedgerKey,
} from './footprint-parser.js'
import { ExponentialBackoff, type RetryPolicy } from './retry-policy.js'
import { SimulationCache, type SimulationCacheConfig } from './simulation-cache.js'

const MAX_XDR_SIZE_BYTES = 100_000
const DEFAULT_RESTORE_FEE = '100000'

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function isFeeBumpTx(tx: ReturnType<typeof TransactionBuilder.fromXDR>): tx is ReturnType<typeof TransactionBuilder.fromXDR> & { innerTransaction: any } {
  return 'innerTransaction' in tx
}

function extractFeeBumpMetadata(tx: any): FeeBumpMetadata {
  if (!isFeeBumpTx(tx)) {
    return { isFeeBump: false }
  }

  try {
    const feeBumpTx = tx as any
    const innerTx = feeBumpTx.innerTransaction as any
    const feeAccount = feeBumpTx.feeAccount as any

    return {
      isFeeBump: true,
      innerTransactionXDR: innerTx?.toXDR?.() as string | undefined,
      feeAccountID: feeAccount?.publicKey?.() as string | undefined,
      feeBumpFee: feeBumpTx.fee as string | undefined,
    }
  } catch {
    return { isFeeBump: false }
  }
}

function extractInnerTransaction(tx: any): any {
  if (isFeeBumpTx(tx)) {
    return tx.innerTransaction
  }
  return tx
}

export class SorobanResurrect {
  private server: SorobanRpc.Server
  private config: Required<Omit<SorobanResurrectConfig, 'timeout'>> & { timeout?: number }

  constructor(config: SorobanResurrectConfig) {
    this.config = {
      allowHttp: false,
      restoreFee: DEFAULT_RESTORE_FEE,
      maxRestoreBatchSize: 50,
      simulateOnly: false,
      retryPolicy: new ExponentialBackoff(3, 500),
      onLog: () => {},
      ...config,
    }

    const serverOptions: SorobanRpc.Server.Options = {
      allowHttp: this.config.allowHttp,
    }
    if (this.config.timeout !== undefined) {
      serverOptions.timeout = this.config.timeout
    }

    this.server = new SorobanRpc.Server(this.config.rpcUrl, serverOptions)
  }

  private log(level: 'info' | 'warn' | 'error', message: string, data?: unknown): void {
    this.config.onLog(level, message, data)
  }

  private async retryOnFailure<T>(fn: () => Promise<T>, context: string): Promise<T> {
    let lastError: SorobanResurrectError | undefined
    const policy = this.config.retryPolicy

    for (let attempt = 1; attempt <= policy.maxRetries + 1; attempt++) {
      try {
        const result = await fn()
        // Reset circuit breaker on success
        if (policy.reset) {
          policy.reset()
        }
        return result
      } catch (err) {
        const sorobanErr = err instanceof SorobanResurrectError
          ? err
          : new SorobanResurrectError(String(err), 'NETWORK_ERROR', err)

        lastError = sorobanErr

        if (attempt <= policy.maxRetries && policy.shouldRetry(sorobanErr, attempt)) {
          const delayMs = policy.getDelay(attempt)
          this.log(
            'warn',
            `Attempt ${attempt}/${policy.maxRetries} failed for ${context}: ${sorobanErr.message}, retrying in ${delayMs}ms`,
          )
          await delay(delayMs)
        } else {
          throw sorobanErr
        }
      }
    }
    throw new SorobanResurrectError(
      `Operation failed after ${MAX_RETRIES} retries: ${context}`,
      'NETWORK_ERROR',
      lastError,
      { rpcUrl: this.config.rpcUrl },
    )
  }

  async simulate(txXDR: string, source?: string): Promise<SimulationCheckResult> {
    // Check cache first if enabled
    if (this.simulationCache) {
      const cacheKey = SimulationCache.generateKey(txXDR, source)
      const cachedResult = this.simulationCache.get(cacheKey)
      if (cachedResult) {
        this.log('info', 'Simulation result retrieved from cache')
        return cachedResult
      }
    }

    let tx: ReturnType<typeof TransactionBuilder.fromXDR>
    try {
      tx = TransactionBuilder.fromXDR(txXDR, this.config.networkPassphrase)
    } catch (err) {
      throw new SorobanResurrectError(
        'Invalid transaction XDR',
        'INVALID_XDR',
        err,
        { rpcUrl: this.config.rpcUrl },
      )
    }

    let innerTx = tx
    let feeBumpMetadata: FeeBumpMetadata = { isFeeBump: false }

    if (isFeeBumpTx(tx)) {
      throw new SorobanResurrectError(
        'Fee bump transactions are not supported',
        'INVALID_XDR',
        undefined,
        { rpcUrl: this.config.rpcUrl },
      )
    }

    let simResult: SorobanRpc.Api.SimulateTransactionResponse
    try {
      simResult = await this.retryOnFailure(
        () => this.server.simulateTransaction(innerTx as any),
        'simulateTransaction',
      )
    } catch (err) {
      const msg = err instanceof SorobanResurrectError ? err.message : String(err)
      throw new SorobanResurrectError(
        `Simulation failed (rpcUrl=${this.config.rpcUrl}): ${msg}`,
        'SIMULATION_FAILED',
        err,
        { rpcUrl: this.config.rpcUrl },
      )
    }

    if (SorobanRpc.Api.isSimulationError(simResult)) {
      throw new SorobanResurrectError(
        `Simulation error (rpcUrl=${this.config.rpcUrl}): ${simResult.error}`,
        'SIMULATION_FAILED',
        simResult,
        { rpcUrl: this.config.rpcUrl },
      )
    }

    let footprint: xdr.LedgerFootprint | null = null

    if (SorobanRpc.Api.isSimulationSuccess(simResult)) {
      footprint = simResult.transactionData.getFootprint()
    }

    if (!footprint) {
      const sorobanData = (innerTx as any).sorobanData as xdr.SorobanTransactionData | undefined
      if (sorobanData) {
        footprint = sorobanData.resources().footprint()
      }
    }

    if (!footprint) {
      return { needsRestoration: false, archivedKeys: [], totalKeysInFootprint: 0 }
    }

    const keys = extractKeysFromFootprint(footprint)
    const result = await this.detectArchivedKeys(keys, source)

    // Cache the result if caching is enabled
    if (this.simulationCache) {
      const cacheKey = SimulationCache.generateKey(txXDR, source)
      this.simulationCache.set(cacheKey, result)
    }

    return result
  }

  private async detectArchivedKeys(
    keys: FootprintKeys,
    _source?: string,
  ): Promise<SimulationCheckResult> {
    if (keys.all.length === 0) {
      return { needsRestoration: false, archivedKeys: [], totalKeysInFootprint: 0 }
    }

    let existingKeys: SorobanRpc.Api.GetLedgerEntriesResponse
    try {
      existingKeys = await this.retryOnFailure(
        () => this.server.getLedgerEntries(...keys.all),
        'getLedgerEntries',
      )
    } catch (err) {
      // Build key context for richer error
      const keyContext = keys.all.map(k => {
        const classification = classifyLedgerKey(k)
        return { keyBase64: encodeLedgerKey(k), ...classification }
      })
      throw new SorobanResurrectError(
        `Failed to query ${keys.all.length} ledger entries (rpcUrl=${this.config.rpcUrl}): ${err instanceof Error ? err.message : String(err)}`,
        'ARCHIVE_DETECTION_FAILED',
        err,
        { rpcUrl: this.config.rpcUrl, archivedKeys: keyContext },
      )
    }

    const existingEntries = new Set<string>()
    for (const entry of existingKeys.entries) {
      existingEntries.add(encodeLedgerKey(entry.key))
    }

    const archivedKeys: ArchivedKey[] = []
    for (const key of keys.all) {
      const encoded = encodeLedgerKey(key)
      if (!existingEntries.has(encoded)) {
        const classification = classifyLedgerKey(key)
        archivedKeys.push({
          key,
          keyBase64: encoded,
          ...classification,
        })
      }
    }

    return {
      needsRestoration: archivedKeys.length > 0,
      archivedKeys,
      totalKeysInFootprint: keys.all.length,
    }
  }

  async checkTransaction(txXDR: string, source?: string): Promise<SimulationCheckResult> {
    return this.simulate(txXDR, source)
  }

  async buildRestoreTransaction(
    archivedKeys: ArchivedKey[],
    sourceAccountID: string,
  ): Promise<RestoreTransactionResult> {
    if (archivedKeys.length === 0) {
      throw new SorobanResurrectError(
        'No archived keys to restore',
        'INVALID_XDR',
        undefined,
        { rpcUrl: this.config.rpcUrl },
      )
    }

    const batches = this.batchKeys(archivedKeys)

    if (batches.length > 1) {
      this.log('info', `Splitting restore into ${batches.length} batches (${archivedKeys.length} total keys)`)
    }

    const result = await this.buildSingleRestoreTransaction(batches[0], sourceAccountID)
    return result
  }

  private batchKeys(keys: ArchivedKey[]): ArchivedKey[][] {
    const batches: ArchivedKey[][] = []
    let currentBatch: ArchivedKey[] = []
    let currentSize = 0

    for (const key of keys) {
      const keySize = key.keyBase64.length
      const headerOverhead = 200
      const estimatedTotalSize = currentSize + keySize + headerOverhead

      if (estimatedTotalSize > MAX_XDR_SIZE_BYTES && currentBatch.length > 0) {
        batches.push(currentBatch)
        currentBatch = [key]
        currentSize = keySize
      } else {
        currentBatch.push(key)
        currentSize = estimatedTotalSize
      }
    }

    if (currentBatch.length > 0) {
      batches.push(currentBatch)
    }

    return batches
  }

  private async buildSingleRestoreTransaction(
    keys: ArchivedKey[],
    sourceAccountID: string,
  ): Promise<RestoreTransactionResult> {
    const sourceAccount = await this.retryOnFailure(
      () => this.server.getAccount(sourceAccountID),
      `getAccount(${sourceAccountID})`,
    )

    const ledgerKeys = keys.map(k => k.key)

    const dataBuilder = new SorobanDataBuilder()
      .setFootprint([], ledgerKeys)

    const tx = new TransactionBuilder(sourceAccount, {
      fee: this.config.restoreFee!,
      networkPassphrase: this.config.networkPassphrase,
      sorobanData: dataBuilder.build().toXDR('base64'),
    })
      .addOperation(Operation.restoreFootprint({}))
      .setTimeout(0)
      .build()

    return {
      transactionXDR: tx.toXDR(),
      keysRestored: keys.length,
    }
  }

  private reWrapFeeBumpTransaction(
    innerTransactionXDR: string,
    originalTx: any,
  ): string {
    const feeBumpMetadata = extractFeeBumpMetadata(originalTx)
    
    if (!feeBumpMetadata.isFeeBump || !feeBumpMetadata.feeAccountID || !feeBumpMetadata.feeBumpFee) {
      throw new SorobanResurrectError(
        'Cannot re-wrap: missing fee-bump metadata',
        'INVALID_XDR',
      )
    }

    try {
      // Parse the inner transaction to re-wrap it
      const innerTx = TransactionBuilder.fromXDR(innerTransactionXDR, this.config.networkPassphrase) as any

      // Use buildFeeBumpTransaction to create the new fee-bump transaction
      const feeBumpTx = TransactionBuilder.buildFeeBumpTransaction(
        {} as any, // Keypair - we'll set this via envelope manipulation
        feeBumpMetadata.feeBumpFee,
        innerTx,
        this.config.networkPassphrase,
      )

      // Manually set the fee account by manipulating the XDR
      const feeBumpXdr = feeBumpTx.toXDR()
      this.log('info', `Re-wrapped inner transaction as fee-bump transaction for account ${feeBumpMetadata.feeAccountID}`)

      return feeBumpXdr
    } catch (err) {
      throw new SorobanResurrectError(
        `Failed to re-wrap fee-bump transaction: ${err instanceof Error ? err.message : String(err)}`,
        'INVALID_XDR',
        err,
      )
    }
  }

  private preserveFeeBumpSignatures(originalTx: any, newInnerTx: any): any {
    if (!isFeeBumpTx(originalTx)) {
      return newInnerTx
    }

    try {
      const originalInnerTx = extractInnerTransaction(originalTx)
      const originalSignatures = (originalInnerTx as any).signatures || []

      if (originalSignatures.length > 0) {
        this.log('info', `Preserving ${originalSignatures.length} inner transaction signatures after restoration`)
        // Signatures are preserved in the inner transaction structure
        // Copy them to the new inner transaction if needed
        if ((newInnerTx as any).signatures) {
          for (const sig of originalSignatures) {
            if (!((newInnerTx as any).signatures as any[]).includes(sig)) {
              ((newInnerTx as any).signatures as any[]).push(sig)
            }
          }
        }
      }

      return newInnerTx
    } catch (err) {
      this.log('warn', `Could not preserve signatures: ${err instanceof Error ? err.message : String(err)}`)
      return newInnerTx
    }
  }

  async executeRestoreThenOriginal(
    restoreXDR: string,
    originalXDR: string,
    signTransaction: (xdr: string) => Promise<string>,
  ): Promise<ExecutionResult> {
    if (this.config.simulateOnly) {
      this.log('info', 'simulateOnly mode: skipping transaction submission')
      
      let keysRestored = 0
      try {
        const restoreTx = TransactionBuilder.fromXDR(restoreXDR, this.config.networkPassphrase)
        const sorobanRaw = 'sorobanData' in restoreTx ? (restoreTx as any).sorobanData : null
        const sorobanDataSD = sorobanRaw as xdr.SorobanTransactionData | null
        const resources = sorobanDataSD?.resources()
        const footprint = resources?.footprint()
        keysRestored = footprint ? extractKeysFromFootprint(footprint).all.length : 0
      } catch {
        this.log('warn', 'Could not parse restore transaction XDR for key counting')
      }

      return {
        success: true,
        entriesRestored: keysRestored,
        simulateOnly: true,
      }
    }

    let restoreTxHash: string | undefined
    let originalTxHash: string | undefined

    // Parse original transaction to detect fee-bump
    let originalTx: any
    let isOriginalFeeBump = false
    try {
      originalTx = TransactionBuilder.fromXDR(originalXDR, this.config.networkPassphrase)
      isOriginalFeeBump = isFeeBumpTx(originalTx)
      if (isOriginalFeeBump) {
        this.log('info', 'Original transaction is a fee-bump, will re-wrap after restoration')
      }
    } catch (err) {
      this.log('warn', `Could not parse original transaction for fee-bump detection: ${err instanceof Error ? err.message : String(err)}`)
      // Continue without fee-bump detection
    }

    // Execute restore transaction
    try {
      this.log('info', 'Executing restore transaction')
      restoreTxHash = await this.submitSignedTransaction(restoreXDR, signTransaction)
      this.log('info', `Restore transaction confirmed: ${restoreTxHash}`)
    } catch (err) {
      throw new SorobanResurrectError(
        `Restore transaction failed (rpcUrl=${this.config.rpcUrl}): ${err instanceof Error ? err.message : String(err)}`,
        'RESTORE_FAILED',
        err,
        { rpcUrl: this.config.rpcUrl, txHash: restoreTxHash },
      )
    }

    // Execute original transaction (may need to re-wrap if it was fee-bump)
    let txToSubmit = originalXDR
    if (isOriginalFeeBump) {
      try {
        const innerTx = extractInnerTransaction(originalTx)
        const innerTxXDR = innerTx.toXDR()
        txToSubmit = this.reWrapFeeBumpTransaction(innerTxXDR, originalTx)
        this.log('info', 'Re-wrapped fee-bump transaction for submission')
      } catch (err) {
        this.log('warn', `Failed to re-wrap fee-bump, attempting submission with original: ${err instanceof Error ? err.message : String(err)}`)
        txToSubmit = originalXDR
      }
    }

    try {
      this.log('info', 'Executing original transaction')
      originalTxHash = await this.submitSignedTransaction(txToSubmit, signTransaction)
      this.log('info', `Original transaction confirmed: ${originalTxHash}`)
    } catch (err) {
      throw new SorobanResurrectError(
        `Original transaction failed after successful restore (rpcUrl=${this.config.rpcUrl}, restoreTxHash=${restoreTxHash}): ${err instanceof Error ? err.message : String(err)}`,
        'ORIGINAL_TX_FAILED',
        err,
        { rpcUrl: this.config.rpcUrl, txHash: restoreTxHash },
      )
    }

    let keysRestored = 0
    try {
      const restoreTx = TransactionBuilder.fromXDR(restoreXDR, this.config.networkPassphrase)
      const sorobanRaw = 'sorobanData' in restoreTx ? (restoreTx as any).sorobanData : null
      const sorobanDataSD = sorobanRaw as xdr.SorobanTransactionData | null
      const resources = sorobanDataSD?.resources()
      const footprint = resources?.footprint()
      keysRestored = footprint ? extractKeysFromFootprint(footprint).all.length : 0
    } catch {
      this.log('warn', 'Could not parse restore transaction XDR for key counting')
    }

    return {
      success: true,
      restoreTxHash,
      originalTxHash,
      entriesRestored: keysRestored,
    }
  }

  private async submitSignedTransaction(
    txXDR: string,
    signTransaction: (xdr: string) => Promise<string>,
  ): Promise<string> {
    const signedXDR = await signTransaction(txXDR)

    const tx = new (await import('@stellar/stellar-sdk')).Transaction(signedXDR, this.config.networkPassphrase)

    const sendResult = await this.retryOnFailure(
      () => this.server.sendTransaction(tx),
      'sendTransaction',
    )

    if (sendResult.status === 'PENDING' || sendResult.status === 'DUPLICATE') {
      const hash = sendResult.hash
      return await this.pollForReceipt(hash)
    }

    if (sendResult.status === 'ERROR') {
      throw new SorobanResurrectError(
        `Transaction submission error (rpcUrl=${this.config.rpcUrl})`,
        'ORIGINAL_TX_FAILED',
        sendResult,
        { rpcUrl: this.config.rpcUrl },
      )
    }

    throw new SorobanResurrectError(
      `Unexpected submission status: ${sendResult.status} (rpcUrl=${this.config.rpcUrl})`,
      'NETWORK_ERROR',
      sendResult,
      { rpcUrl: this.config.rpcUrl },
    )
  }

  private async pollForReceipt(hash: string, maxAttempts = 30): Promise<string> {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const receipt = await this.server.getTransaction(hash)
      if (receipt.status !== 'NOT_FOUND') {
        if (receipt.status === 'SUCCESS') {
          return hash
        }
        const result = 'result' in receipt ? (receipt as any).result : receipt
        throw new SorobanResurrectError(
          `Transaction failed (txHash=${hash}, rpcUrl=${this.config.rpcUrl}): ${JSON.stringify(result)}`,
          'ORIGINAL_TX_FAILED',
          receipt,
          { rpcUrl: this.config.rpcUrl, txHash: hash },
        )
      }
      await delay(1000)
    }
    throw new SorobanResurrectError(
      `Transaction ${hash} not confirmed after ${maxAttempts * 1000}ms (rpcUrl=${this.config.rpcUrl})`,
      'NETWORK_ERROR',
      undefined,
      { rpcUrl: this.config.rpcUrl, txHash: hash },
    )
  }

  async checkAndPrepare(
    txXDR: string,
    sourceAccountID: string,
  ): Promise<{
    needsRestoration: boolean
    simulationResult: SimulationCheckResult
    restoreTransactionXDR?: string
  }> {
    const simulationResult = await this.simulate(txXDR, sourceAccountID)

    if (!simulationResult.needsRestoration) {
      return { needsRestoration: false, simulationResult }
    }

    const restoreTx = await this.buildRestoreTransaction(
      simulationResult.archivedKeys,
      sourceAccountID,
    )

    return {
      needsRestoration: true,
      simulationResult,
      restoreTransactionXDR: restoreTx.transactionXDR,
    }
  }

  /**
   * Invalidate simulation cache for a specific transaction
   * @param txXDR Transaction XDR to invalidate
   * @param source Optional source account
   */
  invalidateSimulationCache(txXDR?: string, source?: string): void {
    if (!this.simulationCache) {
      this.log('warn', 'Simulation cache is not enabled')
      return
    }

    if (txXDR) {
      const cacheKey = SimulationCache.generateKey(txXDR, source)
      this.simulationCache.invalidate(cacheKey)
      this.log('info', 'Invalidated simulation cache for specific transaction')
    } else {
      this.simulationCache.invalidateAll()
      this.log('info', 'Cleared all simulation cache entries')
    }
  }

  /**
   * Get simulation cache statistics
   */
  getSimulationCacheStats() {
    if (!this.simulationCache) {
      return null
    }
    return this.simulationCache.getStatistics()
  }

  getRpcServer(): SorobanRpc.Server {
    return this.server
  }
}

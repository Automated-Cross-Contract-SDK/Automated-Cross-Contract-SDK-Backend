import {
  SorobanRpc,
  TransactionBuilder,
  Transaction,
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
  RestoreBatchResult,
  RestoreAllBatchesResult,
  ConcurrentRestoreResult,
  ContractKeyGroup,
  ExecutionResult,
  SorobanResurrectError,
} from './types.js'
import {
  FootprintKeys,
  extractKeysFromFootprint,
  classifyLedgerKey,
  encodeLedgerKey,
} from './footprint-parser.js'

const MAX_XDR_SIZE_BYTES = 100_000
const DEFAULT_RESTORE_FEE = '100000'
const MAX_RETRIES = 3
const RETRY_DELAY_MS = 500
const DEFAULT_MAX_CONCURRENCY = 5

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function isFeeBumpTx(tx: ReturnType<typeof TransactionBuilder.fromXDR>): tx is ReturnType<typeof TransactionBuilder.fromXDR> & { innerTransaction: any } {
  return 'innerTransaction' in tx
}

export class SorobanResurrect {
  private server: SorobanRpc.Server
  private config: Required<SorobanResurrectConfig>

  constructor(config: SorobanResurrectConfig) {
    this.config = {
      allowHttp: false,
      restoreFee: DEFAULT_RESTORE_FEE,
      maxRestoreBatchSize: 50,
      maxConcurrency: DEFAULT_MAX_CONCURRENCY,
      onLog: () => {},
      ...config,
    }
    this.server = new SorobanRpc.Server(this.config.rpcUrl, {
      allowHttp: this.config.allowHttp,
    })
  }

  private log(level: 'info' | 'warn' | 'error', message: string, data?: unknown): void {
    this.config.onLog(level, message, data)
  }

  private async retryOnFailure<T>(fn: () => Promise<T>, context: string): Promise<T> {
    let lastError: Error | undefined
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await fn()
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err))
        this.log('warn', `Attempt ${attempt}/${MAX_RETRIES} failed for ${context}: ${lastError.message}`)
        if (attempt < MAX_RETRIES) {
          await delay(RETRY_DELAY_MS * attempt)
        }
      }
    }
    throw new SorobanResurrectError(
      `Operation failed after ${MAX_RETRIES} retries: ${context}`,
      'NETWORK_ERROR',
      lastError,
    )
  }

  async simulate(txXDR: string, source?: string): Promise<SimulationCheckResult> {
    let tx: ReturnType<typeof TransactionBuilder.fromXDR>
    try {
      tx = TransactionBuilder.fromXDR(txXDR, this.config.networkPassphrase)
    } catch (err) {
      throw new SorobanResurrectError('Invalid transaction XDR', 'INVALID_XDR', err)
    }

    if (isFeeBumpTx(tx)) {
      throw new SorobanResurrectError(
        'Fee bump transactions are not supported',
        'INVALID_XDR',
      )
    }

    let simResult: SorobanRpc.Api.SimulateTransactionResponse
    try {
      simResult = await this.retryOnFailure(
        () => this.server.simulateTransaction(tx),
        'simulateTransaction',
      )
    } catch (err) {
      const msg = err instanceof SorobanResurrectError ? err.message : String(err)
      throw new SorobanResurrectError(`Simulation failed: ${msg}`, 'SIMULATION_FAILED', err)
    }

    if (SorobanRpc.Api.isSimulationError(simResult)) {
      throw new SorobanResurrectError(
        `Simulation error: ${simResult.error}`,
        'SIMULATION_FAILED',
        simResult,
      )
    }

    let footprint: xdr.LedgerFootprint | null = null

    if (SorobanRpc.Api.isSimulationSuccess(simResult)) {
      footprint = simResult.transactionData.getFootprint()
    }

    if (!footprint) {
      const sorobanData = (tx as any).sorobanData as xdr.SorobanTransactionData | undefined
      if (sorobanData) {
        footprint = sorobanData.resources().footprint()
      }
    }

    if (!footprint) {
      return { needsRestoration: false, archivedKeys: [], totalKeysInFootprint: 0 }
    }

    const keys = extractKeysFromFootprint(footprint)
    return this.detectArchivedKeys(keys, source)
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
      throw new SorobanResurrectError(
        `Failed to query ledger entries: ${err instanceof Error ? err.message : String(err)}`,
        'ARCHIVE_DETECTION_FAILED',
        err,
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
      throw new SorobanResurrectError('No archived keys to restore', 'INVALID_XDR')
    }

    const batches = this.batchKeys(archivedKeys)

    if (batches.length > 1) {
      this.log('info', `Splitting restore into ${batches.length} batches (${archivedKeys.length} total keys)`)
    }

    const result = await this.buildSingleRestoreTransaction(batches[0], sourceAccountID)
    return result
  }

  async buildRestoreTransactionBatches(
    archivedKeys: ArchivedKey[],
    sourceAccountID: string,
  ): Promise<RestoreBatchResult[]> {
    if (archivedKeys.length === 0) {
      throw new SorobanResurrectError('No archived keys to restore', 'INVALID_XDR')
    }

    const batches = this.batchKeys(archivedKeys)

    if (batches.length > 1) {
      this.log(
        'info',
        `Building ${batches.length} restore batches for ${archivedKeys.length} total keys`,
      )
    }

    // Fetch account once to get initial sequence number
    const sourceAccount = await this.retryOnFailure(
      () => this.server.getAccount(sourceAccountID),
      `getAccount(${sourceAccountID})`,
    )

    let currentSequence = BigInt(sourceAccount.sequenceNumber())
    const batchResults: RestoreBatchResult[] = []

    // Build all batches with incremented sequence numbers
    for (let i = 0; i < batches.length; i++) {
      const batchKeys = batches[i]
      const ledgerKeys = batchKeys.map(k => k.key)

      // Create a temporary account with the projected sequence number
      const batchAccount = new Account(sourceAccountID, (currentSequence).toString())
      currentSequence += 1n

      const dataBuilder = new SorobanDataBuilder()
        .setFootprint([], ledgerKeys)

      const sorobanDataXdr = dataBuilder.build().toXDR('base64') as string

      const tx = new TransactionBuilder(batchAccount, {
        fee: this.config.restoreFee!,
        networkPassphrase: this.config.networkPassphrase,
        sorobanData: sorobanDataXdr,
      })
        .addOperation(Operation.restoreFootprint({}))
        .setTimeout(0)
        .build()

      batchResults.push({
        batchIndex: i,
        transactionXDR: tx.toXDR(),
        keysRestored: batchKeys.length,
        status: 'pending',
      })

      this.log('info', `Built batch ${i + 1}/${batches.length} with ${batchKeys.length} keys`)
    }

    return batchResults
  }

  async executeRestoreBatches(
    batches: RestoreBatchResult[],
    signTransaction: (xdr: string) => Promise<string>,
  ): Promise<RestoreAllBatchesResult> {
    const results: RestoreBatchResult[] = []
    let totalKeysRestored = 0

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i]
      this.log('info', `Executing restore batch ${i + 1}/${batches.length} (${batch.keysRestored} keys)`)

      try {
        const txHash = await this.submitSignedTransaction(batch.transactionXDR, signTransaction)
        results.push({
          ...batch,
          txHash,
          status: 'success',
        })
        totalKeysRestored += batch.keysRestored
        this.log('info', `Batch ${i + 1} confirmed: ${txHash}`)
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err)
        this.log('error', `Batch ${i + 1} failed: ${errorMsg}`)

        results.push({
          ...batch,
          status: 'failed',
          error: errorMsg,
        })

        // Return early with partial success tracking
        return {
          success: false,
          batches: results,
          totalKeysRestored,
          failedAtBatchIndex: i,
          error: `Batch ${i + 1} failed: ${errorMsg}`,
        }
      }
    }

    // All batches succeeded
    return {
      success: true,
      batches: results,
      totalKeysRestored,
    }
  }

  /**
   * Executes restore batches concurrently up to `maxConcurrency` in-flight at
   * a time.  Unlike `executeRestoreBatches`, this method never short-circuits:
   * all batches are attempted and any failures are collected in the result so
   * the caller can decide how to recover.
   *
   * Independent batches (i.e. those from different contracts as produced by
   * `buildRestoreTransactionBatchesConcurrent`) are safe to submit in parallel
   * because they touch disjoint ledger keys.
   *
   * @param batches     Batches to execute (typically from
   *                    `buildRestoreTransactionBatchesConcurrent`).
   * @param signTransaction  Wallet signing callback — called once per batch.
   * @param concurrency Override the instance-level `maxConcurrency` for this
   *                    call.  Useful for one-off tuning without reconfiguring
   *                    the client.
   */
  async executeRestoreBatchesConcurrent(
    batches: RestoreBatchResult[],
    signTransaction: (xdr: string) => Promise<string>,
    concurrency?: number,
  ): Promise<ConcurrentRestoreResult> {
    const limit = Math.max(1, concurrency ?? this.config.maxConcurrency ?? DEFAULT_MAX_CONCURRENCY)
    const total = batches.length

    this.log(
      'info',
      `Executing ${total} restore batches concurrently (limit=${limit})`,
    )

    // Results array pre-sized so we can write by index from parallel tasks
    const results: RestoreBatchResult[] = new Array(total)
    let totalKeysRestored = 0
    const failedIndices: number[] = []

    // --- inline semaphore (p-limit equivalent) ---
    let active = 0
    let queueHead = 0
    const queue: Array<() => void> = []

    const acquire = (): Promise<void> =>
      new Promise(resolve => {
        if (active < limit) {
          active++
          resolve()
        } else {
          queue.push(resolve)
        }
      })

    const release = (): void => {
      active--
      const next = queue[queueHead]
      if (next) {
        queueHead++
        active++
        next()
      }
    }
    // ----------------------------------------------

    const runBatch = async (batch: RestoreBatchResult, idx: number): Promise<void> => {
      await acquire()
      this.log(
        'info',
        `Starting restore batch ${idx + 1}/${total} (${batch.keysRestored} keys)`,
      )
      try {
        const txHash = await this.submitSignedTransaction(batch.transactionXDR, signTransaction)
        results[idx] = { ...batch, txHash, status: 'success' }
        totalKeysRestored += batch.keysRestored
        this.log('info', `Batch ${idx + 1}/${total} confirmed: ${txHash}`)
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err)
        this.log('error', `Batch ${idx + 1}/${total} failed: ${errorMsg}`)
        results[idx] = { ...batch, status: 'failed', error: errorMsg }
        failedIndices.push(idx)
      } finally {
        release()
      }
    }

    // Fire all tasks — the semaphore controls in-flight count
    await Promise.all(batches.map((batch, i) => runBatch(batch, i)))

    const success = failedIndices.length === 0
    const error = success
      ? undefined
      : `${failedIndices.length} of ${total} restore batches failed (indices: ${failedIndices.join(', ')})`

    this.log(
      success ? 'info' : 'warn',
      success
        ? `All ${total} batches succeeded, restored ${totalKeysRestored} keys`
        : `${failedIndices.length}/${total} batches failed`,
    )

    return {
      success,
      batches: results,
      totalKeysRestored,
      failedBatchCount: failedIndices.length,
      failedBatchIndices: [...failedIndices].sort((a, b) => a - b),
      error,
      concurrencyUsed: limit,
    }
  }

  /**
   * Builds restore batches that are optimised for concurrent execution.
   *
   * Keys are first grouped by contract ID (see `groupKeysByContract`).  Each
   * group is then split by XDR size.  The resulting batches are independent
   * across contracts and can be submitted in parallel via
   * `executeRestoreBatchesConcurrent`.
   */
  async buildRestoreTransactionBatchesConcurrent(
    archivedKeys: ArchivedKey[],
    sourceAccountID: string,
  ): Promise<RestoreBatchResult[]> {
    if (archivedKeys.length === 0) {
      throw new SorobanResurrectError('No archived keys to restore', 'INVALID_XDR')
    }

    const groups = this.groupKeysByContract(archivedKeys)
    const batches = this.batchKeyGroups(groups)

    this.log(
      'info',
      `Concurrent build: ${archivedKeys.length} keys → ${groups.length} contract groups → ${batches.length} batches`,
    )

    // Fetch account once for the initial sequence number
    const sourceAccount = await this.retryOnFailure(
      () => this.server.getAccount(sourceAccountID),
      `getAccount(${sourceAccountID})`,
    )

    let currentSequence = BigInt(sourceAccount.sequenceNumber())
    const batchResults: RestoreBatchResult[] = []

    for (let i = 0; i < batches.length; i++) {
      const batchKeys = batches[i]
      const ledgerKeys = batchKeys.map(k => k.key)

      const batchAccount = new Account(sourceAccountID, currentSequence.toString())
      currentSequence += 1n

      const dataBuilder = new SorobanDataBuilder().setFootprint([], ledgerKeys)
      const sorobanDataXdr = dataBuilder.build().toXDR('base64') as string

      const tx = new TransactionBuilder(batchAccount, {
        fee: this.config.restoreFee!,
        networkPassphrase: this.config.networkPassphrase,
        sorobanData: sorobanDataXdr,
      })
        .addOperation(Operation.restoreFootprint({}))
        .setTimeout(0)
        .build()

      batchResults.push({
        batchIndex: i,
        transactionXDR: tx.toXDR(),
        keysRestored: batchKeys.length,
        status: 'pending',
      })

      this.log('info', `Built concurrent batch ${i + 1}/${batches.length} with ${batchKeys.length} keys`)
    }

    return batchResults
  }

  /**
   * Full concurrent flow: build contract-aware batches, execute them in
   * parallel up to `maxConcurrency`, then submit the original transaction once
   * all restores are complete (or throw if any batch failed).
   *
   * Pass `requireAllBatches: false` to proceed with the original transaction
   * even when some restore batches fail — useful when your use-case can
   * tolerate partial restoration.
   */
  async executeRestoreThenOriginalBatchesConcurrent(
    archivedKeys: ArchivedKey[],
    originalXDR: string,
    sourceAccountID: string,
    signTransaction: (xdr: string) => Promise<string>,
    options: { requireAllBatches?: boolean; concurrency?: number } = {},
  ): Promise<ExecutionResult> {
    const { requireAllBatches = true, concurrency } = options

    const restoreBatches = await this.buildRestoreTransactionBatchesConcurrent(
      archivedKeys,
      sourceAccountID,
    )

    const concurrentResult = await this.executeRestoreBatchesConcurrent(
      restoreBatches,
      signTransaction,
      concurrency,
    )

    if (!concurrentResult.success && requireAllBatches) {
      throw new SorobanResurrectError(
        concurrentResult.error ?? 'One or more restore batches failed',
        'RESTORE_FAILED',
        concurrentResult,
      )
    }

    if (!concurrentResult.success) {
      this.log(
        'warn',
        `Proceeding with original transaction despite ${concurrentResult.failedBatchCount} failed restore batches`,
      )
    }

    let originalTxHash: string
    try {
      this.log('info', 'Executing original transaction after concurrent restore')
      originalTxHash = await this.submitSignedTransaction(originalXDR, signTransaction)
      this.log('info', `Original transaction confirmed: ${originalTxHash}`)
    } catch (err) {
      throw new SorobanResurrectError(
        `Original transaction failed after restore: ${err instanceof Error ? err.message : String(err)}`,
        'ORIGINAL_TX_FAILED',
        err,
      )
    }

    return {
      success: true,
      originalTxHash,
      entriesRestored: concurrentResult.totalKeysRestored,
      concurrentBatchResults: concurrentResult,
    }
  }

  /**
   * same contract are kept together (potential data dependencies) while keys
   * from different contracts are in separate groups and can be restored in
   * parallel.
   *
   * Keys without a contractId (e.g. ttlEntry / unknown) are collected under
   * the sentinel group '__unknown__'.
   */
  groupKeysByContract(keys: ArchivedKey[]): ContractKeyGroup[] {
    const map = new Map<string, ArchivedKey[]>()

    for (const key of keys) {
      const id = key.contractId ?? '__unknown__'
      const existing = map.get(id)
      if (existing) {
        existing.push(key)
      } else {
        map.set(id, [key])
      }
    }

    return Array.from(map.entries()).map(([contractId, groupKeys]) => ({
      contractId,
      keys: groupKeys,
    }))
  }

  /**
   * Like batchKeys, but starts from a set of per-contract groups.
   * Keys within a group are never split across batches that belong to
   * different groups, preserving the guarantee that each batch contains
   * only keys from a single contract (or the unknown sentinel).
   *
   * Each group whose XDR size exceeds MAX_XDR_SIZE_BYTES is itself split
   * into multiple sub-batches that will be executed sequentially (since they
   * share a contract).  Sub-batches from different groups remain independent.
   */
  private batchKeyGroups(groups: ContractKeyGroup[]): ArchivedKey[][] {
    const allBatches: ArchivedKey[][] = []

    for (const group of groups) {
      // Split this group's keys by XDR size, just like batchKeys does
      const subBatches = this.batchKeys(group.keys)
      allBatches.push(...subBatches)
    }

    return allBatches
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

  async executeRestoreThenOriginal(
    restoreXDR: string,
    originalXDR: string,
    signTransaction: (xdr: string) => Promise<string>,
  ): Promise<ExecutionResult> {
    let restoreTxHash: string | undefined
    let originalTxHash: string | undefined

    try {
      this.log('info', 'Executing restore transaction')
      restoreTxHash = await this.submitSignedTransaction(restoreXDR, signTransaction)
      this.log('info', `Restore transaction confirmed: ${restoreTxHash}`)
    } catch (err) {
      throw new SorobanResurrectError(
        `Restore transaction failed: ${err instanceof Error ? err.message : String(err)}`,
        'RESTORE_FAILED',
        err,
      )
    }

    try {
      this.log('info', 'Executing original transaction')
      originalTxHash = await this.submitSignedTransaction(originalXDR, signTransaction)
      this.log('info', `Original transaction confirmed: ${originalTxHash}`)
    } catch (err) {
      throw new SorobanResurrectError(
        `Original transaction failed after successful restore: ${err instanceof Error ? err.message : String(err)}`,
        'ORIGINAL_TX_FAILED',
        err,
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

  async executeRestoreThenOriginalBatches(
    restoreBatches: RestoreBatchResult[],
    originalXDR: string,
    signTransaction: (xdr: string) => Promise<string>,
  ): Promise<ExecutionResult> {
    let originalTxHash: string | undefined
    let batchResults: RestoreAllBatchesResult

    try {
      this.log('info', `Executing ${restoreBatches.length} restore batches sequentially`)
      batchResults = await this.executeRestoreBatches(restoreBatches, signTransaction)

      if (!batchResults.success) {
        throw new SorobanResurrectError(
          batchResults.error || `Batch ${batchResults.failedAtBatchIndex} failed`,
          'RESTORE_FAILED',
          batchResults,
        )
      }

      this.log(
        'info',
        `All ${restoreBatches.length} batches succeeded, restored ${batchResults.totalKeysRestored} keys`,
      )
    } catch (err) {
      const isRestoreError = err instanceof SorobanResurrectError && err.code === 'RESTORE_FAILED'
      throw isRestoreError
        ? err
        : new SorobanResurrectError(
            `Restore batches failed: ${err instanceof Error ? err.message : String(err)}`,
            'RESTORE_FAILED',
            err,
          )
    }

    try {
      this.log('info', 'Executing original transaction after all batches confirmed')
      originalTxHash = await this.submitSignedTransaction(originalXDR, signTransaction)
      this.log('info', `Original transaction confirmed: ${originalTxHash}`)
    } catch (err) {
      throw new SorobanResurrectError(
        `Original transaction failed after successful restore batches: ${err instanceof Error ? err.message : String(err)}`,
        'ORIGINAL_TX_FAILED',
        err,
      )
    }

    return {
      success: true,
      originalTxHash,
      entriesRestored: batchResults.totalKeysRestored,
      batchResults,
    }
  }

  private async submitSignedTransaction(
    txXDR: string,
    signTransaction: (xdr: string) => Promise<string>,
  ): Promise<string> {
    const signedXDR = await signTransaction(txXDR)

    const tx = new Transaction(signedXDR, this.config.networkPassphrase)

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
        `Transaction submission error`,
        'ORIGINAL_TX_FAILED',
        sendResult,
      )
    }

    throw new SorobanResurrectError(
      `Unexpected submission status: ${sendResult.status}`,
      'NETWORK_ERROR',
      sendResult,
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
          `Transaction failed: ${JSON.stringify(result)}`,
          'ORIGINAL_TX_FAILED',
          receipt,
        )
      }
      await delay(1000)
    }
    throw new SorobanResurrectError(
      `Transaction ${hash} not confirmed after ${maxAttempts * 1000}ms`,
      'NETWORK_ERROR',
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

  getRpcServer(): SorobanRpc.Server {
    return this.server
  }
}

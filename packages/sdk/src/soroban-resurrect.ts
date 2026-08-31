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
  FailedRestoreState,
  SorobanResurrectError,
  FeeBumpMetadata,
  SorobanResurrectEvents,
  WsTransactionStatusEvent,
  TransactionWaitResult,
  SimulationDiff,
  LedgerEntryDiff,
  TtlChange,
} from './types.js'
import {
  FootprintKeys,
  extractKeysFromFootprint,
  extractFootprintFromTransaction,
  classifyDeferredKeys,
  encodeLedgerKey,
} from './footprint-parser.js'
import { ExponentialBackoff, type RetryPolicy } from './retry-policy.js'
import { SimulationCache, type SimulationCacheConfig } from './simulation-cache.js'
import { RpcFailoverManager, type RpcEndpointHealth } from './rpc-failover.js'
import { FootprintCache, type FootprintCacheStatistics } from './footprint-cache.js'
import { Tracer } from './tracing.js'
import { DEFAULT_MAX_CONCURRENCY, MAX_RETRIES, RESTORED_ENTRY_TTL_LEDGERS } from './constants.js'

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
  private listeners: Record<string, Set<any>> = {}
  private failoverManager!: RpcFailoverManager
  private serverCache: Map<string, SorobanRpc.Server> = new Map()
  private simulationCache?: SimulationCache
  private tracer?: Tracer
  private footprintCache?: FootprintCache
  /** Trace-propagation headers for the RPC call currently in flight. */
  private activeTraceHeaders: Record<string, string> = {}

  constructor(config: SorobanResurrectConfig) {
    this.config = {
      allowHttp: false,
      restoreFee: DEFAULT_RESTORE_FEE,
      maxRestoreBatchSize: 50,
      simulateOnly: false,
      retryPolicy: new ExponentialBackoff(3, 500),
      onLog: () => {},
      useWebSocket: false,
      pollIntervalMs: 1000,
      maxPollAttempts: 30,
      ...config,
    }

    const serverOptions: SorobanRpc.Server.Options = {
      allowHttp: this.config.allowHttp,
    }
    if (this.config.timeout !== undefined) {
      serverOptions.timeout = this.config.timeout
    }

    this.server = new SorobanRpc.Server(
      Array.isArray(this.config.rpcUrl) ? this.config.rpcUrl[0] : this.config.rpcUrl,
      serverOptions,
    )

    this.failoverManager = new RpcFailoverManager(
      Array.isArray(this.config.rpcUrl) ? this.config.rpcUrl : [this.config.rpcUrl],
    )

    // Initialize footprint cache when configured
    if (this.config.footprintCache) {
      this.footprintCache = new FootprintCache(this.config.footprintCache)
    }

    // Initialize distributed tracing when configured
    if (this.config.tracing) {
      this.tracer = new Tracer(this.config.tracing)
    }

    void this.validateNetworkPassphrase()
  }

  /**
   * Confirms the configured `networkPassphrase` matches what the RPC server
   * reports via `getNetwork()`. Runs fire-and-forget from the constructor:
   * mismatches are logged as a warning, or thrown as a `NETWORK_ERROR` when
   * `strictNetworkValidation` is enabled.
   */
  private async validateNetworkPassphrase(): Promise<void> {
    try {
      const network = await this.server.getNetwork()
      if (network.passphrase !== this.config.networkPassphrase) {
        const rpcUrl = Array.isArray(this.config.rpcUrl) ? this.config.rpcUrl[0] : this.config.rpcUrl
        const message = `Network passphrase mismatch: configured "${this.config.networkPassphrase}" but RPC server reports "${network.passphrase}"`
        if (this.config.strictNetworkValidation) {
          throw new SorobanResurrectError(message, 'NETWORK_ERROR', undefined, { rpcUrl })
        }
        this.logger.warn(message, { rpcUrl })
      }
    } catch (err) {
      if (err instanceof SorobanResurrectError) {
        this.logger.error(err.message, { code: err.code })
        throw err
      }
      this.logger.warn(
        `Failed to validate network passphrase: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }

  /**
   * Register a listener for a transaction lifecycle event.
   * Returns `this` for chaining.
   */
  on<K extends keyof SorobanResurrectEvents>(event: K, listener: SorobanResurrectEvents[K]): this {
    if (!this.listeners[event]) {
      this.listeners[event] = new Set() as Set<SorobanResurrectEvents[K]>
    }
    ;(this.listeners[event] as Set<SorobanResurrectEvents[K]>).add(listener)
    return this
  }

  /**
   * Remove a previously registered listener.
   * Returns `this` for chaining.
   */
  off<K extends keyof SorobanResurrectEvents>(event: K, listener: SorobanResurrectEvents[K]): this {
    (this.listeners[event] as Set<SorobanResurrectEvents[K]> | undefined)?.delete(listener)
    return this
  }

  private emit<K extends keyof SorobanResurrectEvents>(
    event: K,
    ...args: Parameters<SorobanResurrectEvents[K]>
  ): void {
    const set = this.listeners[event] as Set<SorobanResurrectEvents[K]> | undefined
    if (!set) return
    for (const listener of set) {
      (listener as (...a: Parameters<SorobanResurrectEvents[K]>) => void)(...args)
    }
  }

  private log(level: 'info' | 'warn' | 'error' | 'debug', message: string, meta?: Record<string, unknown>): void {
    this.logger[level](message, meta)
  }

  /**
   * Returns a cached `SorobanRpc.Server` for the given URL (or the current
   * active endpoint when no URL is supplied).
   */
  private getServer(url?: string): SorobanRpc.Server {
    const targetUrl = url ?? this.failoverManager.getCurrentUrl()

    // When a trace span is in flight, build an un-cached server that carries the
    // current `traceparent` / `tracestate` headers so the RPC call is linked to
    // the active span end-to-end.
    const traceHeaders = this.activeTraceHeaders
    if (this.tracer?.enabled && Object.keys(traceHeaders).length > 0) {
      return new SorobanRpc.Server(targetUrl, {
        allowHttp: this.config.allowHttp,
        headers: traceHeaders,
      } as SorobanRpc.Server.Options)
    }

    let server = this.serverCache.get(targetUrl)
    if (!server) {
      server = new SorobanRpc.Server(targetUrl, { allowHttp: this.config.allowHttp })
      this.serverCache.set(targetUrl, server)
    }
    return server
  }

  private async retryOnFailure<T>(fn: () => Promise<T>, context: string): Promise<T> {
    if (this.tracer?.enabled) {
      const span = this.tracer.startSpan(`soroban.rpc ${context}`, {
        'rpc.system': 'soroban',
        'rpc.method': context,
        'server.address': this.failoverManager.getCurrentUrl(),
      })
      const previousHeaders = this.activeTraceHeaders
      this.activeTraceHeaders = span.headers()
      try {
        const result = await this.retryLoop(fn, context, span)
        span.end('ok')
        return result
      } catch (err) {
        span.end('error', err)
        throw err
      } finally {
        this.activeTraceHeaders = previousHeaders
      }
    }
    return this.retryLoop(fn, context)
  }

  private async retryLoop<T>(
    fn: () => Promise<T>,
    context: string,
    span?: { setAttribute: (k: string, v: string | number | boolean) => void },
  ): Promise<T> {
    let lastError: SorobanResurrectError | undefined
    const policy = this.config.retryPolicy

    for (let attempt = 1; attempt <= policy.maxRetries + 1; attempt++) {
      try {
        span?.setAttribute('rpc.attempts', attempt)
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
    return this.telemetry.trace('simulate', { 'rpc.url': Array.isArray(this.config.rpcUrl) ? this.config.rpcUrl[0] : this.config.rpcUrl }, async (span) => {
      // Check cache first if enabled
      if (this.simulationCache) {
        const cacheKey = SimulationCache.generateKey(txXDR, source)
        const cachedResult = this.simulationCache.get(cacheKey)
        if (cachedResult) {
          this.log('debug', 'Simulation result retrieved from cache')
          span.setAttribute('cache.hit', true)
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
        () => this.getServer().simulateTransaction(innerTx as any),
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
        this.sdkMetrics?.recordRpcError('simulation')
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
        span.setAttribute('key.count', 0)
        return { needsRestoration: false, archivedKeys: [], totalKeysInFootprint: 0 }
      }

      const keys = extractKeysFromFootprint(footprint)
      const result = await this.detectArchivedKeys(keys, source)

      span.setAttribute('key.count', result.totalKeysInFootprint)
      span.setAttribute('success', result.needsRestoration ? 'needs_restore' : 'ok')

      // Cache the result if caching is enabled
      if (this.simulationCache) {
        const cacheKey = SimulationCache.generateKey(txXDR, source)
        this.simulationCache.set(cacheKey, result)
      }

      return result
    })
  }

  private async detectArchivedKeys(
    keys: FootprintKeys,
    _source?: string,
  ): Promise<SimulationCheckResult> {
    if (keys.all.length === 0) {
      return { needsRestoration: false, archivedKeys: [], totalKeysInFootprint: 0 }
    }

    return this.telemetry.trace('detect-archived', { 'key.count': keys.all.length }, async (span) => {
      let existingKeys: SorobanRpc.Api.GetLedgerEntriesResponse
      try {
        existingKeys = await this.retryOnFailure(
          () => this.getServer().getLedgerEntries(...keys.all),
          'getLedgerEntries',
        )
      } catch (err) {
        this.sdkMetrics?.recordRpcError('network')
        // On error, classify lazily only for the error context
        const keyContext = keys.all.map(k => ({
          keyBase64: encodeLedgerKey(k),
          keyType: 'unknown' as const,
        }))
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
          // Store keys without classification — classification is deferred
          // until buildRestoreTransaction or the caller explicitly classifies.
          archivedKeys.push({
            key,
            keyBase64: encoded,
            keyType: 'unknown',
            restorePriority: 3,
          })
        }
      }

      span.setAttribute('key.count', archivedKeys.length)
      span.setAttribute('success', archivedKeys.length === 0 ? 'no_archived' : 'archived_detected')

      return {
        needsRestoration: archivedKeys.length > 0,
        archivedKeys,
        totalKeysInFootprint: keys.all.length,
      }
    })
  }

  async checkTransaction(txXDR: string, source?: string): Promise<SimulationCheckResult> {
    return this.simulate(txXDR, source)
  }

  /**
   * Produce a before/after diff of every ledger entry in a transaction's
   * footprint: which entries are live, which are archived, the on-chain data
   * that would be restored, the total bytes involved and the projected TTL
   * change for each restored entry.
   *
   * This is a read-only debugging aid — it never submits a transaction.
   *
   * @param txXDR   Base64 transaction envelope XDR.
   * @param source  Optional source account override.
   * @param options `restoredTtlLedgers` overrides the network's assumed
   *   `minimumPersistentEntryLifetime` used to project restored TTLs.
   */
  async simulateDiff(
    txXDR: string,
    source?: string,
    options?: { restoredTtlLedgers?: number },
  ): Promise<SimulationDiff> {
    let tx: ReturnType<typeof TransactionBuilder.fromXDR>
    try {
      tx = TransactionBuilder.fromXDR(txXDR, this.config.networkPassphrase)
    } catch (err) {
      throw new SorobanResurrectError('Invalid transaction XDR', 'INVALID_XDR', err, {
        rpcUrl: this.config.rpcUrl,
      })
    }
    if (isFeeBumpTx(tx)) {
      throw new SorobanResurrectError(
        'Fee bump transactions are not supported',
        'INVALID_XDR',
        undefined,
        { rpcUrl: this.config.rpcUrl },
      )
    }

    // Resolve the footprint — prefer the transaction's own Soroban data, fall
    // back to an RPC simulation when it is not pre-populated.
    let footprint: xdr.LedgerFootprint | null = null
    const sorobanData = (tx as any).sorobanData as xdr.SorobanTransactionData | undefined
    if (sorobanData) {
      footprint = sorobanData.resources().footprint()
    }
    if (!footprint) {
      const simResult = await this.retryOnFailure(
        () => this.getServer().simulateTransaction(tx as any),
        'simulateTransaction(diff)',
      )
      if (
        !SorobanRpc.Api.isSimulationError(simResult) &&
        SorobanRpc.Api.isSimulationSuccess(simResult)
      ) {
        footprint = simResult.transactionData.getFootprint()
      }
    }

    if (!footprint) {
      return {
        entries: [],
        totalBytesRestored: 0,
        ttlChanges: [],
        needsRestoration: false,
      }
    }

    const keys = extractKeysFromFootprint(footprint)
    if (keys.all.length === 0) {
      return {
        entries: [],
        totalBytesRestored: 0,
        ttlChanges: [],
        needsRestoration: false,
      }
    }

    const ledgerResponse = await this.retryOnFailure(
      () => this.getServer().getLedgerEntries(...keys.all),
      'getLedgerEntries(diff)',
    )
    const latestLedger = (ledgerResponse as { latestLedger?: number }).latestLedger

    // Index the returned entries by their base64 key.
    const onChain = new Map<
      string,
      { data?: xdr.LedgerEntryData; liveUntilLedgerSeq?: number }
    >()
    for (const entry of ledgerResponse.entries) {
      onChain.set(encodeLedgerKey(entry.key), {
        data: (entry as any).val as xdr.LedgerEntryData | undefined,
        liveUntilLedgerSeq: (entry as any).liveUntilLedgerSeq as number | undefined,
      })
    }

    const classified = classifyDeferredKeys(
      keys.all.map(k => ({ key: k, keyBase64: encodeLedgerKey(k) })),
    )

    const restoredTtl = options?.restoredTtlLedgers ?? RESTORED_ENTRY_TTL_LEDGERS
    const projectedTtl =
      latestLedger !== undefined ? latestLedger + restoredTtl : restoredTtl

    const entries: LedgerEntryDiff[] = []
    const ttlChanges: TtlChange[] = []
    let totalBytesRestored = 0

    for (const key of classified) {
      const record = onChain.get(key.keyBase64)
      const isLive =
        record !== undefined &&
        (record.liveUntilLedgerSeq === undefined ||
          latestLedger === undefined ||
          record.liveUntilLedgerSeq >= latestLedger)

      const beforeXdr = record?.data
        ? Buffer.from(record.data.toXDR()).toString('base64')
        : undefined

      if (isLive) {
        entries.push({
          key,
          keyBase64: key.keyBase64,
          before: beforeXdr,
          after: beforeXdr,
          status: 'live',
        })
        continue
      }

      // Archived — this entry is part of the restore plan.
      const entryBytes = record?.data ? record.data.toXDR().length : key.key.toXDR().length
      totalBytesRestored += entryBytes

      entries.push({
        key,
        keyBase64: key.keyBase64,
        before: beforeXdr,
        // Restoration does not mutate entry data, only its TTL.
        after: beforeXdr,
        status: 'restored',
      })

      ttlChanges.push({
        key: key.keyBase64,
        oldTTL: record?.liveUntilLedgerSeq ?? 0,
        newTTL: projectedTtl,
      })
    }

    return {
      entries,
      totalBytesRestored,
      ttlChanges,
      latestLedger,
      needsRestoration: ttlChanges.length > 0,
    }
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

    return this.telemetry.trace('build-restore', { 'key.count': archivedKeys.length }, async (span) => {
      // Classify keys on demand before batch building (deferred from simulation)
      const classified = classifyDeferredKeys(
        archivedKeys.map(k => ({ key: k.key, keyBase64: k.keyBase64 })),
      )

      const batches = this.batchKeys(classified)
      span.setAttribute('batch.count', batches.length)

      if (batches.length > 1) {
        this.log('info', `Splitting restore into ${batches.length} batches (${archivedKeys.length} total keys)`)
      }

      this.emit('restore:start', classified)

      const result = await this.buildSingleRestoreTransaction(batches[0], sourceAccountID)

      this.emit('restore:batch:complete', 0, batches.length)
      this.emit('restore:complete', result)

      return result
    })
  }

  async buildRestoreTransactionBatches(
    archivedKeys: ArchivedKey[],
    sourceAccountID: string,
  ): Promise<RestoreBatchResult[]> {
    if (archivedKeys.length === 0) {
      throw new SorobanResurrectError('No archived keys to restore', 'INVALID_XDR')
    }

    // Classify keys on demand before batch building (deferred from simulation)
    const classified = classifyDeferredKeys(
      archivedKeys.map(k => ({ key: k.key, keyBase64: k.keyBase64 })),
    )

    const batches = this.batchKeys(classified)

    if (batches.length > 1) {
      this.log(
        'info',
        `Building ${batches.length} restore batches for ${archivedKeys.length} total keys`,
      )
    }

    // Fetch account once to get initial sequence number
    const sourceAccount = await this.retryOnFailure(
      () => this.getServer().getAccount(sourceAccountID),
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

      const fee = await this.estimateRestoreFee(batchKeys.length)

      const tx = new TransactionBuilder(batchAccount, {
        fee,
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
    sourceAccountID?: string,
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

        // Collect the remaining batches (current + unexecuted) as failed batches
        const failedBatches = [results[results.length - 1], ...batches.slice(i + 1)]

        // Capture failed state for recovery via getFailedKeys() / retryFailedRestore()
        this._lastFailedRestoreState = {
          sourceAccountID: sourceAccountID ?? '',
          failedBatches,
          failedKeys: [],  // populated lazily if caller needs individual keys
          failedBatchIndex: i,
          partialEntriesRestored: totalKeysRestored,
        }

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

    // All batches succeeded — clear any stale failure state
    this._lastFailedRestoreState = null

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

    // Classify keys on demand before batch building (deferred from simulation)
    const classified = classifyDeferredKeys(
      archivedKeys.map(k => ({ key: k.key, keyBase64: k.keyBase64 })),
    )

    const groups = this.groupKeysByContract(classified)
    const batches = this.batchKeyGroups(groups)

    this.log(
      'info',
      `Concurrent build: ${classified.length} keys → ${groups.length} contract groups → ${batches.length} batches`,
    )

    // Fetch account once for the initial sequence number
    const sourceAccount = await this.retryOnFailure(
      () => this.getServer().getAccount(sourceAccountID),
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

      const fee = await this.estimateRestoreFee(batchKeys.length)

      const tx = new TransactionBuilder(batchAccount, {
        fee,
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

    // Classify keys on demand before batch building (deferred from simulation)
    const classified = classifyDeferredKeys(
      archivedKeys.map(k => ({ key: k.key, keyBase64: k.keyBase64 })),
    )

    const restoreBatches = await this.buildRestoreTransactionBatchesConcurrent(
      classified,
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

  /**
   * Estimate the fee required for a restore operation.
   *
   * When `dynamicFeeEstimation` is enabled in config, this method builds a
   * minimal restore transaction for `batchSize` keys and runs
   * `simulateTransaction` against it to extract the resource fee from the
   * simulation response.  A 10 % buffer is added on top of the simulated fee
   * to account for ledger-state variance between simulation time and submission.
   *
   * If `dynamicFeeEstimation` is disabled, or if the simulation call fails for
   * any reason, the method falls back to returning `config.restoreFee`.
   *
   * @param batchSize  Number of ledger keys in the restore batch.
   * @returns          Fee string (stroops) to use for `TransactionBuilder`.
   */
  async estimateRestoreFee(batchSize: number): Promise<string> {
    if (!this.config.dynamicFeeEstimation) {
      return this.config.restoreFee!
    }

    try {
      // Build a placeholder restore transaction with dummy ledger keys so the
      // RPC node can estimate resource consumption for the given batch size.
      // We use a throw-away source account representation; the simulation only
      // needs a valid transaction envelope to compute resource fees.
      const placeholderAccountId = 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN'
      const placeholderAccount = new Account(placeholderAccountId, '0')

      // Build a minimal footprint — the ledger keys themselves don't matter for
      // fee estimation since the RPC considers only the count and transaction
      // structure when computing the resource fee.
      const dataBuilder = new SorobanDataBuilder().setFootprint([], [])

      const candidateTx = new TransactionBuilder(placeholderAccount, {
        fee: this.config.restoreFee!,
        networkPassphrase: this.config.networkPassphrase,
        sorobanData: dataBuilder.build().toXDR('base64'),
      })
        .addOperation(Operation.restoreFootprint({}))
        .setTimeout(0)
        .build()

      const simResult = await this.retryOnFailure(
        () => this.getServer().simulateTransaction(candidateTx as any),
        'simulateTransaction(estimateRestoreFee)',
      )

      if (
        !SorobanRpc.Api.isSimulationError(simResult) &&
        SorobanRpc.Api.isSimulationSuccess(simResult) &&
        simResult.minResourceFee
      ) {
        // Add a 10 % buffer on top of the minimum resource fee to ensure the
        // transaction doesn't get rejected due to small ledger-state changes
        // between simulation time and submission time.
        const minFee = BigInt(simResult.minResourceFee)
        const buffer = minFee / 10n
        const estimatedFee = (minFee + buffer).toString()
        this.log(
          'info',
          `Dynamic fee estimate for batch of ${batchSize}: ${estimatedFee} stroops (min=${simResult.minResourceFee})`,
        )
        return estimatedFee
      }
    } catch (err) {
      this.log(
        'warn',
        `Dynamic fee estimation failed, falling back to restoreFee: ${err instanceof Error ? err.message : String(err)}`,
      )
    }

    // Fall back to the configured restoreFee
    return this.config.restoreFee!
  }

  private async buildSingleRestoreTransaction(
    keys: ArchivedKey[],
    sourceAccountID: string,
  ): Promise<RestoreTransactionResult> {
    const sourceAccount = await this.retryOnFailure(
      () => this.getServer().getAccount(sourceAccountID),
      `getAccount(${sourceAccountID})`,
    )

    const ledgerKeys = keys.map(k => k.key)

    const dataBuilder = new SorobanDataBuilder()
      .setFootprint([], ledgerKeys)

    // Build a candidate transaction to estimate the fee against, then rebuild
    // with the final fee once we have it.
    const fee = await this.estimateRestoreFee(keys.length)

    const tx = new TransactionBuilder(sourceAccount, {
      fee,
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
    const startTime = Date.now()
    return this.telemetry.trace('submit-restore', {}, async (span) => {
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

        span.setAttribute('success', 'simulate_only')
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
        this.log('info', `Restore transaction confirmed: ${restoreTxHash}`, { txHash: restoreTxHash })
        span.setAttribute('restore.tx.hash', restoreTxHash)
      } catch (err) {
        this.sdkMetrics?.recordRestore('failure')
        this.sdkMetrics?.recordRestoreDuration(Date.now() - startTime)
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

      return this.telemetry.trace('submit-original', {}, async (origSpan) => {
        try {
          this.log('info', 'Executing original transaction')
          this.emit('original:start')
          originalTxHash = await this.submitSignedTransaction(txToSubmit, signTransaction)
          this.log('info', `Original transaction confirmed: ${originalTxHash}`, { txHash: originalTxHash })
          this.emit('original:complete', originalTxHash)
          origSpan.setAttribute('success', 'true')
        } catch (err) {
          this.sdkMetrics?.recordRestore('failure')
          this.sdkMetrics?.recordRestoreDuration(Date.now() - startTime)
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

        this.sdkMetrics?.recordRestore('success')
        this.sdkMetrics?.recordRestoreDuration(Date.now() - startTime)
        this.sdkMetrics?.recordKeysRestored(keysRestored)
        span.setAttribute('success', 'true')

        return {
          success: true,
          restoreTxHash,
          originalTxHash,
          entriesRestored: keysRestored,
        }
      })
    })
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
        // Propagate partial-failure fields into the thrown error context so
        // callers can read them from _lastFailedRestoreState via getFailedKeys().
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
      if (isRestoreError) {
        throw err
      }
      throw new SorobanResurrectError(
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
      () => this.getServer().sendTransaction(tx),
      'sendTransaction',
    )

    if (sendResult.status === 'PENDING' || sendResult.status === 'DUPLICATE') {
      const hash = sendResult.hash
      const { hash: confirmedHash } = await this.waitForTransaction(hash)
      return confirmedHash
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

  /**
   * Derive the WebSocket endpoint URL from the configured HTTP RPC URL.
   * Returns `null` when the URL scheme cannot be mapped to a WS scheme
   * (e.g. plain `http://` without `allowHttp`).
   */
  private getWebSocketUrl(): string | null {
    try {
      const url = new URL(this.config.rpcUrl)
      if (url.protocol === 'https:') {
        url.protocol = 'wss:'
      } else if (url.protocol === 'http:' && this.config.allowHttp) {
        url.protocol = 'ws:'
      } else {
        return null
      }
      // Soroban RPC WebSocket endpoint is the same path as HTTP
      return url.toString()
    } catch {
      return null
    }
  }

  /**
   * Probe whether a WebSocket connection to the server can be established.
   * Returns `true` if the handshake succeeds within `timeoutMs`.
   */
  private probeWebSocketSupport(wsUrl: string, timeoutMs = 3000): Promise<boolean> {
    return new Promise(resolve => {
      let settled = false
      const settle = (result: boolean): void => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        try { ws.close() } catch { /* ignore */ }
        resolve(result)
      }

      let ws: WebSocket
      try {
        ws = new WebSocket(wsUrl)
      } catch {
        return resolve(false)
      }

      const timer = setTimeout(() => settle(false), timeoutMs)
      ws.onopen  = () => settle(true)
      ws.onerror = () => settle(false)
    })
  }

  /**
   * Wait for a submitted transaction to reach a terminal status.
   *
   * When `useWebSocket` is `true` (and WebSocket is reachable), this method
   * subscribes to `transaction_status` events over the WebSocket endpoint.
   * If `useWebSocket` is `false`, or if the WebSocket probe fails, it falls
   * back to polling `getTransaction` every second.
   */
  async waitForTransaction(
    hash: string,
    maxPollAttempts = this.config.maxPollAttempts,
  ): Promise<TransactionWaitResult> {
    if (this.config.useWebSocket) {
      const wsUrl = this.getWebSocketUrl()
      if (wsUrl) {
        const supported = await this.probeWebSocketSupport(wsUrl)
        if (supported) {
          this.log('info', `Using WebSocket for transaction status: ${hash}`)
          try {
            await this.wsWaitForTransaction(hash, wsUrl, maxPollAttempts)
            return { hash, transport: 'websocket' }
          } catch (err) {
            // If the WS path threw something other than a SorobanResurrectError
            // (e.g. a connection drop) fall through to polling.
            if (err instanceof SorobanResurrectError) throw err
            this.log('warn', `WebSocket wait failed, falling back to polling: ${err instanceof Error ? err.message : String(err)}`)
          }
        } else {
          this.log('warn', 'WebSocket not supported by server, falling back to polling')
        }
      } else {
        this.log('warn', 'Could not derive WebSocket URL, falling back to polling')
      }
    }

    await this.pollForReceipt(hash, maxPollAttempts)
    return { hash, transport: 'polling' }
  }

  /**
   * Subscribe to transaction status over WebSocket and resolve when the
   * transaction reaches a terminal state (`SUCCESS` or `FAILED`).
   *
   * Protocol: send a JSON-RPC 2.0 `subscribe` request with method
   * `subscribeTransactionStatus`, then listen for `transaction_status`
   * notification messages.
   */
  private wsWaitForTransaction(
    hash: string,
    wsUrl: string,
    maxPollAttempts: number,
  ): Promise<void> {
    const timeoutMs = maxPollAttempts * (this.config.pollIntervalMs ?? 1000)

    return new Promise<void>((resolve, reject) => {
      let settled = false
      let ws: WebSocket

      const finish = (err?: SorobanResurrectError): void => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        try { ws.close() } catch { /* ignore */ }
        if (err) reject(err)
        else resolve()
      }

      const timer = setTimeout(() => {
        finish(new SorobanResurrectError(
          `Transaction ${hash} not confirmed via WebSocket after ${timeoutMs}ms`,
          'NETWORK_ERROR',
        ))
      }, timeoutMs)

      try {
        ws = new WebSocket(wsUrl)
      } catch (err) {
        clearTimeout(timer)
        return reject(err)
      }

      ws.onopen = () => {
        // Send a JSON-RPC 2.0 subscription request
        const subscribeMsg = JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'subscribeTransactionStatus',
          params: { hash },
        })
        ws.send(subscribeMsg)
      }

      ws.onmessage = (event: MessageEvent) => {
        let msg: WsTransactionStatusEvent
        try {
          msg = JSON.parse(event.data as string) as WsTransactionStatusEvent
        } catch {
          return // ignore non-JSON frames
        }

        // Only handle transaction_status notifications for our hash
        if (msg.method !== 'transaction_status') return
        if (msg.params?.hash !== hash) return

        const status = msg.params.status
        if (status === 'SUCCESS') {
          this.log('info', `Transaction ${hash} confirmed via WebSocket`)
          finish()
        } else if (status === 'FAILED') {
          finish(new SorobanResurrectError(
            `Transaction ${hash} failed: ${msg.params.error ?? 'unknown error'}`,
            'ORIGINAL_TX_FAILED',
            msg.params,
          ))
        }
        // PENDING / NOT_FOUND — keep waiting
      }

      ws.onerror = (event: Event) => {
        finish(new SorobanResurrectError(
          `WebSocket error waiting for transaction ${hash}`,
          'NETWORK_ERROR',
          event,
        ))
      }

      ws.onclose = (event: CloseEvent) => {
        if (!settled) {
          finish(new SorobanResurrectError(
            `WebSocket closed unexpectedly (code ${event.code}) while waiting for ${hash}`,
            'NETWORK_ERROR',
            event,
          ))
        }
      }
    })
  }

  private async pollForReceipt(hash: string, maxAttempts = this.config.maxPollAttempts): Promise<string> {
    const intervalMs = this.config.pollIntervalMs ?? 1000
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const receipt = await this.getServer().getTransaction(hash)
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
      await delay(intervalMs)
    }
    throw new SorobanResurrectError(
      `Transaction ${hash} not confirmed after ${maxAttempts * intervalMs}ms (rpcUrl=${this.config.rpcUrl})`,
      'NETWORK_ERROR',
      undefined,
      { rpcUrl: this.config.rpcUrl, txHash: hash },
    )
  }

  /**
   * Returns the captured partial-failure state from the most recent
   * `executeRestoreBatches` call that failed mid-way through a batch sequence,
   * or `null` when the last execution succeeded (or no execution has run yet).
   *
   * Use this after catching a `RESTORE_FAILED` error from
   * `executeRestoreThenOriginalBatches` to inspect which keys still need to be
   * restored and to obtain the batch objects needed by `retryFailedRestore`.
   *
   * @example
   * ```ts
   * try {
   *   await client.executeRestoreThenOriginalBatches(batches, originalXDR, sign)
   * } catch (err) {
   *   const state = client.getFailedKeys()
   *   if (state) {
   *     console.log(`${state.failedKeys.length} keys remain unrestored`)
   *     await client.retryFailedRestore(state, sign)
   *   }
   * }
   * ```
   */
  getFailedKeys(): FailedRestoreState | null {
    return this._lastFailedRestoreState
  }

  /**
   * Retry only the failed batches from a previous partial restore.
   *
   * Rebuilds each failed batch transaction with a fresh sequence number
   * (fetched from the RPC) and re-submits them.  On success the internal
   * `_lastFailedRestoreState` is cleared.  On failure the state is updated to
   * reflect any newly failed batches so the caller can keep retrying
   * incrementally.
   *
   * @param state            State object returned by `getFailedKeys()`.
   * @param signTransaction  Wallet signing callback.
   * @returns                `ExecutionResult` summarising the retry outcome.
   */
  async retryFailedRestore(
    state: FailedRestoreState,
    signTransaction: (xdr: string) => Promise<string>,
  ): Promise<ExecutionResult> {
    if (state.failedBatches.length === 0) {
      this.log('info', 'retryFailedRestore: no failed batches to retry')
      return {
        success: true,
        entriesRestored: state.partialEntriesRestored,
      }
    }

    this.log(
      'info',
      `Retrying ${state.failedBatches.length} failed restore batches (source=${state.sourceAccountID})`,
    )

    // Re-fetch current sequence number so rebuilt transactions are valid
    const sourceAccount = await this.retryOnFailure(
      () => this.getServer().getAccount(state.sourceAccountID),
      `getAccount(${state.sourceAccountID})`,
    )

    let currentSequence = BigInt(sourceAccount.sequenceNumber())

    // Rebuild each failed batch with an updated sequence number and, if
    // dynamicFeeEstimation is enabled, a freshly estimated fee.
    const rebuiltBatches: RestoreBatchResult[] = []
    for (const batch of state.failedBatches) {
      // We can't recover the original ArchivedKey objects from the XDR here,
      // so we reconstruct a minimal transaction with the same footprint by
      // parsing the stored XDR.
      let rebuildXDR = batch.transactionXDR
      try {
        const existingTx = TransactionBuilder.fromXDR(
          batch.transactionXDR,
          this.config.networkPassphrase,
        ) as any
        const sorobanData = existingTx.sorobanData as xdr.SorobanTransactionData | undefined
        const batchAccount = new Account(state.sourceAccountID, currentSequence.toString())
        currentSequence += 1n

        const fee = await this.estimateRestoreFee(batch.keysRestored)

        const rebuiltTx = new TransactionBuilder(batchAccount, {
          fee,
          networkPassphrase: this.config.networkPassphrase,
          sorobanData: sorobanData?.toXDR('base64') ?? batch.transactionXDR,
        })
          .addOperation(Operation.restoreFootprint({}))
          .setTimeout(0)
          .build()

        rebuildXDR = rebuiltTx.toXDR()
      } catch (err) {
        this.log(
          'warn',
          `Could not rebuild batch ${batch.batchIndex}, retrying with original XDR: ${err instanceof Error ? err.message : String(err)}`,
        )
      }

      rebuiltBatches.push({
        ...batch,
        transactionXDR: rebuildXDR,
        status: 'pending',
        txHash: undefined,
        error: undefined,
      })
    }

    const retryResult = await this.executeRestoreBatches(
      rebuiltBatches,
      signTransaction,
      state.sourceAccountID,
    )

    const totalRestored = state.partialEntriesRestored + retryResult.totalKeysRestored

    if (retryResult.success) {
      this._lastFailedRestoreState = null
      this.log('info', `Retry succeeded, total entries restored: ${totalRestored}`)
      return {
        success: true,
        entriesRestored: totalRestored,
        batchResults: retryResult,
      }
    }

    // Partial retry failure — update the state for the next retry
    this.log('warn', `Retry partially failed at batch ${retryResult.failedAtBatchIndex}`)
    return {
      success: false,
      entriesRestored: totalRestored,
      failedBatchIndex: retryResult.failedAtBatchIndex,
      partialEntriesRestored: totalRestored,
      error: retryResult.error,
      batchResults: retryResult,
    }
  }

  async checkAndPrepare(
    txXDR: string,
    sourceAccountID: string,
  ): Promise<{
    needsRestoration: boolean
    simulationResult: SimulationCheckResult
    restoreTransactionXDR?: string
  }> {
    return this.telemetry.trace('check-and-prepare', {}, async (span) => {
      const simulationResult = await this.simulate(txXDR, sourceAccountID)

      span.setAttribute('key.count', simulationResult.totalKeysInFootprint)

      if (!simulationResult.needsRestoration) {
        span.setAttribute('success', 'no_restore_needed')
        return { needsRestoration: false, simulationResult }
      }

      const restoreTx = await this.buildRestoreTransaction(
        simulationResult.archivedKeys,
        sourceAccountID,
      )

      span.setAttribute('key.types', simulationResult.archivedKeys.map(k => k.keyType).join(','))
      span.setAttribute('success', 'restore_prepared')

      return {
        needsRestoration: true,
        simulationResult,
        restoreTransactionXDR: restoreTx.transactionXDR,
      }
    })
  }

  /**
   * Invalidate simulation cache for a specific transaction
   * @param txXDR Transaction XDR to invalidate
   * @param source Optional source account
   */
  /**
   * Render all collected Prometheus metrics as a text-format string suitable
   * for serving on a `/metrics` HTTP endpoint.
   *
   * Returns an empty string when metrics are not configured.
   *
   * @example
   * ```ts
   * const resurrect = new SorobanResurrect({ metrics: {} });
   * // Serve metrics endpoint:
   * res.setHeader('Content-Type', 'text/plain; version=0.0.4');
   * res.end(resurrect.collectMetrics());
   * ```
   */
  collectMetrics(): string {
    return this.sdkMetrics?.collect() ?? ''
  }

  /**
   * Expose the underlying MetricsRegistry for consumers who need direct
   * access (e.g. to add custom metrics or integrate with a larger registry).
   * Returns `undefined` when metrics are not configured.
   */
  get metricsRegistry() {
    return this.sdkMetrics?.registry
  }

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

  /**
   * Parse a transaction XDR and extract its footprint keys, with caching.
   *
   * When a `footprintCache` is configured, the result is stored keyed by the
   * SHA-256 hash of the XDR string.  Subsequent calls with the same XDR will
   * return the cached result instantly, avoiding redundant CPU-heavy XDR
   * deserialization.
   *
   * Cache entries are **not** time-bounded — they are invalidated only when
   * `invalidateFootprintCache()` / `onLedgerClose()` is called, because
   * footprint keys derived from a transaction XDR are deterministic and do
   * not change across ledgers.
   */
  extractFootprintCached(txXDR: string): FootprintKeys | null {
    if (this.footprintCache) {
      const cached = this.footprintCache.get(txXDR)
      if (cached !== undefined) {
        return cached
      }
    }

    const result = extractFootprintFromTransaction(txXDR, this.config.networkPassphrase)

    if (this.footprintCache) {
      this.footprintCache.set(txXDR, result)
    }

    return result
  }

  /**
   * Invalidate **all** entries in the footprint cache.
   *
   * Call this whenever the ledger closes (i.e. a new ledger sequence is
   * available) to ensure that subsequent calls to `extractFootprintCached`
   * do not serve stale data.  Cached footprint keys are only valid for the
   * current ledger.
   */
  onLedgerClose(): void {
    if (this.footprintCache) {
      this.footprintCache.invalidateAll()
      this.log('info', 'Footprint cache invalidated (ledger close)')
    }
  }

  /**
   * Invalidate the footprint cache entry for a specific transaction XDR.
   * Pass no arguments to invalidate the entire cache.
   */
  invalidateFootprintCache(txXDR?: string): void {
    if (!this.footprintCache) {
      this.log('warn', 'Footprint cache is not enabled')
      return
    }

    if (txXDR) {
      this.footprintCache.invalidate(txXDR)
      this.log('info', 'Invalidated footprint cache for specific transaction')
    } else {
      this.footprintCache.invalidateAll()
      this.log('info', 'Cleared all footprint cache entries')
    }
  }

  /**
   * Get footprint cache statistics.
   * Returns `null` when the cache is not enabled.
   */
  getFootprintCacheStats(): FootprintCacheStatistics | null {
    if (!this.footprintCache) {
      return null
    }
    return this.footprintCache.getStatistics()
  }

  getRpcServer(): SorobanRpc.Server {
    return this.getServer()
  }

  /**
   * Returns a snapshot of the health status for all configured RPC endpoints.
   */
  getFailoverStatus(): RpcEndpointHealth[] {
    return this.failoverManager.getHealthStatus()
  }

  /**
   * Stops background health checks and frees resources.
   * Call this when you are done with the SDK instance.
   */
  destroy(): void {
    this.failoverManager.destroy()
  }
}

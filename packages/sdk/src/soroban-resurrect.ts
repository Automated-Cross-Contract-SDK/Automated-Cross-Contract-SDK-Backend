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
} from './types.js'
import {
  FootprintKeys,
  extractKeysFromFootprint,
  classifyLedgerKey,
  encodeLedgerKey,
} from './footprint-parser.js'
import { RpcFailoverManager, RpcEndpointHealth } from './rpc-failover.js'
import { VersionNegotiator, ServerVersionInfo } from './version-negotiator.js'

const MAX_XDR_SIZE_BYTES = 100_000
const DEFAULT_RESTORE_FEE = '100000'
const MAX_RETRIES = 3
const RETRY_DELAY_MS = 500

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function isFeeBumpTx(tx: ReturnType<typeof TransactionBuilder.fromXDR>): tx is ReturnType<typeof TransactionBuilder.fromXDR> & { innerTransaction: any } {
  return 'innerTransaction' in tx
}

export class SorobanResurrect {
  private serverCache = new Map<string, SorobanRpc.Server>()
  private failoverManager: RpcFailoverManager
  private versionNegotiator: VersionNegotiator
  private serverVersionInfo: ServerVersionInfo | null = null
  private config: Required<Omit<SorobanResurrectConfig, 'rpcFailover' | 'versionNegotiation'>> & Pick<SorobanResurrectConfig, 'rpcFailover' | 'versionNegotiation'>

  constructor(config: SorobanResurrectConfig) {
    this.config = {
      allowHttp: false,
      restoreFee: DEFAULT_RESTORE_FEE,
      maxRestoreBatchSize: 50,
      onLog: () => {},
      ...config,
    }

    const urls = Array.isArray(config.rpcUrl) ? config.rpcUrl : [config.rpcUrl]
    this.failoverManager = new RpcFailoverManager(urls, config.rpcFailover)

    // Initialize version negotiator
    this.versionNegotiator = new VersionNegotiator(this.log.bind(this))

    // Start background health checks when multiple endpoints are provided
    if (urls.length > 1) {
      this.failoverManager.startHealthChecks(async (url) => {
        const server = this.getServer(url)
        await server.getLatestLedger()
      })
    }
  }

  private log(level: 'info' | 'warn' | 'error', message: string, data?: unknown): void {
    this.config.onLog(level, message, data)
  }

  /**
   * Returns a cached `SorobanRpc.Server` for the given URL (or the current
   * active endpoint when no URL is supplied).
   */
  private getServer(url?: string): SorobanRpc.Server {
    const targetUrl = url ?? this.failoverManager.getCurrentUrl()
    let server = this.serverCache.get(targetUrl)
    if (!server) {
      server = new SorobanRpc.Server(targetUrl, { allowHttp: this.config.allowHttp })
      this.serverCache.set(targetUrl, server)
    }
    return server
  }

  private async retryOnFailure<T>(fn: () => Promise<T>, context: string): Promise<T> {
    let lastError: Error | undefined
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      const currentUrl = this.failoverManager.getCurrentUrl()
      try {
        const result = await fn()
        this.failoverManager.recordSuccess(currentUrl)
        return result
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err))
        this.log('warn', `Attempt ${attempt}/${MAX_RETRIES} failed for ${context} (endpoint: ${currentUrl}): ${lastError.message}`)
        this.failoverManager.recordFailure(currentUrl)
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
        () => this.getServer().simulateTransaction(tx),
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
        () => this.getServer().getLedgerEntries(...keys.all),
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
      () => this.getServer().getAccount(sourceAccountID),
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

  private async submitSignedTransaction(
    txXDR: string,
    signTransaction: (xdr: string) => Promise<string>,
  ): Promise<string> {
    const signedXDR = await signTransaction(txXDR)

    const tx = new (await import('@stellar/stellar-sdk')).Transaction(signedXDR, this.config.networkPassphrase)

    const sendResult = await this.retryOnFailure(
      () => this.getServer().sendTransaction(tx),
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
      const receipt = await this.getServer().getTransaction(hash)
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

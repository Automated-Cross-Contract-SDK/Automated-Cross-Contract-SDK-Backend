import {
  SorobanRpc,
  xdr,
  Account,
  SorobanDataBuilder,
} from '@stellar/stellar-sdk'
import type {
  MockRpcConfig,
  NetworkCondition,
  NetworkSimulationOptions,
  MockRpcStats,
  MethodOverride,
  RpcFixture,
  SimulatedLedgerEntry,
  RecordedInteraction,
} from './types.js'
import { MockLedgerState } from './ledger-state.js'
import { SequenceManager } from './sequence-manager.js'
import { FixtureRecorder } from './fixture-recorder.js'

/**
 * A mock Soroban RPC server for deterministic unit testing.
 *
 * Features:
 * - Pre-record and replay RPC responses from fixtures
 * - Simulate specific network conditions (timeout, error, slow response)
 * - Simulate ledger state with configurable TTL expiry
 * - Deterministic sequence number management
 * - No network calls — fast for CI
 *
 * @example
 * ```typescript
 * const mock = new MockRpcServer()
 *
 * // Add a ledger entry that's archived (TTL expired)
 * mock.ledgerState.setCurrentLedgerSeq(10_000_000)
 * mock.ledgerState.addEntry({
 *   key: someLedgerKey,
 *   keyBase64: '...',
 *   data: '...',
 *   lastLiveLedgerSeq: 100,
 *   ttl: 100,
 *   entryType: 'contractData',
 * })
 *
 * // Simulate a network timeout
 * mock.setNetworkCondition('timeout')
 *
 * // Get the server instance for use with SorobanResurrect
 * const server = mock.getServer()
 * ```
 */
export class MockRpcServer {
  /** The simulated ledger state manager. */
  readonly ledgerState: MockLedgerState
  /** Deterministic sequence number manager. */
  readonly sequenceManager: SequenceManager
  /** Fixture recorder for capturing and replaying interactions. */
  readonly fixtures: FixtureRecorder

  private config: Required<MockRpcConfig>
  private stats: MockRpcStats
  private methodOverrides: Map<string, MethodOverride['handler']> = new Map()
  private perMethodConditions: Map<string, NetworkSimulationOptions> = new Map()
  private loadedFixture: RpcFixture | null = null
  private fixtureMode: 'none' | 'replay' | 'record' = 'none'

  constructor(config: MockRpcConfig = {}) {
    this.config = {
      networkCondition: 'healthy',
      slowDelayMs: 2000,
      errorMessage: 'Simulated RPC error',
      currentLedgerSeq: 1,
      allowHttp: true,
      networkPassphrase: 'Test SDF Network ; September 2015',
      protocolVersion: 22,
      ...config,
    }

    this.ledgerState = new MockLedgerState(
      {},
      this.config.currentLedgerSeq,
    )
    this.sequenceManager = new SequenceManager()
    this.fixtures = new FixtureRecorder()

    this.stats = {
      totalCalls: 0,
      callsByMethod: {},
      timeouts: 0,
      errors: 0,
      slowResponses: 0,
      totalDelayMs: 0,
    }
  }

  // ── Network condition control ────────────────────────────────────────────

  /** Set the global network condition for all methods. */
  setNetworkCondition(condition: NetworkCondition): void {
    this.config.networkCondition = condition
  }

  /** Get the current global network condition. */
  getNetworkCondition(): NetworkCondition {
    return this.config.networkCondition
  }

  /**
   * Set a per-method network condition, overriding the global setting.
   * @param method - The RPC method name (e.g., 'simulateTransaction')
   * @param options - The network simulation options
   */
  setMethodCondition(method: string, options: NetworkSimulationOptions): void {
    this.perMethodConditions.set(method, options)
  }

  /** Clear a per-method network condition override. */
  clearMethodCondition(method: string): void {
    this.perMethodConditions.delete(method)
  }

  /** Clear all per-method overrides and reset global condition to 'healthy'. */
  resetConditions(): void {
    this.config.networkCondition = 'healthy'
    this.perMethodConditions.clear()
  }

  // ── Fixture control ──────────────────────────────────────────────────────

  /** Load a fixture for replay. */
  loadFixture(fixture: RpcFixture): void {
    this.loadedFixture = fixture
    this.fixtureMode = 'replay'
  }

  /** Load a fixture from a file path. */
  loadFixtureFromFile(filePath: string): void {
    this.loadedFixture = this.fixtures.loadFixture(filePath)
    this.fixtureMode = 'replay'
  }

  /** Start recording interactions to a fixture. */
  startRecording(): void {
    this.fixtureMode = 'record'
    this.fixtures.startRecording()
  }

  /** Stop recording and return the recorded interactions. */
  stopRecording(): RecordedInteraction[] {
    const interactions = this.fixtures.stopRecording()
    this.fixtureMode = 'none'
    return interactions
  }

  /** Save recorded interactions to a fixture file. */
  saveFixture(filePath: string, name: string, metadata?: RpcFixture['metadata']): void {
    this.fixtures.saveFixture(filePath, name, metadata)
  }

  // ── Method overrides ─────────────────────────────────────────────────────

  /**
   * Register a custom handler for a specific RPC method.
   * The handler receives the call params and must return the response.
   */
  setMethodOverride(method: string, handler: MethodOverride['handler']): void {
    this.methodOverrides.set(method, handler)
  }

  /** Remove a method override. */
  clearMethodOverride(method: string): void {
    this.methodOverrides.delete(method)
  }

  /** Clear all method overrides. */
  clearAllOverrides(): void {
    this.methodOverrides.clear()
  }

  // ── Statistics ───────────────────────────────────────────────────────────

  /** Get call statistics for test assertions. */
  getStats(): MockRpcStats {
    return { ...this.stats }
  }

  /** Reset call statistics. */
  resetStats(): void {
    this.stats = {
      totalCalls: 0,
      callsByMethod: {},
      timeouts: 0,
      errors: 0,
      slowResponses: 0,
      totalDelayMs: 0,
    }
  }

  // ── RPC Method implementations ───────────────────────────────────────────

  /**
   * Build a mock `SorobanRpc.Server` instance whose methods are wired to
   * this mock's implementations.  Use this with `SorobanResurrect`.
   */
  getServer(): SorobanRpc.Server {
    const server = {
      simulateTransaction: (tx: unknown) => this.handleSimulateTransaction(tx),
      getLedgerEntries: (...keys: xdr.LedgerKey[]) => this.handleGetLedgerEntries(keys),
      getAccount: (accountId: string) => this.handleGetAccount(accountId),
      sendTransaction: (tx: unknown) => this.handleSendTransaction(tx),
      getTransaction: (hash: string) => this.handleGetTransaction(hash),
      getHealth: () => this.handleGetHealth(),
      getNetwork: () => this.handleGetNetwork(),
      getLatestLedger: () => this.handleGetLatestLedger(),
    } as unknown as SorobanRpc.Server

    return server
  }

  // ── Private: request pipeline ────────────────────────────────────────────

  private async handleRequest<T>(
    method: string,
    params: unknown[],
    handler: () => T | Promise<T>,
  ): Promise<T> {
    this.stats.totalCalls++
    this.stats.callsByMethod[method] = (this.stats.callsByMethod[method] ?? 0) + 1

    // 1. Check method override (takes highest priority)
    const override = this.methodOverrides.get(method)
    if (override) {
      return override(params) as T
    }

    // 2. Check fixture replay mode
    if (this.fixtureMode === 'replay' && this.loadedFixture) {
      const interaction = this.fixtures.findInteraction(this.loadedFixture, method, params)
      if (interaction) {
        await this.applyNetworkSimulation(
          method,
          interaction.networkCondition,
          interaction.delayMs,
        )
        return interaction.response as T
      }
    }

    // 3. Apply network simulation
    const condition = this.getEffectiveCondition(method)
    await this.applyNetworkSimulation(method, condition)

    // 4. Execute the actual handler
    const result = await handler()

    // 5. Record if in record mode
    if (this.fixtureMode === 'record') {
      const effectiveCondition = this.getEffectiveCondition(method)
      this.fixtures.record(method, params, result, effectiveCondition)
    }

    return result
  }

  /**
   * Determine the effective network condition for a method — per-method
   * override takes precedence over global.
   */
  private getEffectiveCondition(method: string): NetworkCondition {
    const perMethod = this.perMethodConditions.get(method)
    if (perMethod) return perMethod.condition
    return this.config.networkCondition
  }

  /**
   * Apply network condition effects: delay, timeout, or throw.
   */
  private async applyNetworkSimulation(
    method: string,
    condition: NetworkCondition,
    overrideDelayMs?: number,
  ): Promise<void> {
    const perMethod = this.perMethodConditions.get(method)
    const errorMessage = perMethod?.errorMessage ?? this.config.errorMessage

    switch (condition) {
      case 'timeout':
        this.stats.timeouts++
        // Simulate timeout by throwing a timeout-like error
        throw new Error(`Simulated timeout for ${method}`)

      case 'error':
        this.stats.errors++
        throw new Error(errorMessage)

      case 'slow': {
        this.stats.slowResponses++
        const delay = overrideDelayMs ?? perMethod?.delayMs ?? this.config.slowDelayMs
        this.stats.totalDelayMs += delay
        await new Promise(resolve => setTimeout(resolve, delay))
        break
      }

      case 'healthy':
        // No delay or error
        break
    }
  }

  // ── Private: RPC method implementations ──────────────────────────────────

  private async handleSimulateTransaction(tx: unknown): Promise<unknown> {
    return this.handleRequest('simulateTransaction', [tx], () => {
      // Build a minimal successful simulation response
      // Use the ledgerState to determine archived keys in the footprint

      const txObj = tx as any
      let sorobanData: xdr.SorobanTransactionData | undefined

      try {
        if (typeof txObj?.sorobanData === 'function') {
          sorobanData = txObj.sorobanData() as xdr.SorobanTransactionData
        } else if (txObj?.sorobanData) {
          sorobanData = txObj.sorobanData
        }
      } catch {
        // Ignore — no sorobanData
      }

      const readOnlyKeys: xdr.LedgerKey[] = []
      const readWriteKeys: xdr.LedgerKey[] = []

      if (sorobanData) {
        try {
          const resources = sorobanData.resources()
          const footprint = resources.footprint()
          if (footprint.readOnly) readOnlyKeys.push(...footprint.readOnly())
          if (footprint.readWrite) readWriteKeys.push(...footprint.readWrite())
        } catch {
          // Ignore key extraction failures
        }
      }

      const allKeys = [...readOnlyKeys, ...readWriteKeys]
      const archivedKeys = this.ledgerState.getArchivedEntries(allKeys)

      // Build the SorobanTransactionData with the footprint
      const dataBuilder = new SorobanDataBuilder()
        .setFootprint(readOnlyKeys, readWriteKeys)
      const txData = dataBuilder.build()

      const response = {
        id: `mock-sim-${Date.now()}`,
        transactionData: txData,
        minResourceFee: '100',
        results: [],
        cost: {
          cpuInsns: '0',
          memBytes: '0',
        },
        latestLedger: this.ledgerState.getCurrentLedgerSeq(),
        restorePreamble: archivedKeys.length > 0
          ? {
              minResourceFee: '500',
              transactionData: txData,
            }
          : undefined,
      }

      // If there are archived keys, force a simulation restore response
      if (archivedKeys.length > 0) {
        return {
          ...response,
          error: undefined,
          // SorobanRpc.Api.isSimulationRestore checks for restorePreamble
        }
      }

      return {
        ...response,
        // SorobanRpc.Api.isSimulationSuccess checks for results
      }
    })
  }

  private async handleGetLedgerEntries(keys: xdr.LedgerKey[]): Promise<unknown> {
    return this.handleRequest('getLedgerEntries', keys, () => {
      const liveEntries = this.ledgerState.getLiveEntries(keys)

      return {
        entries: liveEntries.map(entry => ({
          key: entry.key,
          xdr: entry.data,
          lastModifiedLedgerSeq: entry.lastLiveLedgerSeq,
        })),
        latestLedger: this.ledgerState.getCurrentLedgerSeq(),
      }
    })
  }

  private async handleGetAccount(accountId: string): Promise<unknown> {
    return this.handleRequest('getAccount', [accountId], () => {
      const account = this.sequenceManager.buildMockAccount(accountId)
      return account
    })
  }

  private async handleSendTransaction(tx: unknown): Promise<unknown> {
    return this.handleRequest('sendTransaction', [tx], () => {
      const hash = `mock-tx-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
      // We could store the pending tx but for unit tests, just return PENDING
      return {
        status: 'PENDING',
        hash,
        latestLedger: this.ledgerState.getCurrentLedgerSeq(),
        latestLedgerCloseTime: Math.floor(Date.now() / 1000),
      }
    })
  }

  private async handleGetTransaction(hash: string): Promise<unknown> {
    return this.handleRequest('getTransaction', [hash], () => ({
      status: 'SUCCESS',
      hash,
      latestLedger: this.ledgerState.getCurrentLedgerSeq(),
      latestLedgerCloseTime: Math.floor(Date.now() / 1000),
      createdAt: Math.floor(Date.now() / 1000) - 5,
      // Return SUCCESS immediately so unit tests don't block on polling
    }))
  }

  private async handleGetHealth(): Promise<unknown> {
    return this.handleRequest('getHealth', [], () => ({
      status: 'healthy',
      latestLedger: this.ledgerState.getCurrentLedgerSeq(),
      oldestLedger: 1,
      ledgerRetentionWindow: 17280,
    }))
  }

  private async handleGetNetwork(): Promise<unknown> {
    return this.handleRequest('getNetwork', [], () => ({
      passphrase: this.config.networkPassphrase ?? 'Test SDF Network ; September 2015',
      protocolVersion: 22,
      friendbotUrl: 'https://friendbot.stellar.org',
    }))
  }

  private async handleGetLatestLedger(): Promise<unknown> {
    return this.handleRequest('getLatestLedger', [], () => ({
      id: `mock-ledger-${this.ledgerState.getCurrentLedgerSeq()}`,
      protocolVersion: 22,
      sequence: this.ledgerState.getCurrentLedgerSeq(),
    }))
  }
}

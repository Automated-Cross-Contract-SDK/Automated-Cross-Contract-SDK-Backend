/**
 * Race-condition tests that deliberately introduce timing variations to surface
 * concurrent-operation bugs.
 *
 * Techniques:
 *  - vi.advanceTimersByTime with interleaved operations
 *  - Submit multiple executeRestoreThenOriginal calls in quick succession
 *  - Interleave simulate (→ detectArchivedKeys) with buildRestoreTransaction
 *  - Verify state consistency after concurrent operations
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { SorobanResurrect } from '../src/soroban-resurrect.js'
import {
  ArchivedKey,
  RestoreBatchResult,
  SorobanResurrectError,
} from '../src/types.js'
import { xdr } from '@stellar/stellar-sdk'

// ─── Mock stellar-sdk ────────────────────────────────────────────────────────

vi.mock('@stellar/stellar-sdk', () => {
  const mockTransactionBuilder = vi.fn().mockImplementation(() => ({
    addOperation: vi.fn().mockReturnThis(),
    setTimeout: vi.fn().mockReturnThis(),
    build: vi.fn().mockReturnValue({
      toXDR: vi.fn().mockReturnValue('mock-tx-xdr'),
    }),
  }))
  // Attach static method so new TransactionBuilder(...) works
  ;(mockTransactionBuilder as any).fromXDR = vi.fn()

  const mockTransaction = vi.fn().mockImplementation((xdr: string) => ({ xdr }))

  return {
    SorobanRpc: {
      Server: vi.fn().mockImplementation(() => ({
        simulateTransaction: vi.fn(),
        getLedgerEntries: vi.fn(),
        getAccount: vi.fn().mockResolvedValue({ sequenceNumber: () => '1000' }),
        sendTransaction: vi.fn(),
        getTransaction: vi.fn(),
        getNetwork: vi.fn().mockResolvedValue({
          passphrase: 'Test SDF Network ; September 2015',
        }),
      })),
      Api: {
        isSimulationError: vi.fn(),
        isSimulationSuccess: vi.fn(),
        isSimulationRestore: vi.fn(),
      },
    },
    TransactionBuilder: mockTransactionBuilder,
    Transaction: mockTransaction,
    Operation: {
      restoreFootprint: vi.fn().mockReturnValue({ type: 'restoreFootprint' }),
    },
    Account: vi.fn().mockImplementation((id: string, seq: string) => ({
      sequenceNumber: () => seq,
    })),
    xdr: {
      LedgerEntryType: {
        contractData: () => 'contractData',
        contractCode: () => 'contractCode',
        ttl: () => 'ttl',
      },
    },
    BASE_FEE: '100',
    SorobanDataBuilder: vi.fn().mockImplementation(() => ({
      setFootprint: vi.fn().mockReturnThis(),
      build: vi.fn().mockReturnValue({
        toXDR: vi.fn().mockReturnValue('mock-soroban-data-xdr'),
        footprint: () => ({ readOnly: () => [], readWrite: () => [] }),
      }),
    })),
  }
})

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeKey(contractId: string, index = 0): ArchivedKey {
  return {
    key: {} as xdr.LedgerKey,
    keyBase64: `key-${contractId}-${index}`.padEnd(44, 'x'),
    keyType: 'contractData' as const,
    contractId,
    restorePriority: 2 as const,
  }
}

function makeBatch(
  batchIndex: number,
  keysRestored = 5,
  xdr = `xdr-batch-${batchIndex}`,
): RestoreBatchResult {
  return { batchIndex, transactionXDR: xdr, keysRestored, status: 'pending' }
}

const SOURCE = 'GBFQRG4MXSLCJ7VDQTLBJ3JWKSGGOZAYNLWWRXZL3JECGVFQG3BXJBQM'
const DEFAULT_CONFIG = {
  rpcUrl: 'https://soroban-testnet.stellar.org',
  networkPassphrase: 'Test SDF Network ; September 2015',
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 1: vi.advanceTimersByTime with interleaved operations
// ═══════════════════════════════════════════════════════════════════════════════

describe('Race Conditions – fake timers + interleaved operations', () => {
  let client: SorobanResurrect
  let mockServer: any

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    client = new SorobanResurrect(DEFAULT_CONFIG)
    mockServer = client.getRpcServer()
    // Default: everything succeeds immediately
    mockServer.sendTransaction.mockResolvedValue({ status: 'PENDING', hash: 'h' })
    mockServer.getTransaction.mockResolvedValue({ status: 'SUCCESS' })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('executes two interleaved executeRestoreThenOriginal calls where time gaps cause polling overlap', async () => {
    const signFn = vi.fn().mockImplementation(async (xdr: string) => `signed-${xdr}`)

    // Start first call — it will enter waitForTransaction (polling loop)
    const p1 = client.executeRestoreThenOriginal('restore-1', 'original-1', signFn)

    // Let the first send go through but NOT the poll ticks yet
    await vi.advanceTimersByTimeAsync(0)
    // At this point: sendTransaction resolved, poll timer scheduled

    // Start second call while first is still polling
    const p2 = client.executeRestoreThenOriginal('restore-2', 'original-2', signFn)
    await vi.advanceTimersByTimeAsync(0)

    // Advance far enough for all polling to complete (maxPollAttempts * pollIntervalMs)
    // Default: 30 attempts × 1000ms = 30000ms. First call needs 1 poll tick, second needs 1.
    // But mock getTransaction returns SUCCESS immediately so only 1 poll per call.
    await vi.advanceTimersByTimeAsync(2000)

    const [r1, r2] = await Promise.all([p1, p2])

    expect(r1.success).toBe(true)
    expect(r2.success).toBe(true)
    expect(r1.originalTxHash).toBeDefined()
    expect(r2.originalTxHash).toBeDefined()
  })

  it('handles rapid polling interleaving when one operation is slow to confirm', async () => {
    // First operation: needs several polls before confirming
    let pollCount1 = 0
    let pollCount2 = 0

    mockServer.sendTransaction.mockResolvedValue({ status: 'PENDING', hash: 'h' })
    mockServer.getTransaction.mockImplementation(async () => {
      // Operation 1 polls earlier than operation 2 due to submission order
      if (pollCount1 < 3) {
        pollCount1++
        return { status: 'NOT_FOUND' }
      }
      if (pollCount2 < 3) {
        pollCount2++
        return { status: 'NOT_FOUND' }
      }
      return { status: 'SUCCESS' }
    })

    const signFn = vi.fn().mockImplementation(async (xdr: string) => `signed-${xdr}`)

    const p1 = client.executeRestoreThenOriginal('r1', 'o1', signFn)
    await vi.advanceTimersByTimeAsync(0)
    const p2 = client.executeRestoreThenOriginal('r2', 'o2', signFn)
    await vi.advanceTimersByTimeAsync(0)

    // Advance 10 polling intervals (10s) — enough for both to resolve
    await vi.advanceTimersByTimeAsync(10000)

    const [r1, r2] = await Promise.all([p1, p2])
    expect(r1.success).toBe(true)
    expect(r2.success).toBe(true)
    // Both ended up polling at least a few times
    expect(pollCount1 + pollCount2).toBeGreaterThanOrEqual(4)
  })

  it('advances time mid-execution without corrupting internal state', async () => {
    // Submit then advance time before the sign callback completes (simulating
    // a slow wallet UI). Verify the final result is still correct.
    const resolvers: Array<(value: string) => void> = []
    const signFn = vi.fn().mockImplementation(
      (_xdr: string) =>
        new Promise<string>(resolve => {
          resolvers.push(resolve)
        }),
    )

    const p = client.executeRestoreThenOriginal('restore-x', 'original-x', signFn)

    // Advance time while sign is pending — should not affect anything
    await vi.advanceTimersByTimeAsync(5000)
    expect(signFn).toHaveBeenCalledTimes(1)

    // Now resolve the first sign (restore txn)
    resolvers[0]('signed-xdr')
    await vi.advanceTimersByTimeAsync(100)

    // That should trigger the original txn call; resolve that too
    expect(signFn).toHaveBeenCalledTimes(2)
    resolvers[1]('signed-xdr')
    await vi.advanceTimersByTimeAsync(2000)

    const result = await p
    expect(result.success).toBe(true)
  })

  it('survives timer exhaustion beyond maxPollAttempts with interleaved ops', async () => {
    // First call times out after max polls; second call also polls at same time
    mockServer.sendTransaction.mockResolvedValue({ status: 'PENDING', hash: 'h' })
    mockServer.getTransaction.mockResolvedValue({ status: 'NOT_FOUND' })

    const signFn = vi.fn().mockImplementation(async (xdr: string) => `signed-${xdr}`)

    const p1 = client.executeRestoreThenOriginal('r1', 'o1', signFn)
    await vi.advanceTimersByTimeAsync(0)
    const p2 = client.executeRestoreThenOriginal('r2', 'o2', signFn)
    await vi.advanceTimersByTimeAsync(0)

    // Wrap in .catch before advancing to avoid unhandled rejections
    const r1 = p1.catch(e => e)
    const r2 = p2.catch(e => e)

    // Advance past 30 attempts × 1000ms = 30000ms
    await vi.advanceTimersByTimeAsync(35000)

    const err1 = await r1
    const err2 = await r2
    expect(err1).toBeInstanceOf(SorobanResurrectError)
    expect(err2).toBeInstanceOf(SorobanResurrectError)
  })

  it('interleaves timer advances between submission and polling phases', async () => {
    // Simulate: RESTORE completes quickly, then a long gap before ORIGINAL starts
    let sendCount = 0
    mockServer.sendTransaction.mockImplementation(async () => {
      sendCount++
      return { status: 'PENDING', hash: `h${sendCount}` }
    })
    mockServer.getTransaction.mockResolvedValue({ status: 'SUCCESS' })

    const signFn = vi.fn().mockImplementation(async (xdr: string) => `signed-${xdr}`)
    const p = client.executeRestoreThenOriginal('rx', 'ox', signFn)

    // Let the restore transaction send + poll + confirm
    await vi.advanceTimersByTimeAsync(2000)

    // Then advance more to allow original to proceed
    await vi.advanceTimersByTimeAsync(2000)

    const result = await p
    expect(result.success).toBe(true)
    expect(result.restoreTxHash).toBeDefined()
    expect(result.originalTxHash).toBeDefined()
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 2: Multiple executeRestoreThenOriginal calls in quick succession
// ═══════════════════════════════════════════════════════════════════════════════

describe('Race Conditions – rapid concurrent executeRestoreThenOriginal', () => {
  let client: SorobanResurrect
  let mockServer: any

  beforeEach(() => {
    vi.clearAllMocks()
    client = new SorobanResurrect(DEFAULT_CONFIG)
    mockServer = client.getRpcServer()
    mockServer.sendTransaction.mockResolvedValue({ status: 'PENDING', hash: 'h' })
    mockServer.getTransaction.mockResolvedValue({ status: 'SUCCESS' })
  })

  it('handles 5 executeRestoreThenOriginal calls fired simultaneously', async () => {
    let txCounter = 0
    mockServer.sendTransaction.mockImplementation(async () => {
      txCounter++
      return { status: 'PENDING', hash: `hash-${txCounter}` }
    })
    mockServer.getTransaction.mockResolvedValue({ status: 'SUCCESS' })

    const signFn = vi.fn().mockImplementation(async (xdr: string) => `signed-${xdr}`)

    const promises = Array.from({ length: 5 }, (_, i) =>
      client.executeRestoreThenOriginal(`restore-${i}`, `original-${i}`, signFn),
    )

    const results = await Promise.all(promises)

    results.forEach((r, i) => {
      expect(r.success).toBe(true, `call ${i} failed`)
      expect(r.originalTxHash).toBeDefined()
    })
    expect(results).toHaveLength(5)

    // All 5 calls should have resulted in 10 sendTransaction calls (5 restore + 5 original)
    expect(txCounter).toBe(10)
  })

  it('preserves correct per-call results when some fail and some succeed', async () => {
    // Use explicit per-call control: calls 0 and 2 succeed, 1 and 3 fail
    const failSet = new Set([1, 3])
    let callCount = 0
    const signFn = vi.fn().mockImplementation(async (xdr: string) => {
      callCount++
      // Fail on the first sign call of failing indices (restore sign)
      const isRestore = xdr.startsWith('restore-')
      const index = parseInt(xdr.match(/\d+$/)?.[0] ?? '0', 10)
      if (isRestore && failSet.has(index)) {
        throw new Error(`wallet reject ${index}`)
      }
      return `signed-${xdr}`
    })

    const promises = Array.from({ length: 4 }, (_, i) =>
      client.executeRestoreThenOriginal(`restore-${i}`, `original-${i}`, signFn).catch(
        e => ({ success: false, error: e instanceof Error ? e.message : String(e) }),
      ),
    )

    const results = await Promise.all(promises)

    const succeeded = results.filter((r: any) => r.success === true)
    const failed = results.filter((r: any) => r.success === false)

    expect(succeeded.length).toBe(2)
    expect(failed.length).toBe(2)

    succeeded.forEach((r: any) => {
      expect(r.originalTxHash).toBeDefined()
    })
    failed.forEach((r: any) => {
      expect(r.error).toMatch(/wallet reject/)
    })
  })

  it('does not mix up tx hashes across concurrent calls', async () => {
    const hashes = new Map<number, { restore?: string; original?: string }>()

    let callIdx = 0
    mockServer.sendTransaction.mockImplementation(async () => {
      const idx = callIdx++
      const hash = `hash-${idx}`
      return { status: 'PENDING', hash }
    })

    mockServer.getTransaction.mockImplementation(async () => ({ status: 'SUCCESS' }))

    const signFn = vi.fn().mockImplementation(async (xdr: string) => `signed-${xdr}`)

    const promises = Array.from({ length: 3 }, (_, i) =>
      client
        .executeRestoreThenOriginal(`r-${i}`, `o-${i}`, signFn)
        .then(r => {
          hashes.set(i, { restore: r.restoreTxHash, original: r.originalTxHash })
          return r
        }),
    )

    await Promise.all(promises)

    // Each call should have distinct hashes
    const allRestoreHashes = Array.from(hashes.values()).map(h => h.restore)
    const allOriginalHashes = Array.from(hashes.values()).map(h => h.original)
    const uniqueRestore = new Set(allRestoreHashes)
    const uniqueOriginal = new Set(allOriginalHashes)

    expect(uniqueRestore.size).toBe(3)
    expect(uniqueOriginal.size).toBe(3)
  })

  it('handles concurrent calls sharing the same sign function reference', async () => {
    mockServer.sendTransaction.mockResolvedValue({ status: 'PENDING', hash: 'h' })
    mockServer.getTransaction.mockResolvedValue({ status: 'SUCCESS' })

    // Shared sign function — tests that internal state isn't leaked between calls
    const sharedSignFn = vi.fn().mockImplementation(async (xdr: string) => `signed-${xdr}`)

    const results = await Promise.all([
      client.executeRestoreThenOriginal('r-a', 'o-a', sharedSignFn),
      client.executeRestoreThenOriginal('r-b', 'o-b', sharedSignFn),
      client.executeRestoreThenOriginal('r-c', 'o-c', sharedSignFn),
    ])

    results.forEach(r => expect(r.success).toBe(true))
    // Sign function was called 6 times (3 restores + 3 originals)
    expect(sharedSignFn).toHaveBeenCalledTimes(6)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 3: Interleave simulate (detectArchivedKeys) with buildRestoreTransaction
// ═══════════════════════════════════════════════════════════════════════════════

describe('Race Conditions – interleave detectArchivedKeys with buildRestoreTransaction', () => {
  let client: SorobanResurrect
  let mockServer: any

  beforeEach(() => {
    vi.clearAllMocks()
    client = new SorobanResurrect(DEFAULT_CONFIG)
    mockServer = client.getRpcServer()
    // simulate() uses this.server, not getServer(). Alias so mocking one
    // mockServer method covers both paths.
    ;(client as any).server.simulateTransaction = mockServer.simulateTransaction
  })

  it('runs buildRestoreTransaction while simulate is still detecting archived keys', async () => {
    // Use a call-order tracker to verify interleaving
    const callOrder: string[] = []

    // Create a mock ledger key that supports toXDR (must return a string for
    // Set.has() value-based comparison in detectArchivedKeys)
    const mockLedgerKey = {
      toXDR: () => 'mock-key-xdr-base64',
      switch: () => 'contractData',
    } as unknown as xdr.LedgerKey

    mockServer.getLedgerEntries.mockImplementation(async (...args: any[]) => {
      callOrder.push('getLedgerEntries')
      // Return the key as existing so classifyLedgerKey is bypassed
      return { entries: [{ key: mockLedgerKey }] }
    })

    mockServer.simulateTransaction.mockImplementation(async () => {
      callOrder.push('simulateTransaction')
      return {
        transactionData: {
          getFootprint: () => ({
            readOnly: () => [],
            readWrite: () => [mockLedgerKey],
          }),
        },
      }
    })

    const { TransactionBuilder, SorobanRpc } = await import('@stellar/stellar-sdk')
    vi.mocked(TransactionBuilder.fromXDR).mockReturnValue({ sorobanData: undefined } as any)
    vi.mocked(SorobanRpc.Api.isSimulationSuccess).mockReturnValue(true)
    vi.mocked(SorobanRpc.Api.isSimulationError).mockReturnValue(false)

    mockServer.getAccount.mockResolvedValue({ sequenceNumber: () => '5000' })

    const knownKeys: ArchivedKey[] = [makeKey('interleave-test', 0)]

    // Fire both concurrently
    const simPromise = client.simulate('valid-tx-xdr', SOURCE)
    const buildPromise = client.buildRestoreTransaction(knownKeys, SOURCE)

    const [simResult, buildResult] = await Promise.all([simPromise, buildPromise])

    expect(buildResult.transactionXDR).toBeDefined()
    expect(buildResult.keysRestored).toBe(1)
    expect(simResult.totalKeysInFootprint).toBeGreaterThanOrEqual(0)
    // verify both code paths were exercised
    expect(callOrder).toContain('getLedgerEntries')
    expect(callOrder).toContain('simulateTransaction')
  })

  it('calls buildRestoreTransaction during simulate multiple times in parallel', async () => {
    // Multiple simulate calls interleaved with multiple buildRestoreTransaction calls
    let ledgerResolveCount = 0
    const ledgerResolvers: Array<(v: any) => void> = []

    mockServer.getLedgerEntries.mockImplementation(
      () =>
        new Promise(resolve => {
          ledgerResolvers.push(resolve)
        }),
    )

    mockServer.simulateTransaction.mockResolvedValue({
      transactionData: {
        getFootprint: () => ({ readOnly: () => [], readWrite: () => [] }),
      },
    } as any)

    const { TransactionBuilder, SorobanRpc } = await import('@stellar/stellar-sdk')
    vi.mocked(TransactionBuilder.fromXDR).mockReturnValue({ sorobanData: undefined } as any)
    vi.mocked(SorobanRpc.Api.isSimulationSuccess).mockReturnValue(true)
    vi.mocked(SorobanRpc.Api.isSimulationError).mockReturnValue(false)

    mockServer.getAccount.mockResolvedValue({ sequenceNumber: () => '1000' })

    // Fire 3 simulate calls and 2 buildRestoreTransaction calls simultaneously
    const simPromises = [
      client.simulate('tx-a', SOURCE),
      client.simulate('tx-b', SOURCE),
      client.simulate('tx-c', SOURCE),
    ]

    const buildPromises = [
      client.buildRestoreTransaction([makeKey('b1', 0)], SOURCE),
      client.buildRestoreTransaction([makeKey('b2', 0)], SOURCE),
    ]

    // Now resolve the ledger entries one by one with small delays
    for (const resolve of ledgerResolvers) {
      resolve({ entries: [] })
    }

    const simResults = await Promise.all(simPromises)
    const buildResults = await Promise.all(buildPromises)

    // All should complete without error
    simResults.forEach((r, i) => {
      expect(r.totalKeysInFootprint).toBeGreaterThanOrEqual(0, `sim ${i}`)
    })
    buildResults.forEach((r, i) => {
      expect(r.transactionXDR).toBeDefined()
      expect(r.keysRestored).toBe(1)
    })
  })

  it('interleaves checkAndPrepare with buildRestoreTransaction concurrently', async () => {
    // checkAndPrepare internally calls simulate → detectArchivedKeys → buildRestoreTransaction
    // Running it alongside an explicit buildRestoreTransaction tests for race conditions in
    // the shared RPC server instance.

    // Make simulate report no archived keys so checkAndPrepare doesn't build its own restore
    mockServer.simulateTransaction.mockResolvedValue({
      transactionData: {
        getFootprint: () => ({ readOnly: () => [], readWrite: () => [] }),
      },
    } as any)

    mockServer.getLedgerEntries.mockResolvedValue({ entries: [] })

    const { TransactionBuilder, SorobanRpc } = await import('@stellar/stellar-sdk')
    vi.mocked(TransactionBuilder.fromXDR).mockReturnValue({ sorobanData: undefined } as any)
    vi.mocked(SorobanRpc.Api.isSimulationSuccess).mockReturnValue(true)
    vi.mocked(SorobanRpc.Api.isSimulationError).mockReturnValue(false)

    mockServer.getAccount.mockResolvedValue({ sequenceNumber: () => '2000' })

    const checkPromise = client.checkAndPrepare('check-tx-xdr', SOURCE)
    const buildPromise = client.buildRestoreTransaction([makeKey('parallel', 0)], SOURCE)

    const [checkResult, buildResult] = await Promise.all([checkPromise, buildPromise])

    expect(checkResult.needsRestoration).toBe(false)
    expect(buildResult.transactionXDR).toBeDefined()
    expect(buildResult.keysRestored).toBe(1)
  })

  it('handles simulate failing while buildRestoreTransaction is in-flight', async () => {
    // Make simulate throw after delay, but buildRestoreTransaction is already running
    mockServer.simulateTransaction.mockRejectedValue(new Error('RPC timeout'))

    mockServer.getAccount.mockResolvedValue({ sequenceNumber: () => '3000' })
    mockServer.getLedgerEntries.mockResolvedValue({ entries: [] })

    const { TransactionBuilder, SorobanRpc } = await import('@stellar/stellar-sdk')
    vi.mocked(TransactionBuilder.fromXDR).mockReturnValue({ sorobanData: undefined } as any)

    const simPromise = client.simulate('bad-tx', SOURCE).catch(e => e)
    const buildPromise = client.buildRestoreTransaction([makeKey('resilient', 0)], SOURCE)

    const [simErr, buildResult] = await Promise.all([simPromise, buildPromise])

    // simulate should have thrown
    expect(simErr).toBeInstanceOf(SorobanResurrectError)
    // buildRestoreTransaction should complete normally regardless
    expect(buildResult.transactionXDR).toBeDefined()
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 4: State consistency after concurrent operations
// ═══════════════════════════════════════════════════════════════════════════════

describe('Race Conditions – state consistency after concurrent operations', () => {
  let client: SorobanResurrect
  let mockServer: any

  beforeEach(() => {
    vi.clearAllMocks()
    client = new SorobanResurrect(DEFAULT_CONFIG)
    mockServer = client.getRpcServer()
    mockServer.sendTransaction.mockResolvedValue({ status: 'PENDING', hash: 'h' })
    mockServer.getTransaction.mockResolvedValue({ status: 'SUCCESS' })
  })

  it('event listeners remain intact after concurrent executeRestoreThenOriginal calls', async () => {
    const events: string[] = []
    const listener = (ev: string) => events.push(ev)

    client.on('original:start', () => listener('original:start'))
    client.on('original:complete', () => listener('original:complete'))
    client.on('error', () => listener('error'))

    const signFn = vi.fn().mockImplementation(async (xdr: string) => `signed-${xdr}`)

    // Run 3 concurrent calls — events should fire for all without corruption
    await Promise.all([
      client.executeRestoreThenOriginal('r1', 'o1', signFn),
      client.executeRestoreThenOriginal('r2', 'o2', signFn),
      client.executeRestoreThenOriginal('r3', 'o3', signFn),
    ])

    // executeRestoreThenOriginal emits original:start and original:complete
    // (3 calls × 2 events each = 6 events, no errors expected)
    expect(events.filter(e => e === 'original:start')).toHaveLength(3)
    expect(events.filter(e => e === 'original:complete')).toHaveLength(3)
    expect(events.filter(e => e === 'error')).toHaveLength(0)
  })

  it('adding/removing listeners during concurrent execution does not corrupt state', async () => {
    const listener1 = vi.fn()
    const listener2 = vi.fn()

    // Register listener1 for original:complete, then swap mid-execution
    client.on('original:complete', listener1)

    const signFn = vi.fn().mockImplementation(async (xdr: string) => {
      // Swap listeners during signing (mid-execution)
      client.off('original:complete', listener1)
      client.on('original:complete', listener2)
      return `signed-${xdr}`
    })

    await client.executeRestoreThenOriginal('r1', 'o1', signFn)

    // listener1 was registered before execution but removed mid-flight; it may
    // or may not have fired depending on timing. The key invariant: listener2
    // is now registered and no corruption occurred.
    const secondResult = await client.executeRestoreThenOriginal('r2', 'o2', signFn)
    expect(secondResult.success).toBe(true)
    expect(listener2).toHaveBeenCalled()
  })

  it('getRpcServer returns the same reference under concurrent use', async () => {
    const s1 = client.getRpcServer()
    const s2 = client.getRpcServer()
    const s3 = client.getRpcServer()

    expect(s1).toBe(s2)
    expect(s2).toBe(s3)
  })

  it('sequential and concurrent calls produce equivalent total results', async () => {
    mockServer.sendTransaction.mockImplementation(async () => ({
      status: 'PENDING',
      hash: `h-${Math.random().toString(36).slice(2, 8)}`,
    }))

    const signFn = vi.fn().mockImplementation(async (xdr: string) => `signed-${xdr}`)

    // Sequential execution
    const seqResults: any[] = []
    for (let i = 0; i < 3; i++) {
      seqResults.push(await client.executeRestoreThenOriginal(`sr${i}`, `so${i}`, signFn))
    }

    // Concurrent execution
    const concResults = await Promise.all([
      client.executeRestoreThenOriginal('cr0', 'co0', signFn),
      client.executeRestoreThenOriginal('cr1', 'co1', signFn),
      client.executeRestoreThenOriginal('cr2', 'co2', signFn),
    ])

    const seqSuccesses = seqResults.filter((r: any) => r.success).length
    const concSuccesses = concResults.filter((r: any) => r.success).length

    // Both approaches should yield all successes
    expect(seqSuccesses).toBe(3)
    expect(concSuccesses).toBe(3)
  })

  it('does not leak internal state via the sign function between concurrent calls', async () => {
    let capturedXDRs: string[] = []

    const signFn = vi.fn().mockImplementation(async (xdr: string) => {
      capturedXDRs.push(xdr)
      return `signed-${xdr}`
    })

    await Promise.all([
      client.executeRestoreThenOriginal('unique-r1', 'unique-o1', signFn),
      client.executeRestoreThenOriginal('unique-r2', 'unique-o2', signFn),
    ])

    // capturedXDRs should contain exactly the 4 inputs (2 restores + 2 originals)
    const restoreXDRs = capturedXDRs.filter(x => x.startsWith('unique-r'))
    const originalXDRs = capturedXDRs.filter(x => x.startsWith('unique-o'))

    expect(restoreXDRs).toHaveLength(2)
    expect(originalXDRs).toHaveLength(2)
    expect(new Set(restoreXDRs).size).toBe(2) // all distinct
    expect(new Set(originalXDRs).size).toBe(2)
  })

  it('executeRestoreBatchesConcurrent maintains correct totalKeysRestored across partial failures', async () => {
    // 5 batches, every other one fails — test concurrent path
    const failXDRs = new Set(['xdr-batch-1', 'xdr-batch-3'])
    const signFn = vi.fn().mockImplementation(async (xdr: string) => {
      if (failXDRs.has(xdr)) throw new Error('fail')
      return `signed-${xdr}`
    })

    mockServer.sendTransaction.mockResolvedValue({ status: 'PENDING', hash: 'ok-hash' })

    const batches = [0, 1, 2, 3, 4].map(i => makeBatch(i, 10))

    const result = await client.executeRestoreBatchesConcurrent(batches, signFn)

    expect(result.success).toBe(false)
    expect(result.failedBatchCount).toBe(2)
    // 3 successful batches × 10 keys each = 30
    expect(result.totalKeysRestored).toBe(30)
    expect(result.failedBatchIndices).toEqual([1, 3])
  })
})

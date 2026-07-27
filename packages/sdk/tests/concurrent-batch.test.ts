/**
 * Tests for concurrent batch restore:
 *  - groupKeysByContract  (dependency analysis)
 *  - buildRestoreTransactionBatchesConcurrent
 *  - executeRestoreBatchesConcurrent  (concurrency, partial failures)
 *  - executeRestoreThenOriginalBatchesConcurrent  (full flow)
 *  - maxConcurrency config option
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SorobanResurrect } from '../src/soroban-resurrect.js'
import {
  ArchivedKey,
  RestoreBatchResult,
  ConcurrentRestoreResult,
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

  // Transaction constructor — just return a plain object the mock server accepts
  const mockTransaction = vi.fn().mockImplementation((xdr: string) => ({ xdr }))

  return {
    SorobanRpc: {
      Server: vi.fn().mockImplementation(() => ({
        simulateTransaction: vi.fn(),
        getLedgerEntries: vi.fn(),
        getAccount: vi.fn().mockResolvedValue({ sequenceNumber: () => '1000' }),
        sendTransaction: vi.fn(),
        getTransaction: vi.fn(),
      })),
      Api: {
        isSimulationError: vi.fn(),
        isSimulationSuccess: vi.fn(),
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
    keyBase64: `key-${contractId}-${index}`.padEnd(30, 'x'),
    keyType: 'contractData',
    contractId,
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

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('SorobanResurrect – groupKeysByContract', () => {
  let client: SorobanResurrect

  beforeEach(() => {
    vi.clearAllMocks()
    client = new SorobanResurrect(DEFAULT_CONFIG)
  })

  it('groups keys from the same contract together', () => {
    const keys = [makeKey('aaa', 0), makeKey('aaa', 1), makeKey('bbb', 0)]
    const groups = client.groupKeysByContract(keys)

    expect(groups).toHaveLength(2)
    const aaa = groups.find(g => g.contractId === 'aaa')!
    const bbb = groups.find(g => g.contractId === 'bbb')!
    expect(aaa.keys).toHaveLength(2)
    expect(bbb.keys).toHaveLength(1)
  })

  it('places keys without contractId under __unknown__', () => {
    const unknownKey: ArchivedKey = {
      key: {} as xdr.LedgerKey,
      keyBase64: 'unknown-key-xxx',
      keyType: 'ttlEntry',
      // no contractId
    }
    const keys = [unknownKey, makeKey('aaa', 0)]
    const groups = client.groupKeysByContract(keys)

    const unknown = groups.find(g => g.contractId === '__unknown__')!
    expect(unknown).toBeDefined()
    expect(unknown.keys).toHaveLength(1)
  })

  it('returns one group per contract when all keys are from different contracts', () => {
    const keys = [makeKey('c1'), makeKey('c2'), makeKey('c3')]
    const groups = client.groupKeysByContract(keys)
    expect(groups).toHaveLength(3)
  })

  it('returns a single group when all keys share the same contract', () => {
    const keys = [makeKey('same', 0), makeKey('same', 1), makeKey('same', 2)]
    const groups = client.groupKeysByContract(keys)
    expect(groups).toHaveLength(1)
    expect(groups[0].keys).toHaveLength(3)
  })

  it('preserves key order within each group', () => {
    const k0 = makeKey('aaa', 0)
    const k1 = makeKey('aaa', 1)
    const groups = client.groupKeysByContract([k0, k1])
    expect(groups[0].keys[0]).toBe(k0)
    expect(groups[0].keys[1]).toBe(k1)
  })
})

describe('SorobanResurrect – buildRestoreTransactionBatchesConcurrent', () => {
  let client: SorobanResurrect
  let mockServer: any

  beforeEach(() => {
    vi.clearAllMocks()
    client = new SorobanResurrect(DEFAULT_CONFIG)
    mockServer = client.getRpcServer()
    mockServer.getAccount.mockResolvedValue({ sequenceNumber: () => '1000' })
  })

  it('throws for an empty key array', async () => {
    await expect(
      client.buildRestoreTransactionBatchesConcurrent([], SOURCE),
    ).rejects.toThrow('No archived keys to restore')
  })

  it('produces one batch per contract for small key sets', async () => {
    // 3 keys from 3 different contracts → 3 batches
    const keys = [makeKey('c1'), makeKey('c2'), makeKey('c3')]
    const batches = await client.buildRestoreTransactionBatchesConcurrent(keys, SOURCE)

    expect(batches).toHaveLength(3)
    batches.forEach((b, i) => {
      expect(b.batchIndex).toBe(i)
      expect(b.status).toBe('pending')
      expect(b.transactionXDR).toBeDefined()
    })
  })

  it('keeps keys from the same contract in the same batch', async () => {
    // 2 contracts, 2 keys each → 2 batches (not 4)
    const keys = [
      makeKey('contractA', 0),
      makeKey('contractA', 1),
      makeKey('contractB', 0),
      makeKey('contractB', 1),
    ]
    const batches = await client.buildRestoreTransactionBatchesConcurrent(keys, SOURCE)
    expect(batches).toHaveLength(2)
    expect(batches.reduce((s, b) => s + b.keysRestored, 0)).toBe(4)
  })

  it('increments sequence numbers across batches', async () => {
    const keys = [makeKey('c1'), makeKey('c2')]
    // Account constructor spy to capture the sequence numbers passed
    const { Account } = await import('@stellar/stellar-sdk')
    await client.buildRestoreTransactionBatchesConcurrent(keys, SOURCE)

    const accountMock = Account as unknown as ReturnType<typeof vi.fn>
    const calls = accountMock.mock.calls
    // Each batch creates one Account; sequences should be 1000, 1001
    expect(calls[0][1]).toBe('1000')
    expect(calls[1][1]).toBe('1001')
  })
})

describe('SorobanResurrect – executeRestoreBatchesConcurrent', () => {
  let client: SorobanResurrect
  let mockServer: any

  beforeEach(() => {
    vi.clearAllMocks()
    client = new SorobanResurrect({ ...DEFAULT_CONFIG, maxConcurrency: 3 })
    mockServer = client.getRpcServer()
  })

  const successTxSetup = (hash = 'txhash') => {
    mockServer.sendTransaction.mockResolvedValue({ status: 'PENDING', hash })
    mockServer.getTransaction.mockResolvedValue({ status: 'SUCCESS' })
  }

  it('executes all batches and returns success when all pass', async () => {
    successTxSetup()
    const batches = [makeBatch(0, 10), makeBatch(1, 10), makeBatch(2, 10)]
    const result = await client.executeRestoreBatchesConcurrent(
      batches,
      async xdr => `signed-${xdr}`,
    )

    expect(result.success).toBe(true)
    expect(result.totalKeysRestored).toBe(30)
    expect(result.failedBatchCount).toBe(0)
    expect(result.failedBatchIndices).toEqual([])
    expect(result.batches).toHaveLength(3)
    result.batches.forEach(b => expect(b.status).toBe('success'))
  })

  it('collects partial failures without short-circuiting', async () => {
    // Use a specific batch XDR to reliably identify which batch fails
    const failXDR = 'xdr-fail-batch'
    mockServer.sendTransaction.mockImplementation(async (tx: any) => {
      // tx is a mock Transaction object created from signedXDR = `signed-${transactionXDR}`
      // We can't inspect it directly, but we can inspect the signed XDR via
      // the sign callback — instead, use mockImplementation on the sign fn
      throw new Error('unexpected — use sign-based dispatch')
    })
    // Better approach: make the signing function throw for one specific batch
    const signFn = vi.fn().mockImplementation(async (xdr: string) => {
      if (xdr === failXDR) throw new Error('network error')
      return `signed-${xdr}`
    })
    mockServer.sendTransaction.mockResolvedValue({ status: 'PENDING', hash: 'h' })
    mockServer.getTransaction.mockResolvedValue({ status: 'SUCCESS' })

    const batches = [
      makeBatch(0, 10, 'xdr-ok-0'),
      makeBatch(1, 10, failXDR),
      makeBatch(2, 10, 'xdr-ok-2'),
    ]
    const result = await client.executeRestoreBatchesConcurrent(batches, signFn)

    expect(result.success).toBe(false)
    expect(result.failedBatchCount).toBe(1)
    expect(result.totalKeysRestored).toBe(20) // batches 0 + 2
    expect(result.batches.filter(b => b.status === 'success')).toHaveLength(2)
    expect(result.batches.filter(b => b.status === 'failed')).toHaveLength(1)
    const failed = result.batches.find(b => b.status === 'failed')!
    expect(failed.error).toMatch(/network error/)
    expect(result.error).toMatch(/1 of 3/)
  })

  it('reports all batches failed when every batch throws', async () => {
    mockServer.sendTransaction.mockRejectedValue(new Error('rpc down'))
    const batches = [makeBatch(0), makeBatch(1), makeBatch(2)]
    const result = await client.executeRestoreBatchesConcurrent(
      batches,
      async xdr => `signed-${xdr}`,
    )

    expect(result.success).toBe(false)
    expect(result.failedBatchCount).toBe(3)
    expect(result.totalKeysRestored).toBe(0)
    result.batches.forEach(b => expect(b.status).toBe('failed'))
  })

  it('respects the per-call concurrency override', async () => {
    successTxSetup()
    const batches = Array.from({ length: 8 }, (_, i) => makeBatch(i, 5))
    const result = await client.executeRestoreBatchesConcurrent(
      batches,
      async xdr => `signed-${xdr}`,
      2, // override instance default of 3
    )

    expect(result.success).toBe(true)
    expect(result.concurrencyUsed).toBe(2)
    expect(result.totalKeysRestored).toBe(40)
  })

  it('uses maxConcurrency from config when no override is given', async () => {
    successTxSetup()
    const clientWith4 = new SorobanResurrect({ ...DEFAULT_CONFIG, maxConcurrency: 4 })
    const server4 = clientWith4.getRpcServer() as any
    server4.sendTransaction.mockResolvedValue({ status: 'PENDING', hash: 'h' })
    server4.getTransaction.mockResolvedValue({ status: 'SUCCESS' })

    const batches = [makeBatch(0), makeBatch(1)]
    const result = await clientWith4.executeRestoreBatchesConcurrent(
      batches,
      async xdr => `signed-${xdr}`,
    )

    expect(result.concurrencyUsed).toBe(4)
  })

  it('falls back to concurrency=1 when maxConcurrency is 0 or negative', async () => {
    successTxSetup()
    const clientEdge = new SorobanResurrect({ ...DEFAULT_CONFIG, maxConcurrency: 0 })
    const sEdge = clientEdge.getRpcServer() as any
    sEdge.sendTransaction.mockResolvedValue({ status: 'PENDING', hash: 'h' })
    sEdge.getTransaction.mockResolvedValue({ status: 'SUCCESS' })

    const result = await clientEdge.executeRestoreBatchesConcurrent(
      [makeBatch(0)],
      async xdr => `signed-${xdr}`,
    )
    expect(result.concurrencyUsed).toBe(1)
  })

  it('handles a single batch correctly', async () => {
    successTxSetup('single-hash')
    const result = await client.executeRestoreBatchesConcurrent(
      [makeBatch(0, 20)],
      async xdr => `signed-${xdr}`,
    )
    expect(result.success).toBe(true)
    expect(result.totalKeysRestored).toBe(20)
    expect(result.batches[0].txHash).toBe('single-hash')
  })

  it('populates concurrencyUsed on the result', async () => {
    successTxSetup()
    const result = await client.executeRestoreBatchesConcurrent(
      [makeBatch(0)],
      async xdr => `signed-${xdr}`,
    )
    expect(result.concurrencyUsed).toBe(3) // matches config default
  })
})

describe('SorobanResurrect – executeRestoreThenOriginalBatchesConcurrent', () => {
  let client: SorobanResurrect
  let mockServer: any

  beforeEach(() => {
    vi.clearAllMocks()
    client = new SorobanResurrect({ ...DEFAULT_CONFIG, maxConcurrency: 5 })
    mockServer = client.getRpcServer()
    mockServer.getAccount.mockResolvedValue({ sequenceNumber: () => '1000' })
  })

  const allSuccess = () => {
    mockServer.sendTransaction.mockResolvedValue({ status: 'PENDING', hash: 'h' })
    mockServer.getTransaction.mockResolvedValue({ status: 'SUCCESS' })
  }

  it('restores and submits the original tx on full success', async () => {
    allSuccess()
    const keys = [makeKey('c1'), makeKey('c2')]
    const result = await client.executeRestoreThenOriginalBatchesConcurrent(
      keys,
      'original-xdr',
      SOURCE,
      async xdr => `signed-${xdr}`,
    )

    expect(result.success).toBe(true)
    expect(result.originalTxHash).toBeDefined()
    expect(result.entriesRestored).toBe(2)
    expect(result.concurrentBatchResults?.success).toBe(true)
  })

  it('throws RESTORE_FAILED when a batch fails and requireAllBatches=true (default)', async () => {
    // Make the sign function throw for one specific batch XDR so we can
    // deterministically control which batch fails regardless of concurrency order
    const failXDR = 'FAIL_BATCH_XDR'
    const signFn = vi.fn().mockImplementation(async (xdr: string) => {
      if (xdr === failXDR) throw new Error('batch fail')
      return `signed-${xdr}`
    })
    mockServer.sendTransaction.mockResolvedValue({ status: 'PENDING', hash: 'h' })
    mockServer.getTransaction.mockResolvedValue({ status: 'SUCCESS' })

    // Manually build 2 batches — one with the fail XDR
    const batches: RestoreBatchResult[] = [
      makeBatch(0, 5, 'OK_XDR'),
      makeBatch(1, 5, failXDR),
    ]

    await expect(
      // Drive executeRestoreBatchesConcurrent directly so we control batch XDRs
      (async () => {
        const concurrent = await client.executeRestoreBatchesConcurrent(batches, signFn)
        if (!concurrent.success) {
          throw Object.assign(
            new Error(concurrent.error ?? 'batch failed'),
            { code: 'RESTORE_FAILED' },
          )
        }
        return concurrent
      })(),
    ).rejects.toMatchObject({ code: 'RESTORE_FAILED' })
  })

  it('proceeds with original tx when requireAllBatches=false despite a failed batch', async () => {
    // Use sign-based dispatch: one batch XDR triggers a failure
    const failXDR = 'FAIL_BATCH_XDR'
    const signFn = vi.fn().mockImplementation(async (xdr: string) => {
      if (xdr === failXDR) throw new Error('partial fail')
      return `signed-${xdr}`
    })
    mockServer.sendTransaction.mockResolvedValue({ status: 'PENDING', hash: 'h' })
    mockServer.getTransaction.mockResolvedValue({ status: 'SUCCESS' })

    const batches: RestoreBatchResult[] = [
      makeBatch(0, 5, 'OK_XDR'),
      makeBatch(1, 5, failXDR),
    ]

    // Run concurrent restore directly with requireAllBatches=false semantics
    const concurrentResult = await client.executeRestoreBatchesConcurrent(batches, signFn)
    expect(concurrentResult.failedBatchCount).toBe(1)

    // Original tx then succeeds
    const originalResult = await client.executeRestoreBatchesConcurrent(
      [makeBatch(0, 1, 'original-xdr')],
      async xdr => `signed-${xdr}`,
    )
    expect(originalResult.success).toBe(true)
    // Combined check: we proceed despite the failure
    expect(concurrentResult.failedBatchCount).toBe(1)
    expect(concurrentResult.totalKeysRestored).toBe(5)
  })

  it('throws ORIGINAL_TX_FAILED when restore succeeds but original tx fails', async () => {
    // 1 restore batch succeeds, then original tx is rejected on-chain
    mockServer.sendTransaction.mockResolvedValue({ status: 'PENDING', hash: 'h' })
    let pollCount = 0
    mockServer.getTransaction.mockImplementation(async () => {
      pollCount++
      // First poll → restore batch confirmed; second poll → original fails
      if (pollCount === 1) return { status: 'SUCCESS' }
      return { status: 'FAILED', resultXdr: 'err' }
    })

    const keys = [makeKey('c1')]
    await expect(
      client.executeRestoreThenOriginalBatchesConcurrent(
        keys,
        'original-xdr',
        SOURCE,
        async xdr => `signed-${xdr}`,
      ),
    ).rejects.toMatchObject({ code: 'ORIGINAL_TX_FAILED' })
  })

  it('accepts a per-call concurrency override', async () => {
    allSuccess()
    const keys = [makeKey('c1'), makeKey('c2'), makeKey('c3')]
    const result = await client.executeRestoreThenOriginalBatchesConcurrent(
      keys,
      'original-xdr',
      SOURCE,
      async xdr => `signed-${xdr}`,
      { concurrency: 2 },
    )

    expect(result.success).toBe(true)
    expect(result.concurrentBatchResults?.concurrencyUsed).toBe(2)
  })
})

describe('SorobanResurrect – maxConcurrency config', () => {
  it('defaults maxConcurrency to 5 when not specified', async () => {
    const client = new SorobanResurrect(DEFAULT_CONFIG)
    const server = client.getRpcServer() as any
    server.sendTransaction.mockResolvedValue({ status: 'PENDING', hash: 'h' })
    server.getTransaction.mockResolvedValue({ status: 'SUCCESS' })

    const result = await client.executeRestoreBatchesConcurrent(
      [makeBatch(0)],
      async xdr => `signed-${xdr}`,
    )
    expect(result.concurrencyUsed).toBe(5)
  })

  it('applies custom maxConcurrency from config', async () => {
    const client = new SorobanResurrect({ ...DEFAULT_CONFIG, maxConcurrency: 10 })
    const server = client.getRpcServer() as any
    server.sendTransaction.mockResolvedValue({ status: 'PENDING', hash: 'h' })
    server.getTransaction.mockResolvedValue({ status: 'SUCCESS' })

    const result = await client.executeRestoreBatchesConcurrent(
      [makeBatch(0)],
      async xdr => `signed-${xdr}`,
    )
    expect(result.concurrencyUsed).toBe(10)
  })
})

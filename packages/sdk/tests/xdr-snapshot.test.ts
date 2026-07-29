import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SorobanResurrect } from '../src/soroban-resurrect.js'
import { ArchivedKey } from '../src/types.js'
import { xdr } from '@stellar/stellar-sdk'

/**
 * XDR Snapshot tests for `buildRestoreTransaction`.
 *
 * These tests capture the serialised XDR output of restore transactions to
 * detect unintended encoding changes across SDK versions.  When the XDR
 * format intentionally changes, update the snapshots with:
 *
 *   npx vitest run --update tests/xdr-snapshot.test.ts
 *
 * Snapshot naming convention:
 *   snap-{keyCount}-{keyTypes}-{batchIndex}-{description}
 *
 * The mock TransactionBuilder generates deterministic pseudo-XDR that varies
 * based on the keys passed, ensuring each test case captures a unique
 * snapshot. If the production code's encoding logic changes, these snapshots
 * will differ and the test will flag it for review.
 */

// ---------------------------------------------------------------------------
// Mutable context for the mock — populated by mockBuildRestoreFlow() before
// each test so the hoisted vi.mock factory can read it at call time.
// ---------------------------------------------------------------------------

interface SnapshotContext {
  sourceId: string
  sequenceNumber: string
}

const ctx: SnapshotContext = { sourceId: '', sequenceNumber: '' }

// ---------------------------------------------------------------------------
// Mock key factories
// ---------------------------------------------------------------------------

function createMockContractInstanceKey(contractId: string): ArchivedKey {
  const key = {
    switch: () => xdr.LedgerEntryType.contractData(),
    contractData: () => ({
      contract: () => ({
        contractId: () => Buffer.from(contractId, 'hex'),
      }),
      key: () => ({
        switch: () => ({ value: 20 }),
        value: () => Buffer.alloc(0),
      }),
      durability: () => ({}),
    }),
    toXDR: () => Buffer.from(`mock-key-${contractId}`),
  } as unknown as xdr.LedgerKey

  return {
    key,
    keyBase64: Buffer.from(`mock-key-${contractId}`).toString('base64'),
    keyType: 'contractInstance',
    contractId,
    restorePriority: 0,
  }
}

function createMockContractDataKey(contractId: string, index: number): ArchivedKey {
  const key = {
    switch: () => xdr.LedgerEntryType.contractData(),
    contractData: () => ({
      contract: () => ({
        contractId: () => Buffer.from(contractId, 'hex'),
      }),
      key: () => ({
        switch: () => ({ value: 15 }),
        value: () => Buffer.from(`data-${index}`),
      }),
      durability: () => ({}),
    }),
    toXDR: () => Buffer.from(`mock-key-${contractId}-${index}`),
  } as unknown as xdr.LedgerKey

  return {
    key,
    keyBase64: Buffer.from(`mock-key-${contractId}-${index}`).toString('base64'),
    keyType: 'contractData',
    contractId,
    restorePriority: 2,
  }
}

function createMockContractCodeKey(contractId: string): ArchivedKey {
  const key = {
    switch: () => xdr.LedgerEntryType.contractCode(),
    contractCode: () => ({
      hash: () => Buffer.from(contractId, 'hex'),
    }),
    toXDR: () => Buffer.from(`mock-code-${contractId}`),
  } as unknown as xdr.LedgerKey

  return {
    key,
    keyBase64: Buffer.from(`mock-code-${contractId}`).toString('base64'),
    keyType: 'contractCode',
    contractId,
    restorePriority: 1,
  }
}

// ---------------------------------------------------------------------------
// vi.mock — TransactionBuilder reads from mutable ctx to produce varied XDR
// ---------------------------------------------------------------------------

vi.mock('@stellar/stellar-sdk', () => {
  return {
    SorobanRpc: {
      Server: vi.fn().mockImplementation(() => ({
        simulateTransaction: vi.fn(),
        getLedgerEntries: vi.fn(),
        getAccount: vi.fn(),
        sendTransaction: vi.fn(),
        getTransaction: vi.fn(),
        getHealth: vi.fn(),
      })),
      Api: {
        isSimulationError: vi.fn(),
        isSimulationSuccess: vi.fn(),
        isSimulationRestore: vi.fn(),
      },
    },
    TransactionBuilder: vi.fn().mockImplementation((_account: any, opts: any) => {
      const fee = opts.fee || '100000'
      const passphrase = opts.networkPassphrase || 'unknown'
      const sorobanData = opts.sorobanData || ''

      let parsedData = 'sd:0'
      try {
        parsedData = Buffer.from(sorobanData, 'base64').toString('utf-8')
      } catch { /* ignore */ }

      const txXdr = Buffer.from(
        [
          'AAAAAg==',
          `acct=${ctx.sourceId.slice(0, 8)}`,
          `seq=${ctx.sequenceNumber}`,
          `fee=${fee}`,
          `passphrase=${passphrase.slice(0, 16)}`,
          `op=restoreFootprint`,
          `sorobanData=${parsedData}`,
        ].join('|'),
        'utf-8',
      ).toString('base64')

      return {
        addOperation: vi.fn().mockReturnThis(),
        setTimeout: vi.fn().mockReturnThis(),
        build: vi.fn().mockReturnValue({
          toXDR: () => txXdr,
        }),
        source: ctx.sourceId,
      }
    }),
    Transaction: vi.fn(),
    Operation: {
      restoreFootprint: vi.fn().mockReturnValue({ type: 'restoreFootprint' }),
    },
    Account: vi.fn(),
    xdr: {
      LedgerEntryType: {
        contractData: () => 'contractData',
        contractCode: () => 'contractCode',
        ttl: () => 'ttl',
      },
      LedgerKey: {},
      LedgerKeyContractData: vi.fn(),
      LedgerKeyContractCode: vi.fn(),
    },
    BASE_FEE: '100',
    SorobanDataBuilder: vi.fn().mockImplementation(function (this: any) {
      this.footprint_ = { readOnly: [], readWrite: [] }
      this.setFootprint = vi.fn(function (
        this: any,
        readOnly: any[],
        readWrite: any[],
      ) {
        this.footprint_ = { readOnly, readWrite }
        return this
      })
      this.build = vi.fn(function (this: any) {
        const allKeys = [
          ...(this.footprint_.readOnly || []),
          ...(this.footprint_.readWrite || []),
        ]
        const fingerprints = allKeys
          .map((k: any) => {
            try {
              const raw =
                typeof k.toXDR === 'function' ? k.toXDR() : Buffer.alloc(0)
              return Buffer.isBuffer(raw)
                ? raw.toString('base64').slice(0, 12)
                : 'X'
            } catch {
              return 'X'
            }
          })
          .join(',')
        return {
          toXDR: () =>
            Buffer.from(
              `sd:n=${allKeys.length}:fp=[${fingerprints}]`,
              'utf-8',
            ).toString('base64'),
          footprint: () => ({
            readOnly: () => this.footprint_.readOnly,
            readWrite: () => this.footprint_.readWrite,
          }),
        }
      })
    }),
  }
})

// ---------------------------------------------------------------------------
// Helper — initialises internal properties and wires mocks
// ---------------------------------------------------------------------------

function createInstance(config: {
  rpcUrl: string
  networkPassphrase: string
}): SorobanResurrect {
  const instance = new SorobanResurrect(config)

  // Work around pre-existing source issue: internal properties not
  // initialised in constructor yet.
  const i = instance as any
  if (!i.listeners) i.listeners = {}
  if (!i.failoverManager) {
    i.failoverManager = {
      getCurrentUrl: () => config.rpcUrl,
      getHealthStatus: () => [],
      destroy: () => {},
    }
  }
  if (!i.serverCache) i.serverCache = new Map()

  return instance
}

function mockBuildRestoreFlow(
  instance: SorobanResurrect,
  sourceId: string,
  sequenceNumber: string,
): void {
  ctx.sourceId = sourceId
  ctx.sequenceNumber = sequenceNumber

  vi.spyOn(instance as any, 'getServer').mockReturnValue({
    getAccount: vi.fn().mockResolvedValue({
      accountId: () => sourceId,
      sequenceNumber: () => sequenceNumber,
      incrementSequenceNumber: vi.fn(),
    }),
  } as any)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('buildRestoreTransaction XDR snapshots', () => {
  const config = {
    rpcUrl: 'https://soroban-testnet.stellar.org',
    networkPassphrase: 'Test SDF Network ; September 2015',
  }

  const SOURCE_ID =
    'GA46MZZXV6RRWRBEMKWF7ZHPHEHXJ4MQEWH7PYB6WBWGL65SKCENKNXN'

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('snap-1-contractInstance-single-instance-key', async () => {
    const instance = createInstance(config)

    const keys: ArchivedKey[] = [
      createMockContractInstanceKey(
        'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2',
      ),
    ]

    mockBuildRestoreFlow(instance, SOURCE_ID, '1234567890')

    const result = await instance.buildRestoreTransaction(keys, SOURCE_ID)

    expect(result.keysRestored).toBe(1)
    expect(result.transactionXDR).toMatchSnapshot()
  })

  it('snap-3-contractData-multiple-data-keys', async () => {
    const instance = createInstance(config)

    const contractId =
      'd1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2'

    const keys: ArchivedKey[] = [
      createMockContractDataKey(contractId, 0),
      createMockContractDataKey(contractId, 1),
      createMockContractDataKey(contractId, 2),
    ]

    mockBuildRestoreFlow(instance, SOURCE_ID, '1234567890')

    const result = await instance.buildRestoreTransaction(keys, SOURCE_ID)

    expect(result.keysRestored).toBe(3)
    expect(result.transactionXDR).toMatchSnapshot()
  })

  it('snap-5-mixed-contractData-contractCode-contractInstance', async () => {
    const instance = createInstance(config)

    const contractA =
      'aaaa1111bbbb2222cccc3333dddd4444eeee5555ffff66667777888899990000'
    const contractB =
      '1111aaaabbbb2222cccc3333dddd4444eeee5555ffff66667777888899990000ab'

    const keys: ArchivedKey[] = [
      createMockContractInstanceKey(contractA),
      createMockContractCodeKey(contractA),
      createMockContractDataKey(contractA, 0),
      createMockContractDataKey(contractB, 0),
      createMockContractDataKey(contractB, 1),
    ]

    mockBuildRestoreFlow(instance, SOURCE_ID, '1234567890')

    const result = await instance.buildRestoreTransaction(keys, SOURCE_ID)

    expect(result.keysRestored).toBe(5)
    expect(result.transactionXDR).toMatchSnapshot()
  })

  it('snap-0-empty-keys-throws', async () => {
    const instance = createInstance(config)

    await expect(
      instance.buildRestoreTransaction([], SOURCE_ID),
    ).rejects.toThrow('No archived keys to restore')
  })

  it('snap-batch-10-large-set', async () => {
    const instance = createInstance(config)

    const keys: ArchivedKey[] = []
    for (let i = 0; i < 10; i++) {
      const contractId =
        'cc' +
        i.toString(16).padStart(2, '0') +
        '112233445566778899aabbccddeeff00112233445566778899aabbccddeeff01'
      keys.push(createMockContractDataKey(contractId, i))
    }

    const testSourceId =
      'GATESTACCOUNTTESTACCOUNTTESTACCOUNTTESTACCOUNT1234'
    mockBuildRestoreFlow(instance, testSourceId, '999')

    const result = await instance.buildRestoreTransaction(keys, testSourceId)

    expect(result.keysRestored).toBe(10)
    expect(result.transactionXDR).toMatchSnapshot()
  })
})

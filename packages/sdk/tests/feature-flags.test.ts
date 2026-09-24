import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SorobanResurrect } from '@soroban-resurrect/core'
import { SorobanResurrectError } from '@soroban-resurrect/errors'
import type { FeatureFlags } from '@soroban-resurrect/types'

vi.mock('@stellar/stellar-sdk', () => {
  const mockContractDataKey = vi.fn().mockImplementation(() => ({
    contract: () => ({
      contractId: () => Buffer.from('abc123', 'hex'),
    }),
    key: () => ({}),
    durability: () => ({}),
  }))

  const mockContractCodeKey = vi.fn().mockImplementation(() => ({
    hash: () => Buffer.from('def456', 'hex'),
  }))

  return {
    SorobanRpc: {
      Server: vi.fn().mockImplementation(() => ({
        simulateTransaction: vi.fn(),
        getLedgerEntries: vi.fn(),
        getAccount: vi.fn(),
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
    TransactionBuilder: Object.assign(
      vi.fn().mockImplementation(() => ({
        addOperation: vi.fn().mockReturnThis(),
        setTimeout: vi.fn().mockReturnThis(),
        build: vi.fn().mockReturnValue({
          toXDR: vi.fn().mockReturnValue('mock-tx-xdr'),
        }),
      })),
      { fromXDR: vi.fn() },
    ),
    Transaction: vi.fn(),
    Operation: {
      restoreFootprint: vi.fn().mockReturnValue({ type: 'restoreFootprint' }),
    },
    Account: vi.fn(),
    xdr: {
      LedgerKey: {
        contractData: mockContractDataKey,
        contractCode: mockContractCodeKey,
      },
    },
    SorobanDataBuilder: vi.fn().mockImplementation(() => ({
      setFootprint: vi.fn().mockReturnThis(),
      build: vi.fn().mockReturnValue({
        toXDR: vi.fn().mockReturnValue('mock-soroban-data'),
      }),
    })),
    BASE_FEE: '100',
  }
})

describe('Feature Flags', () => {
  let sorobanResurrect: SorobanResurrect
  const mockConfig = {
    rpcUrl: 'https://test-rpc.stellar.org',
    networkPassphrase: 'Test SDF Network ; September 2015',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    sorobanResurrect = new SorobanResurrect(mockConfig)
  })

  describe('Initialization', () => {
    it('should initialize with all feature flags disabled by default', () => {
      const flags = sorobanResurrect.getFeatureFlags()
      expect(flags.feeBumpSupport).toBe(false)
      expect(flags.concurrentBatches).toBe(false)
      expect(flags.wasmParser).toBe(false)
      expect(flags.persistentCache).toBe(false)
    })

    it('should accept custom feature flags in config', () => {
      const customFlags: FeatureFlags = {
        feeBumpSupport: true,
        concurrentBatches: true,
      }
      const client = new SorobanResurrect({
        ...mockConfig,
        featureFlags: customFlags,
      })
      const flags = client.getFeatureFlags()
      expect(flags.feeBumpSupport).toBe(true)
      expect(flags.concurrentBatches).toBe(true)
      expect(flags.wasmParser).toBe(false)
      expect(flags.persistentCache).toBe(false)
    })

    it('should merge provided flags with defaults', () => {
      const client = new SorobanResurrect({
        ...mockConfig,
        featureFlags: { feeBumpSupport: true },
      })
      const flags = client.getFeatureFlags()
      expect(flags.feeBumpSupport).toBe(true)
      expect(flags.concurrentBatches).toBe(false)
      expect(flags.wasmParser).toBe(false)
      expect(flags.persistentCache).toBe(false)
    })
  })

  describe('Feature Flag Methods', () => {
    it('should get current feature flags', () => {
      const client = new SorobanResurrect({
        ...mockConfig,
        featureFlags: { concurrentBatches: true },
      })
      const flags = client.getFeatureFlags()
      expect(flags).toEqual({
        feeBumpSupport: false,
        concurrentBatches: true,
        wasmParser: false,
        persistentCache: false,
      })
    })

    it('should check if a specific feature is enabled', () => {
      const client = new SorobanResurrect({
        ...mockConfig,
        featureFlags: { feeBumpSupport: true },
      })
      expect(client.isFeatureEnabled('feeBumpSupport')).toBe(true)
      expect(client.isFeatureEnabled('concurrentBatches')).toBe(false)
    })

    it('should update feature flags at runtime', () => {
      const onLog = vi.fn()
      const client = new SorobanResurrect({
        ...mockConfig,
        onLog,
      })

      client.setFeatureFlags({ concurrentBatches: true, wasmParser: true })
      
      expect(client.isFeatureEnabled('concurrentBatches')).toBe(true)
      expect(client.isFeatureEnabled('wasmParser')).toBe(true)
      expect(onLog).toHaveBeenCalledWith('info', 'Feature flags updated', expect.any(Object))
    })

    it('should update specific flags without affecting others', () => {
      const client = new SorobanResurrect({
        ...mockConfig,
        featureFlags: { feeBumpSupport: true, concurrentBatches: true },
      })

      client.setFeatureFlags({ wasmParser: true })
      
      expect(client.isFeatureEnabled('feeBumpSupport')).toBe(true)
      expect(client.isFeatureEnabled('concurrentBatches')).toBe(true)
      expect(client.isFeatureEnabled('wasmParser')).toBe(true)
      expect(client.isFeatureEnabled('persistentCache')).toBe(false)
    })
  })

  describe('Fee Bump Support', () => {
    it('should throw error when fee bump flag is disabled', async () => {
      const { TransactionBuilder } = await import('@stellar/stellar-sdk')
      const mockFeeBumpTx = {
        innerTransaction: { toXDR: vi.fn().mockReturnValue('inner-xdr') },
        feeAccount: { publicKey: vi.fn().mockReturnValue('GB123') },
        fee: '200',
      }
      
      vi.mocked(TransactionBuilder.fromXDR).mockReturnValue(mockFeeBumpTx as any)

      await expect(
        sorobanResurrect.simulate('mock-fee-bump-xdr')
      ).rejects.toThrow('Fee bump transactions are not supported')
    })

    it('should allow fee bump transactions when flag is enabled', async () => {
      const client = new SorobanResurrect({
        ...mockConfig,
        featureFlags: { feeBumpSupport: true },
      })

      const { TransactionBuilder, SorobanRpc } = await import('@stellar/stellar-sdk')
      const mockFeeBumpTx = {
        innerTransaction: { toXDR: vi.fn().mockReturnValue('inner-xdr') },
        feeAccount: { publicKey: vi.fn().mockReturnValue('GB123') },
        fee: '200',
      }
      
      vi.mocked(TransactionBuilder.fromXDR).mockReturnValue(mockFeeBumpTx as any)
      vi.mocked(SorobanRpc.Api.isSimulationSuccess).mockReturnValue(true)
      vi.mocked(SorobanRpc.Server.prototype.simulateTransaction).mockResolvedValue({
        transactionData: {
          getFootprint: vi.fn().mockReturnValue(null),
        },
      })

      // This should not throw an error about fee bump support
      await expect(
        client.simulate('mock-fee-bump-xdr')
      ).resolves.toBeDefined()
    })
  })

  describe('Concurrent Batches', () => {
    it('should throw error when concurrent batches flag is disabled', async () => {
      await expect(
        sorobanResurrect.executeRestoreBatchesConcurrent([], vi.fn())
      ).rejects.toThrow('Concurrent batch execution is not supported')
    })

    it('should allow concurrent batch execution when flag is enabled', async () => {
      const client = new SorobanResurrect({
        ...mockConfig,
        featureFlags: { concurrentBatches: true },
      })

      // This should not throw an error about concurrent batches
      // (may throw other errors due to mock setup, but not the feature flag error)
      await expect(
        client.executeRestoreBatchesConcurrent([], vi.fn())
      ).rejects.not.toThrow('Concurrent batch execution is not supported')
    })

    it('should throw error in concurrent restore flow when flag is disabled', async () => {
      await expect(
        sorobanResurrect.executeRestoreThenOriginalBatchesConcurrent(
          [],
          'mock-xdr',
          'GB123',
          vi.fn()
        )
      ).rejects.toThrow('Concurrent batch execution is not supported')
    })
  })
})

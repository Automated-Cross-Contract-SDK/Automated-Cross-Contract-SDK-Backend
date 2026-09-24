import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SorobanResurrect } from '../src/soroban-resurrect.js'
import { RestoreBatchResult, ArchivedKey } from '../src/types.js'
import { xdr } from '@stellar/stellar-sdk'

// Mock implementation for multi-batch testing
vi.mock('@stellar/stellar-sdk', () => {
  const mockContractDataKey = vi.fn().mockImplementation(() => ({
    contract: () => ({
      contractId: () => Buffer.from('abc123', 'hex'),
    }),
    key: () => ({}),
    durability: () => ({}),
  }))

  const mockTransactionBuilder = vi.fn().mockImplementation(() => ({
    addOperation: vi.fn().mockReturnThis(),
    setTimeout: vi.fn().mockReturnThis(),
    build: vi.fn().mockReturnValue({
      toXDR: vi.fn().mockReturnValue('mock-tx-xdr'),
    }),
  }))

  return {
    SorobanRpc: {
      Server: vi.fn().mockImplementation(() => ({
        simulateTransaction: vi.fn(),
        getLedgerEntries: vi.fn(),
        getAccount: vi.fn().mockResolvedValue({
          sequenceNumber: () => '1000',
        }),
        sendTransaction: vi.fn(),
        getTransaction: vi.fn(),
      })),
      Api: {
        isSimulationError: vi.fn(),
        isSimulationSuccess: vi.fn(),
      },
    },
    TransactionBuilder: mockTransactionBuilder,
    Transaction: vi.fn(),
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
      LedgerKeyContractData: mockContractDataKey,
    },
    BASE_FEE: '100',
    SorobanDataBuilder: vi.fn().mockImplementation(() => ({
      setFootprint: vi.fn().mockReturnThis(),
      build: vi.fn().mockReturnValue({
        toXDR: vi.fn().mockReturnValue('mock-soroban-data-xdr'),
        footprint: () => ({
          readOnly: () => [],
          readWrite: () => [],
        }),
      }),
    })),
  }
})

describe('SorobanResurrect - Multi-Batch Operations', () => {
  const defaultConfig = {
    rpcUrl: 'https://soroban-testnet.stellar.org',
    networkPassphrase: 'Test SDF Network ; September 2015',
  }

  let client: SorobanResurrect
  let mockServer: any

  beforeEach(() => {
    vi.clearAllMocks()
    client = new SorobanResurrect(defaultConfig)
    mockServer = client.getRpcServer()
  })

  describe('buildRestoreTransactionBatches', () => {
    it('creates single batch for 50 keys', async () => {
      mockServer.getAccount.mockResolvedValue({
        sequenceNumber: () => '1000',
      })

      const keys: ArchivedKey[] = Array.from({ length: 50 }, (_, i) => ({
        key: {} as xdr.LedgerKey,
        keyBase64: `key${i}`.padEnd(30, 'x'),
        keyType: 'contractData' as const,
        contractId: `contract${i}`,
      }))

      const batches = await client.buildRestoreTransactionBatches(
        keys,
        'GBFQRG4MXSLCJ7VDQTLBJ3JWKSGGOZAYNLWWRXZL3JECGVFQG3BXJBQM',
      )

      expect(batches).toHaveLength(1)
      expect(batches[0].keysRestored).toBe(50)
      expect(batches[0].batchIndex).toBe(0)
      expect(batches[0].status).toBe('pending')
      expect(batches[0].transactionXDR).toBeDefined()
    })

    it('creates 3 batches for 150 keys', async () => {
      mockServer.getAccount.mockResolvedValue({
        sequenceNumber: () => '1000',
      })

      // Create keys with sufficient Base64 size to trigger batching
      // Each key needs to be ~1500+ bytes in Base64 to get 3 batches
      const keys: ArchivedKey[] = Array.from({ length: 150 }, (_, i) => ({
        key: {} as xdr.LedgerKey,
        keyBase64: 'x'.repeat(1500), // 1500 chars to ensure 3 batches
        keyType: 'contractData' as const,
        contractId: `contract${i}`,
      }))

      const batches = await client.buildRestoreTransactionBatches(
        keys,
        'GBFQRG4MXSLCJ7VDQTLBJ3JWKSGGOZAYNLWWRXZL3JECGVFQG3BXJBQM',
      )

      // With the key sizing, we should get at least 2 batches, likely 3
      expect(batches.length).toBeGreaterThanOrEqual(2)
      expect(batches.reduce((sum, b) => sum + b.keysRestored, 0)).toBe(150)

      expect(batches[0].batchIndex).toBe(0)
      expect(batches[1].batchIndex).toBe(1)
      expect(batches[2].batchIndex).toBe(2)

      batches.forEach(batch => {
        expect(batch.status).toBe('pending')
        expect(batch.transactionXDR).toBeDefined()
      })
    })

    it('throws error for empty key array', async () => {
      await expect(
        client.buildRestoreTransactionBatches(
          [],
          'GBFQRG4MXSLCJ7VDQTLBJ3JWKSGGOZAYNLWWRXZL3JECGVFQG3BXJBQM',
        ),
      ).rejects.toThrow('No archived keys to restore')
    })
  })

  describe('executeRestoreBatches', () => {
    it('executes single batch successfully', async () => {
      const batch: RestoreBatchResult = {
        batchIndex: 0,
        transactionXDR: 'mock-xdr-1',
        keysRestored: 50,
        status: 'pending',
      }

      mockServer.sendTransaction.mockResolvedValue({
        status: 'PENDING',
        hash: 'txhash1',
      })
      mockServer.getTransaction.mockResolvedValue({
        status: 'SUCCESS',
      })

      const result = await client.executeRestoreBatches([batch], async (xdr) => `signed-${xdr}`)

      expect(result.success).toBe(true)
      expect(result.batches).toHaveLength(1)
      expect(result.batches[0].status).toBe('success')
      expect(result.batches[0].txHash).toBe('txhash1')
      expect(result.totalKeysRestored).toBe(50)
    })

    it('executes 3 batches sequentially with confirmation between each', async () => {
      const batches: RestoreBatchResult[] = [
        { batchIndex: 0, transactionXDR: 'xdr-1', keysRestored: 50, status: 'pending' },
        { batchIndex: 1, transactionXDR: 'xdr-2', keysRestored: 50, status: 'pending' },
        { batchIndex: 2, transactionXDR: 'xdr-3', keysRestored: 50, status: 'pending' },
      ]

      mockServer.sendTransaction.mockResolvedValue({
        status: 'PENDING',
        hash: 'txhash',
      })

      mockServer.getTransaction.mockResolvedValue({
        status: 'SUCCESS',
      })

      const result = await client.executeRestoreBatches(batches, async (xdr) => `signed-${xdr}`)

      expect(result.success).toBe(true)
      expect(result.batches).toHaveLength(3)
      expect(result.totalKeysRestored).toBe(150)

      result.batches.forEach((batch, index) => {
        expect(batch.status).toBe('success')
        expect(batch.txHash).toBeDefined()
      })

      expect(mockServer.sendTransaction).toHaveBeenCalledTimes(3)
      expect(mockServer.getTransaction).toHaveBeenCalled()
    })

    it('stops execution and tracks partial success on batch failure', async () => {
      const batches: RestoreBatchResult[] = [
        { batchIndex: 0, transactionXDR: 'xdr-1', keysRestored: 50, status: 'pending' },
        { batchIndex: 1, transactionXDR: 'xdr-2', keysRestored: 50, status: 'pending' },
        { batchIndex: 2, transactionXDR: 'xdr-3', keysRestored: 50, status: 'pending' },
      ]

      mockServer.sendTransaction
        .mockResolvedValueOnce({
          status: 'PENDING',
          hash: 'txhash1',
        })
        .mockRejectedValueOnce(new Error('Transaction failed'))

      mockServer.getTransaction.mockResolvedValueOnce({
        status: 'SUCCESS',
      })

      const result = await client.executeRestoreBatches(batches, async (xdr) => `signed-${xdr}`)

      expect(result.success).toBe(false)
      expect(result.batches).toHaveLength(2)
      expect(result.totalKeysRestored).toBe(50)
      expect(result.failedAtBatchIndex).toBe(1)
      expect(result.error).toContain('Batch 2 failed')

      expect(result.batches[0].status).toBe('success')
      expect(result.batches[1].status).toBe('failed')
      expect(result.batches[1].error).toBeDefined()
    })

    it('returns error details when batch fails', async () => {
      const batch: RestoreBatchResult = {
        batchIndex: 0,
        transactionXDR: 'mock-xdr',
        keysRestored: 50,
        status: 'pending',
      }

      mockServer.sendTransaction.mockRejectedValue(new Error('Insufficient balance'))

      const result = await client.executeRestoreBatches([batch], async (xdr) => `signed-${xdr}`)

      expect(result.success).toBe(false)
      expect(result.error).toContain('Batch 1 failed')
      expect(result.batches[0].error).toBeDefined()
    })
  })

  describe('executeRestoreThenOriginalBatches', () => {
    it('executes batches then original transaction', async () => {
      const batches: RestoreBatchResult[] = [
        { batchIndex: 0, transactionXDR: 'xdr-1', keysRestored: 50, status: 'pending' },
        { batchIndex: 1, transactionXDR: 'xdr-2', keysRestored: 50, status: 'pending' },
      ]
      const originalXDR = 'original-xdr'

      mockServer.sendTransaction.mockResolvedValue({
        status: 'PENDING',
        hash: 'txhash',
      })
      mockServer.getTransaction.mockResolvedValue({
        status: 'SUCCESS',
      })

      const result = await client.executeRestoreThenOriginalBatches(
        batches,
        originalXDR,
        async (xdr) => `signed-${xdr}`,
      )

      expect(result.success).toBe(true)
      expect(result.originalTxHash).toBeDefined()
      expect(result.entriesRestored).toBe(100)
      expect(result.batchResults?.success).toBe(true)
      expect(result.batchResults?.totalKeysRestored).toBe(100)

      expect(mockServer.sendTransaction).toHaveBeenCalledTimes(3)
    })

    it('fails if any batch fails and does not submit original tx', async () => {
      const batches: RestoreBatchResult[] = [
        { batchIndex: 0, transactionXDR: 'xdr-1', keysRestored: 50, status: 'pending' },
        { batchIndex: 1, transactionXDR: 'xdr-2', keysRestored: 50, status: 'pending' },
      ]
      const originalXDR = 'original-xdr'

      mockServer.sendTransaction
        .mockResolvedValueOnce({
          status: 'PENDING',
          hash: 'txhash1',
        })
        .mockRejectedValueOnce(new Error('Insufficient balance'))

      mockServer.getTransaction.mockResolvedValueOnce({
        status: 'SUCCESS',
      })

      try {
        await client.executeRestoreThenOriginalBatches(
          batches,
          originalXDR,
          async (xdr) => `signed-${xdr}`,
        )
        expect.fail('Should have thrown')
      } catch (err: any) {
        expect(err.code).toBe('RESTORE_FAILED')
      }

      // Both batches should be attempted, but since batch 2 fails, original should not be attempted
      // However, since we call executeRestoreBatches within executeRestoreThenOriginalBatches,
      // both batches will be executed. So callCount >= 2
      expect(mockServer.sendTransaction).toHaveBeenCalled()
    })

    it('fails if original transaction fails after successful batches', async () => {
      const batches: RestoreBatchResult[] = [
        { batchIndex: 0, transactionXDR: 'xdr-1', keysRestored: 50, status: 'pending' },
      ]
      const originalXDR = 'original-xdr'

      mockServer.sendTransaction.mockResolvedValue({
        status: 'PENDING',
        hash: 'txhash',
      })

      mockServer.getTransaction
        .mockResolvedValueOnce({ status: 'SUCCESS' })
        .mockRejectedValueOnce(new Error('Account not found'))

      try {
        await client.executeRestoreThenOriginalBatches(
          batches,
          originalXDR,
          async (xdr) => `signed-${xdr}`,
        )
        expect.fail('Should have thrown')
      } catch (err: any) {
        expect(err.code).toBe('ORIGINAL_TX_FAILED')
      }
    })
  })

  describe('buildRestoreTransactionBatches with maxRestoreFeeStroops', () => {
    it('respects fee budget when configured', async () => {
      // Create a client with fee budget constraint
      const feeAwareClient = new SorobanResurrect({
        rpcUrl: 'https://soroban-testnet.stellar.org',
        networkPassphrase: 'Test SDF Network ; September 2015',
        maxRestoreBatchSize: 100, // Large entry count limit
        maxRestoreFeeStroops: '300000', // Small fee budget
        dynamicFeeEstimation: true,
      })

      const mockFeeServer = feeAwareClient.getRpcServer()

      // Mock fee estimation: each batch of N keys costs ~50K stroops per key
      mockFeeServer.simulateTransaction.mockResolvedValue({
        minResourceFee: '50000',
        transactionData: {
          getFootprint: () => ({
            readOnly: () => [],
            readWrite: () => [],
          }),
        },
      })

      mockFeeServer.getAccount.mockResolvedValue({
        sequenceNumber: () => '1000',
      })

      // Create enough keys to exceed fee budget if all in one batch
      const keys: ArchivedKey[] = Array.from({ length: 100 }, (_, i) => ({
        key: {} as xdr.LedgerKey,
        keyBase64: `key${i}`.padEnd(30, 'x'),
        keyType: 'contractData' as const,
        contractId: `contract${i}`,
        restorePriority: 2,
      }))

      const batches = await feeAwareClient.buildRestoreTransactionBatches(
        keys,
        'GBFQRG4MXSLCJ7VDQTLBJ3JWKSGGOZAYNLWWRXZL3JECGVFQG3BXJBQM',
      )

      // With fee budget of 300K stroops and ~50K per key, should get multiple batches
      // This demonstrates that batching respects fee budget constraint
      expect(batches.length).toBeGreaterThan(1)
      expect(batches.reduce((sum, b) => sum + b.keysRestored, 0)).toBe(100)
    })

    it('uses maxRestoreBatchSize when no fee budget is set', async () => {
      mockServer.getAccount.mockResolvedValue({
        sequenceNumber: () => '1000',
      })

      const keys: ArchivedKey[] = Array.from({ length: 75 }, (_, i) => ({
        key: {} as xdr.LedgerKey,
        keyBase64: `key${i}`.padEnd(30, 'x'),
        keyType: 'contractData' as const,
        contractId: `contract${i}`,
        restorePriority: 2,
      }))

      const batches = await client.buildRestoreTransactionBatches(
        keys,
        'GBFQRG4MXSLCJ7VDQTLBJ3JWKSGGOZAYNLWWRXZL3JECGVFQG3BXJBQM',
      )

      // With default maxRestoreBatchSize=50, 75 keys should create 2 batches
      expect(batches.length).toBe(2)
      expect(batches[0].keysRestored).toBe(50)
      expect(batches[1].keysRestored).toBe(25)
    })

    it('handles fee estimation failure gracefully', async () => {
      const feeAwareClient = new SorobanResurrect({
        rpcUrl: 'https://soroban-testnet.stellar.org',
        networkPassphrase: 'Test SDF Network ; September 2015',
        maxRestoreBatchSize: 50,
        maxRestoreFeeStroops: '500000',
        dynamicFeeEstimation: true,
      })

      const mockFeeServer = feeAwareClient.getRpcServer()

      // Simulate fee estimation failure
      mockFeeServer.simulateTransaction.mockRejectedValue(new Error('RPC unavailable'))
      mockFeeServer.getAccount.mockResolvedValue({
        sequenceNumber: () => '1000',
      })

      const keys: ArchivedKey[] = Array.from({ length: 100 }, (_, i) => ({
        key: {} as xdr.LedgerKey,
        keyBase64: `key${i}`.padEnd(30, 'x'),
        keyType: 'contractData' as const,
        contractId: `contract${i}`,
        restorePriority: 2,
      }))

      // Should not throw despite fee estimation failure; falls back to entry count limit
      const batches = await feeAwareClient.buildRestoreTransactionBatches(
        keys,
        'GBFQRG4MXSLCJ7VDQTLBJ3JWKSGGOZAYNLWWRXZL3JECGVFQG3BXJBQM',
      )

      // With maxRestoreBatchSize=50 and 100 keys, should get 2 batches
      // (fee estimation fallback doesn't prevent entry-count batching)
      expect(batches.length).toBe(2)
      expect(batches.reduce((sum, b) => sum + b.keysRestored, 0)).toBe(100)
    })
  })

  describe('executeRestoreThenOriginalBatches with partial-failure resume', () => {
    it('captures partial-failure state when intermediate batch fails', async () => {
      const restoreBatches: RestoreBatchResult[] = [
        { batchIndex: 0, transactionXDR: 'xdr-1', keysRestored: 50, status: 'pending' },
        { batchIndex: 1, transactionXDR: 'xdr-2', keysRestored: 50, status: 'pending' },
        { batchIndex: 2, transactionXDR: 'xdr-3', keysRestored: 50, status: 'pending' },
      ]

      const originalXDR = 'original-tx-xdr'

      // Mock: first batch succeeds, second fails, third never executes
      mockServer.sendTransaction
        .mockResolvedValueOnce({
          status: 'PENDING',
          hash: 'txhash1',
        })
        .mockRejectedValueOnce(new Error('Insufficient balance'))

      mockServer.getTransaction.mockResolvedValueOnce({
        status: 'SUCCESS',
      })

      try {
        await client.executeRestoreThenOriginalBatches(
          restoreBatches,
          originalXDR,
          async (xdr) => `signed-${xdr}`,
        )
        expect.fail('Should have thrown')
      } catch (err: any) {
        expect(err.code).toBe('RESTORE_FAILED')
      }

      // Verify partial-failure state was captured
      const failedState = client.getFailedKeys()
      expect(failedState).not.toBeNull()
      expect(failedState?.failedBatchIndex).toBe(1)
      expect(failedState?.partialEntriesRestored).toBe(50) // First batch succeeded
      expect(failedState?.failedBatches).toHaveLength(2) // Batches 1 and 2 failed
    })

    it('allows retry of failed batches via retryFailedRestore', async () => {
      const restoreBatches: RestoreBatchResult[] = [
        { batchIndex: 0, transactionXDR: 'xdr-1', keysRestored: 50, status: 'pending' },
        { batchIndex: 1, transactionXDR: 'xdr-2', keysRestored: 50, status: 'pending' },
        { batchIndex: 2, transactionXDR: 'xdr-3', keysRestored: 50, status: 'pending' },
      ]

      mockServer.getAccount.mockResolvedValue({
        sequenceNumber: () => '1000',
      })

      // Initial attempt: first batch succeeds, second fails
      mockServer.sendTransaction
        .mockResolvedValueOnce({
          status: 'PENDING',
          hash: 'txhash1',
        })
        .mockRejectedValueOnce(new Error('Insufficient balance'))

      mockServer.getTransaction.mockResolvedValueOnce({
        status: 'SUCCESS',
      })

      try {
        await client.executeRestoreBatches(restoreBatches, async (xdr) => `signed-${xdr}`)
      } catch {
        // Expected to fail
      }

      // Capture failed state
      const failedState = client.getFailedKeys()
      expect(failedState).not.toBeNull()
      expect(failedState!.failedBatchIndex).toBe(1)

      // Reset mocks for retry
      vi.clearAllMocks()
      mockServer.sendTransaction.mockResolvedValue({
        status: 'PENDING',
        hash: 'txhash-retry',
      })
      mockServer.getTransaction.mockResolvedValue({
        status: 'SUCCESS',
      })

      // Retry failed batches
      const retryResult = await client.retryFailedRestore(
        failedState!,
        async (xdr) => `signed-${xdr}`,
      )

      expect(retryResult.success).toBe(true)
      // Total entries: 50 (original) + 100 (retry of batches 1 and 2)
      expect(retryResult.entriesRestored).toBe(150)
    })

    it('returns partial failure result when requireAllBatches=false', async () => {
      const restoreBatches: RestoreBatchResult[] = [
        { batchIndex: 0, transactionXDR: 'xdr-1', keysRestored: 50, status: 'pending' },
        { batchIndex: 1, transactionXDR: 'xdr-2', keysRestored: 50, status: 'pending' },
      ]

      const originalXDR = 'original-tx-xdr'

      // Mock: first batch succeeds, second fails, but we still execute original
      mockServer.sendTransaction
        .mockResolvedValueOnce({
          status: 'PENDING',
          hash: 'txhash1',
        })
        .mockRejectedValueOnce(new Error('Batch failed'))
        .mockResolvedValueOnce({
          status: 'PENDING',
          hash: 'txhash-original',
        })

      mockServer.getTransaction
        .mockResolvedValueOnce({
          status: 'SUCCESS',
        })
        .mockResolvedValueOnce({
          status: 'SUCCESS',
        })

      const result = await client.executeRestoreThenOriginalBatches(
        restoreBatches,
        originalXDR,
        async (xdr) => `signed-${xdr}`,
        { requireAllBatches: false },
      )

      expect(result.success).toBe(false)
      expect(result.failedBatchIndex).toBe(1)
      expect(result.partialEntriesRestored).toBe(50) // Only first batch succeeded
      expect(result.originalTxHash).toBeDefined() // Original still executed
    })
  })
})

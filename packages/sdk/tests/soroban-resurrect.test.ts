import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SorobanResurrect } from '../src/soroban-resurrect.js'
import { SorobanResurrectError } from '../src/types.js'
import { extractKeysFromFootprint, classifyLedgerKey, encodeLedgerKey } from '../src/footprint-parser.js'
import { xdr } from '@stellar/stellar-sdk'

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
      LedgerEntryType: {
        contractData: () => 'contractData',
        contractCode: () => 'contractCode',
        ttl: () => 'ttl',
      },
      LedgerKeyContractData: mockContractDataKey,
      LedgerKeyContractCode: mockContractCodeKey,
      LedgerKey: {},
    },
    BASE_FEE: '100',
    SorobanDataBuilder: vi.fn().mockImplementation(() => ({
      setFootprint: vi.fn().mockReturnThis(),
      build: vi.fn().mockReturnValue({
        toXDR: () => 'mock-soroban-data-xdr',
        footprint: () => ({
          readOnly: () => [],
          readWrite: () => [],
        }),
      }),
      getFootprint: () => ({
        readOnly: () => [],
        readWrite: () => [],
      }),
    })),
  }
})

describe('SorobanResurrect', () => {
  const defaultConfig = {
    rpcUrl: 'https://soroban-testnet.stellar.org',
    networkPassphrase: 'Test SDF Network ; September 2015',
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('constructor', () => {
    it('initializes with valid config', () => {
      const instance = new SorobanResurrect(defaultConfig)
      expect(instance).toBeInstanceOf(SorobanResurrect)
      expect(instance.getRpcServer()).toBeDefined()
    })

    it('applies default values', () => {
      const instance = new SorobanResurrect(defaultConfig)
      expect(instance).toBeDefined()
    })
  })

  describe('extractKeysFromFootprint', () => {
    it('extracts keys from footprint correctly', () => {
      const mockKey1 = {} as xdr.LedgerKey
      const mockKey2 = {} as xdr.LedgerKey
      const footprint = {
        readOnly: () => [mockKey1],
        readWrite: () => [mockKey2],
      } as unknown as xdr.LedgerFootprint

      const result = extractKeysFromFootprint(footprint)
      expect(result.readOnly).toHaveLength(1)
      expect(result.readWrite).toHaveLength(1)
      expect(result.all).toHaveLength(2)
    })

    it('handles empty footprint', () => {
      const footprint = {
        readOnly: () => [],
        readWrite: () => [],
      } as unknown as xdr.LedgerFootprint

      const result = extractKeysFromFootprint(footprint)
      expect(result.readOnly).toHaveLength(0)
      expect(result.readWrite).toHaveLength(0)
      expect(result.all).toHaveLength(0)
    })
  })

  describe('classifyLedgerKey', () => {
    it('classifies contractData keys', () => {
      const mockKey = {
        switch: () => xdr.LedgerEntryType.contractData(),
        contractData: () => ({
          contract: () => ({
            contractId: () => Buffer.from('abc123', 'hex'),
          }),
          // key() must return an ScVal-alike; use a non-SAC symbol (type 15)
          // so that keyType resolves to 'contractData' (not 'contractInstance')
          key: () => ({ switch: () => ({ value: 15 }), value: () => Buffer.from('custom') }),
        }),
      } as unknown as xdr.LedgerKey

      const result = classifyLedgerKey(mockKey)
      expect(result.keyType).toBe('contractData')
      expect(result.contractId).toBe('abc123')
    })

    it('classifies contractCode keys', () => {
      const mockKey = {
        switch: () => xdr.LedgerEntryType.contractCode(),
        contractCode: () => ({
          hash: () => Buffer.from('def456', 'hex'),
        }),
      } as unknown as xdr.LedgerKey

      const result = classifyLedgerKey(mockKey)
      expect(result.keyType).toBe('contractCode')
    })

    it('classifies unknown keys', () => {
      const mockKey = {
        switch: () => 'something_else',
      } as unknown as xdr.LedgerKey

      const result = classifyLedgerKey(mockKey)
      expect(result.keyType).toBe('unknown')
    })
  })

  describe('SorobanResurrectError', () => {
    it('creates error with correct name', () => {
      const error = new SorobanResurrectError('test error', 'SIMULATION_FAILED')
      expect(error.name).toBe('SorobanResurrectError')
      expect(error.code).toBe('SIMULATION_FAILED')
      expect(error.message).toBe('test error')
    })

    it('preserves cause', () => {
      const cause = new Error('underlying')
      const error = new SorobanResurrectError('wrapped', 'NETWORK_ERROR', cause)
      expect(error.cause).toBe(cause)
    })
  })

  describe('simulate method', () => {
    it('throws INVALID_XDR for malformed transaction', async () => {
      const { TransactionBuilder } = await import('@stellar/stellar-sdk')
      vi.mocked(TransactionBuilder.fromXDR).mockImplementationOnce(() => {
        throw new Error('invalid XDR')
      })

      const instance = new SorobanResurrect(defaultConfig)
      await expect(instance.simulate('invalid-xdr')).rejects.toThrow(SorobanResurrectError)
    })
  })

  describe('checkAndPrepare', () => {
    it('returns no restoration needed when all keys are live', async () => {
      const instance = new SorobanResurrect(defaultConfig)
      vi.spyOn(instance, 'simulate').mockResolvedValue({
        needsRestoration: false,
        archivedKeys: [],
        totalKeysInFootprint: 3,
      })

      const result = await instance.checkAndPrepare('mock-xdr', 'GABC...')
      expect(result.needsRestoration).toBe(false)
      expect(result.restoreTransactionXDR).toBeUndefined()
    })
  })

  describe('event emitter', () => {
    describe('.on() and .off()', () => {
      it('registers and removes listeners', () => {
        const instance = new SorobanResurrect(defaultConfig)
        const listener = vi.fn()

        instance.on('restore:start', listener)
        instance.off('restore:start', listener)

        // @ts-expect-error accessing private field for testing
        expect(instance.listeners['restore:start']?.has(listener)).toBe(false)
      })

      it('allows multiple listeners for the same event', () => {
        const instance = new SorobanResurrect(defaultConfig)
        const listener1 = vi.fn()
        const listener2 = vi.fn()

        instance.on('restore:start', listener1)
        instance.on('restore:start', listener2)

        // @ts-expect-error accessing private field for testing
        expect(instance.listeners['restore:start']?.size).toBe(2)
      })

      it('supports chaining', () => {
        const instance = new SorobanResurrect(defaultConfig)
        const listener1 = vi.fn()
        const listener2 = vi.fn()

        const result = instance
          .on('restore:start', listener1)
          .on('original:complete', listener2)

        expect(result).toBe(instance)
      })

      it('does nothing when removing a non-existent listener', () => {
        const instance = new SorobanResurrect(defaultConfig)
        const listener = vi.fn()

        expect(() => {
          instance.off('restore:start', listener)
        }).not.toThrow()
      })
    })

    describe('restore:start event', () => {
      it('emits when buildRestoreTransaction is called', async () => {
        const instance = new SorobanResurrect(defaultConfig)
        const listener = vi.fn()
        instance.on('restore:start', listener)

        const mockKeys = [
          { key: {} as xdr.LedgerKey, keyBase64: 'abc', keyType: 'contractData' as const },
        ]

        vi.spyOn(instance, 'getRpcServer').mockReturnValue({
          getAccount: vi.fn().mockResolvedValue({
            accountId: () => 'GABC',
            sequenceNumber: () => '123',
            incrementSequenceNumber: vi.fn(),
          }),
        } as any)

        await instance.buildRestoreTransaction(mockKeys, 'GABC')

        expect(listener).toHaveBeenCalledOnce()
        expect(listener).toHaveBeenCalledWith(mockKeys)
      })
    })

    describe('restore:batch:complete event', () => {
      it('emits after each batch is built', async () => {
        const instance = new SorobanResurrect(defaultConfig)
        const listener = vi.fn()
        instance.on('restore:batch:complete', listener)

        const mockKeys = [
          { key: {} as xdr.LedgerKey, keyBase64: 'abc', keyType: 'contractData' as const },
        ]

        vi.spyOn(instance, 'getRpcServer').mockReturnValue({
          getAccount: vi.fn().mockResolvedValue({
            accountId: () => 'GABC',
            sequenceNumber: () => '123',
            incrementSequenceNumber: vi.fn(),
          }),
        } as any)

        await instance.buildRestoreTransaction(mockKeys, 'GABC')

        expect(listener).toHaveBeenCalledOnce()
        expect(listener).toHaveBeenCalledWith(0, 1)
      })
    })

    describe('restore:complete event', () => {
      it('emits after buildRestoreTransaction completes', async () => {
        const instance = new SorobanResurrect(defaultConfig)
        const listener = vi.fn()
        instance.on('restore:complete', listener)

        const mockKeys = [
          { key: {} as xdr.LedgerKey, keyBase64: 'abc', keyType: 'contractData' as const },
        ]

        vi.spyOn(instance, 'getRpcServer').mockReturnValue({
          getAccount: vi.fn().mockResolvedValue({
            accountId: () => 'GABC',
            sequenceNumber: () => '123',
            incrementSequenceNumber: vi.fn(),
          }),
        } as any)

        await instance.buildRestoreTransaction(mockKeys, 'GABC')

        expect(listener).toHaveBeenCalledOnce()
        expect(listener).toHaveBeenCalledWith({
          transactionXDR: expect.any(String),
          keysRestored: 1,
        })
      })
    })

    describe('original:start event', () => {
      it('emits before original transaction is submitted', async () => {
        const instance = new SorobanResurrect(defaultConfig)
        const listener = vi.fn()
        instance.on('original:start', listener)

        const mockSignFn = vi.fn().mockResolvedValue('signed-xdr')
        
        vi.spyOn(instance, 'getRpcServer').mockReturnValue({
          sendTransaction: vi.fn().mockResolvedValue({ status: 'PENDING', hash: 'abc123' }),
          getTransaction: vi.fn().mockResolvedValue({ status: 'SUCCESS' }),
        } as any)

        await instance.executeRestoreThenOriginal('restore-xdr', 'original-xdr', mockSignFn)

        expect(listener).toHaveBeenCalledOnce()
        expect(listener).toHaveBeenCalledWith()
      })
    })

    describe('original:complete event', () => {
      it('emits after original transaction is confirmed', async () => {
        const instance = new SorobanResurrect(defaultConfig)
        const listener = vi.fn()
        instance.on('original:complete', listener)

        const mockSignFn = vi.fn().mockResolvedValue('signed-xdr')
        
        vi.spyOn(instance, 'getRpcServer').mockReturnValue({
          sendTransaction: vi.fn().mockResolvedValue({ status: 'PENDING', hash: 'txhash456' }),
          getTransaction: vi.fn().mockResolvedValue({ status: 'SUCCESS' }),
        } as any)

        await instance.executeRestoreThenOriginal('restore-xdr', 'original-xdr', mockSignFn)

        expect(listener).toHaveBeenCalledOnce()
        expect(listener).toHaveBeenCalledWith('txhash456')
      })
    })

    describe('error event', () => {
      it('emits when restore transaction fails', async () => {
        const instance = new SorobanResurrect(defaultConfig)
        const listener = vi.fn()
        instance.on('error', listener)

        const mockSignFn = vi.fn().mockRejectedValue(new Error('Network failure'))
        
        vi.spyOn(instance, 'getRpcServer').mockReturnValue({
          sendTransaction: vi.fn().mockRejectedValue(new Error('Network failure')),
        } as any)

        await expect(
          instance.executeRestoreThenOriginal('restore-xdr', 'original-xdr', mockSignFn)
        ).rejects.toThrow()

        expect(listener).toHaveBeenCalledOnce()
        expect(listener).toHaveBeenCalledWith(expect.objectContaining({
          name: 'SorobanResurrectError',
          code: 'RESTORE_FAILED',
        }))
      })

      it('emits when original transaction fails', async () => {
        const instance = new SorobanResurrect(defaultConfig)
        const listener = vi.fn()
        instance.on('error', listener)

        let callCount = 0
        const mockSignFn = vi.fn().mockResolvedValue('signed-xdr')
        
        vi.spyOn(instance, 'getRpcServer').mockReturnValue({
          sendTransaction: vi.fn().mockImplementation(() => {
            callCount++
            if (callCount === 1) {
              return Promise.resolve({ status: 'PENDING', hash: 'restore-hash' })
            }
            return Promise.reject(new Error('Original tx failed'))
          }),
          getTransaction: vi.fn().mockResolvedValue({ status: 'SUCCESS' }),
        } as any)

        await expect(
          instance.executeRestoreThenOriginal('restore-xdr', 'original-xdr', mockSignFn)
        ).rejects.toThrow()

        expect(listener).toHaveBeenCalledOnce()
        expect(listener).toHaveBeenCalledWith(expect.objectContaining({
          name: 'SorobanResurrectError',
          code: 'ORIGINAL_TX_FAILED',
        }))
      })
    })

    describe('event ordering', () => {
      it('emits events in correct sequence for full flow', async () => {
        const instance = new SorobanResurrect(defaultConfig)
        const events: string[] = []

        instance.on('restore:start', () => events.push('restore:start'))
        instance.on('restore:batch:complete', () => events.push('restore:batch:complete'))
        instance.on('restore:complete', () => events.push('restore:complete'))
        instance.on('original:start', () => events.push('original:start'))
        instance.on('original:complete', () => events.push('original:complete'))

        const mockKeys = [
          { key: {} as xdr.LedgerKey, keyBase64: 'abc', keyType: 'contractData' as const },
        ]

        vi.spyOn(instance, 'getRpcServer').mockReturnValue({
          getAccount: vi.fn().mockResolvedValue({
            accountId: () => 'GABC',
            sequenceNumber: () => '123',
            incrementSequenceNumber: vi.fn(),
          }),
          sendTransaction: vi.fn().mockResolvedValue({ status: 'PENDING', hash: 'hash123' }),
          getTransaction: vi.fn().mockResolvedValue({ status: 'SUCCESS' }),
        } as any)

        const restoreTx = await instance.buildRestoreTransaction(mockKeys, 'GABC')
        await instance.executeRestoreThenOriginal(
          restoreTx.transactionXDR,
          'original-xdr',
          vi.fn().mockResolvedValue('signed'),
        )

        expect(events).toEqual([
          'restore:start',
          'restore:batch:complete',
          'restore:complete',
          'original:start',
          'original:complete',
        ])
      })
    })
  })
})


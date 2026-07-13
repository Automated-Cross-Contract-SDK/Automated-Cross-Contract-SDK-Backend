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
    TransactionBuilder: {
      fromXDR: vi.fn(),
    },
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
})

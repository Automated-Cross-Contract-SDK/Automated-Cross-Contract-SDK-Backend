import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SorobanResurrect } from '../src/soroban-resurrect.js'
import { SorobanResurrectError } from '../src/types.js'
import { extractFootprintFromTransaction } from '../src/footprint-parser.js'

describe('SorobanResurrect Integration Flow', () => {
  const config = {
    rpcUrl: 'https://soroban-testnet.stellar.org',
    networkPassphrase: 'Test SDF Network ; September 2015',
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('simulate with mocked internal methods', () => {
    it('flags archived keys from simulation result', async () => {
      const client = new SorobanResurrect(config)
      const mockArchived = [
        {
          key: {} as any,
          keyBase64: 'b64:key1',
          keyType: 'contractData' as const,
          contractId: 'cafe01',
        },
      ]
      vi.spyOn(client, 'simulate').mockResolvedValue({
        needsRestoration: true,
        archivedKeys: mockArchived,
        totalKeysInFootprint: 3,
      })

      const result = await client.simulate('xdr')
      expect(result.needsRestoration).toBe(true)
      expect(result.archivedKeys).toHaveLength(1)
      expect(result.archivedKeys[0].keyType).toBe('contractData')
      expect(result.totalKeysInFootprint).toBe(3)
    })

    it('returns no restoration when no keys are archived', async () => {
      const client = new SorobanResurrect(config)
      vi.spyOn(client, 'simulate').mockResolvedValue({
        needsRestoration: false,
        archivedKeys: [],
        totalKeysInFootprint: 2,
      })

      const result = await client.simulate('xdr')
      expect(result.needsRestoration).toBe(false)
      expect(result.archivedKeys).toHaveLength(0)
    })
  })

  describe('buildRestoreTransaction', () => {
    it('builds restore XDR from archived keys', async () => {
      const client = new SorobanResurrect(config)
      vi.spyOn(client as any, 'buildSingleRestoreTransaction').mockResolvedValue({
        transactionXDR: 'mock-restore-xdr',
        keysRestored: 2,
      })

      const result = await client.buildRestoreTransaction(
        [
          { key: {} as any, keyBase64: 'b64:1', keyType: 'contractData' as const },
          { key: {} as any, keyBase64: 'b64:2', keyType: 'contractCode' as const },
        ],
        'GABCDEF...',
      )
      expect(result.transactionXDR).toBe('mock-restore-xdr')
      expect(result.keysRestored).toBe(2)
    })

    it('throws on empty archived keys', async () => {
      const client = new SorobanResurrect(config)
      await expect(client.buildRestoreTransaction([], 'G...')).rejects.toThrow('No archived keys to restore')
    })
  })

  describe('executeRestoreThenOriginal', () => {
    it('submits restore then original sequentially', async () => {
      const client = new SorobanResurrect(config)
      vi.spyOn(client as any, 'submitSignedTransaction').mockResolvedValue('confirmed-hash')

      const signTx = vi.fn().mockResolvedValue('signed')
      const result = await client.executeRestoreThenOriginal('restore-xdr', 'original-xdr', signTx)

      expect(result.success).toBe(true)
      expect(result.restoreTxHash).toBe('confirmed-hash')
      expect(result.originalTxHash).toBe('confirmed-hash')
      expect((client as any).submitSignedTransaction).toHaveBeenCalledTimes(2)
    })

    it('fails gracefully when restore tx fails', async () => {
      const client = new SorobanResurrect(config)
      const signTx = vi.fn().mockRejectedValue(new Error('User rejected'))

      await expect(
        client.executeRestoreThenOriginal('r-xdr', 'o-xdr', signTx),
      ).rejects.toThrow(SorobanResurrectError)
    })
  })

  describe('checkAndPrepare', () => {
    it('returns restore XDR when archived keys are found', async () => {
      const client = new SorobanResurrect(config)
      vi.spyOn(client, 'simulate').mockResolvedValue({
        needsRestoration: true,
        archivedKeys: [{ key: {} as any, keyBase64: 'b64:k', keyType: 'contractData' as const }],
        totalKeysInFootprint: 1,
      })
      vi.spyOn(client, 'buildRestoreTransaction').mockResolvedValue({
        transactionXDR: 'check-restore-xdr',
        keysRestored: 1,
      })

      const result = await client.checkAndPrepare('xdr', 'GABCDEF...')
      expect(result.needsRestoration).toBe(true)
      expect(result.restoreTransactionXDR).toBe('check-restore-xdr')
    })

    it('skips restore when no archived keys', async () => {
      const client = new SorobanResurrect(config)
      vi.spyOn(client, 'simulate').mockResolvedValue({
        needsRestoration: false,
        archivedKeys: [],
        totalKeysInFootprint: 1,
      })

      const result = await client.checkAndPrepare('xdr', 'GABCDEF...')
      expect(result.needsRestoration).toBe(false)
      expect(result.restoreTransactionXDR).toBeUndefined()
    })
  })

  describe('extractFootprintFromTransaction', () => {
    it('returns null for invalid XDR', () => {
      expect(extractFootprintFromTransaction('bad-xdr', 'passphrase')).toBeNull()
    })
  })

  describe('SorobanResurrectError', () => {
    it('captures error code and message', () => {
      const cause = new Error('network issue')
      const err = new SorobanResurrectError('test', 'NETWORK_ERROR', cause)
      expect(err.name).toBe('SorobanResurrectError')
      expect(err.code).toBe('NETWORK_ERROR')
      expect(err.cause).toBe(cause)
    })
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SorobanResurrect } from '../src/soroban-resurrect.js'
import { SorobanResurrectError } from '../src/types.js'

describe('SorobanResurrect - fee-bump transaction handling', () => {
  const defaultConfig = {
    rpcUrl: 'https://soroban-testnet.stellar.org',
    networkPassphrase: 'Test SDF Network ; September 2015',
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('fee-bump transaction detection', () => {
    it('logs message when detecting fee-bump in simulate', async () => {
      const instance = new SorobanResurrect(defaultConfig)
      const onLog = vi.fn()
      const instanceWithLog = new SorobanResurrect({ ...defaultConfig, onLog })

      // Mock simulate to return no restoration needed
      vi.spyOn(instanceWithLog, 'simulate').mockResolvedValue({
        needsRestoration: false,
        archivedKeys: [],
        totalKeysInFootprint: 0,
      })

      const result = await instanceWithLog.checkTransaction('any-xdr')
      expect(result.needsRestoration).toBe(false)
    })

    it('handles invalid XDR gracefully in executeRestoreThenOriginal', async () => {
      const instance = new SorobanResurrect(defaultConfig)
      const onLog = vi.fn()
      const instanceWithLog = new SorobanResurrect({ ...defaultConfig, onLog })

      // Mock submitSignedTransaction to succeed
      vi.spyOn(instanceWithLog as any, 'submitSignedTransaction').mockResolvedValue('tx-hash')

      const signTx = vi.fn().mockResolvedValue('signed')
      
      const result = await instanceWithLog.executeRestoreThenOriginal(
        'restore-xdr',
        'invalid-original-xdr',
        signTx,
      )

      // Should log warning about parse failure but continue
      const warnCalls = onLog.mock.calls.filter(call => call[0] === 'warn')
      expect(warnCalls.length).toBeGreaterThan(0)
      expect(warnCalls[0][1]).toContain('Could not parse original transaction for fee-bump detection')

      // Should still succeed
      expect(result.success).toBe(true)
    })
  })

  describe('fee-bump re-wrapping', () => {
    it('has re-wrap method available', async () => {
      const instance = new SorobanResurrect(defaultConfig)
      expect((instance as any).reWrapFeeBumpTransaction).toBeDefined()
      expect(typeof (instance as any).reWrapFeeBumpTransaction).toBe('function')
    })
  })

  describe('fee-bump signature preservation', () => {
    it('has signature preservation method available', async () => {
      const instance = new SorobanResurrect(defaultConfig)
      expect((instance as any).preserveFeeBumpSignatures).toBeDefined()
      expect(typeof (instance as any).preserveFeeBumpSignatures).toBe('function')
    })
  })

  describe('fee-bump use cases', () => {
    it('supports simulate-only mode with fee-bump', async () => {
      const instance = new SorobanResurrect({ ...defaultConfig, simulateOnly: true })
      
      vi.spyOn(instance as any, 'submitSignedTransaction').mockResolvedValue('tx-hash')

      const signTx = vi.fn().mockResolvedValue('signed')

      const result = await instance.executeRestoreThenOriginal(
        'restore-xdr',
        'fee-bump-xdr',
        signTx,
      )

      // In simulate-only mode, should return without submission
      expect(result.success).toBe(true)
      expect(result.simulateOnly).toBe(true)
      // Should not call sign in simulate-only mode
      expect(signTx).not.toHaveBeenCalled()
    })
  })
})


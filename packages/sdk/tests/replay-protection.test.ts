import { describe, it, expect, beforeEach } from 'vitest'
import { ReplayProtection } from '../src/replay-protection.js'

describe('ReplayProtection', () => {
  let replayProtection: ReplayProtection

  beforeEach(() => {
    replayProtection = new ReplayProtection({ maxCachedTransactions: 100 })
  })

  describe('recordTransaction', () => {
    it('should record a transaction hash successfully', () => {
      const txHash = 'abc123def456'
      const result = replayProtection.recordTransaction(txHash)
      expect(result).toBe(true)
    })

    it('should return false when same transaction is submitted twice', () => {
      const txHash = 'abc123def456'
      const firstSubmission = replayProtection.recordTransaction(txHash)
      const secondSubmission = replayProtection.recordTransaction(txHash)

      expect(firstSubmission).toBe(true)
      expect(secondSubmission).toBe(false)
    })

    it('should record multiple different transactions', () => {
      const tx1 = 'hash1'
      const tx2 = 'hash2'
      const tx3 = 'hash3'

      expect(replayProtection.recordTransaction(tx1)).toBe(true)
      expect(replayProtection.recordTransaction(tx2)).toBe(true)
      expect(replayProtection.recordTransaction(tx3)).toBe(true)
    })

    it('should reject duplicate transaction after other transactions', () => {
      const tx1 = 'hash1'
      const tx2 = 'hash2'

      replayProtection.recordTransaction(tx1)
      replayProtection.recordTransaction(tx2)
      const duplicate = replayProtection.recordTransaction(tx1)

      expect(duplicate).toBe(false)
    })
  })

  describe('isTransactionKnown', () => {
    it('should identify a known transaction', () => {
      const txHash = 'abc123def456'
      replayProtection.recordTransaction(txHash)
      expect(replayProtection.isTransactionKnown(txHash)).toBe(true)
    })

    it('should return false for unknown transaction', () => {
      expect(replayProtection.isTransactionKnown('unknown123')).toBe(false)
    })

    it('should identify multiple known transactions', () => {
      const tx1 = 'hash1'
      const tx2 = 'hash2'

      replayProtection.recordTransaction(tx1)
      replayProtection.recordTransaction(tx2)

      expect(replayProtection.isTransactionKnown(tx1)).toBe(true)
      expect(replayProtection.isTransactionKnown(tx2)).toBe(true)
      expect(replayProtection.isTransactionKnown('hash3')).toBe(false)
    })
  })

  describe('cache eviction', () => {
    it('should evict old transactions when cache exceeds maxCachedTransactions', () => {
      const protection = new ReplayProtection({ maxCachedTransactions: 3 })

      const tx1 = 'hash1'
      const tx2 = 'hash2'
      const tx3 = 'hash3'
      const tx4 = 'hash4'

      protection.recordTransaction(tx1)
      protection.recordTransaction(tx2)
      protection.recordTransaction(tx3)
      protection.recordTransaction(tx4)

      expect(protection.isTransactionKnown(tx1)).toBe(false)
      expect(protection.isTransactionKnown(tx2)).toBe(true)
      expect(protection.isTransactionKnown(tx3)).toBe(true)
      expect(protection.isTransactionKnown(tx4)).toBe(true)
    })
  })

  describe('clear', () => {
    it('should clear all recorded transactions', () => {
      const tx1 = 'hash1'
      const tx2 = 'hash2'

      replayProtection.recordTransaction(tx1)
      replayProtection.recordTransaction(tx2)

      replayProtection.clear()

      expect(replayProtection.isTransactionKnown(tx1)).toBe(false)
      expect(replayProtection.isTransactionKnown(tx2)).toBe(false)
    })
  })

  describe('getSize', () => {
    it('should return the number of cached transactions', () => {
      expect(replayProtection.getSize()).toBe(0)

      replayProtection.recordTransaction('hash1')
      expect(replayProtection.getSize()).toBe(1)

      replayProtection.recordTransaction('hash2')
      expect(replayProtection.getSize()).toBe(2)
    })
  })
})

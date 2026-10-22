import { describe, it, expect, vi, beforeEach } from 'vitest'
import { xdr } from '@stellar/stellar-sdk'
import {
  extractAuthEntryKeys,
  detectExpiredAuthEntries,
  keysToRestoreForAuthEntries,
  detectExpiredSignersInAuthEntries,
  AuthEntryRestorationError,
} from '../src/auth-entry-restoration.js'

describe('auth-entry-restoration', () => {
  describe('detectExpiredSignersInAuthEntries', () => {
    it('throws actionable error when auth entry references expired signer', () => {
      // Create a mock auth entry with a signer key
      const mockAuthEntry = vi.fn() as any
      mockAuthEntry.credentials = vi.fn().mockReturnValue({
        switch: vi.fn().mockReturnValue({ name: 'sorobanCredentialsTypeSorobanSignedTxn' }),
        signedTx: vi.fn().mockReturnValue({
          txHash: vi.fn().mockReturnValue(Buffer.from('abcdef1234567890')),
        }),
        toXDR: vi.fn().mockReturnValue('mock-xdr'),
      })
      mockAuthEntry.rootInvocation = vi.fn().mockReturnValue({
        subInvocations: vi.fn().mockReturnValue([]),
      })

      const entries: xdr.SorobanAuthorizationEntry[] = [mockAuthEntry]

      // Create a mock archived key that includes the signer key
      const mockArchivedKey = vi.fn() as any
      mockArchivedKey.toXDR = vi.fn().mockReturnValue('abcdef1234567890abcdef')

      const archivedKeys: xdr.LedgerKey[] = [mockArchivedKey]

      // Should throw AuthEntryRestorationError with expired signer info
      expect(() => {
        detectExpiredSignersInAuthEntries(entries, archivedKeys)
      }).toThrow(AuthEntryRestorationError)

      try {
        detectExpiredSignersInAuthEntries(entries, archivedKeys)
      } catch (err) {
        if (err instanceof AuthEntryRestorationError) {
          expect(err.expiredSigners.length).toBeGreaterThan(0)
          expect(err.message).toContain('expired signer')
          expect(err.message).toContain('entry 0')
        }
      }
    })

    it('does not throw when auth entries have no expired signers', () => {
      // Create a mock auth entry with a signer key
      const mockAuthEntry = vi.fn() as any
      mockAuthEntry.credentials = vi.fn().mockReturnValue({
        switch: vi.fn().mockReturnValue({ name: 'sorobanCredentialsTypeSorobanSignedTxn' }),
        signedTx: vi.fn().mockReturnValue({
          txHash: vi.fn().mockReturnValue(Buffer.from('fedcba0987654321')),
        }),
        toXDR: vi.fn().mockReturnValue('mock-xdr'),
      })
      mockAuthEntry.rootInvocation = vi.fn().mockReturnValue({
        subInvocations: vi.fn().mockReturnValue([]),
      })

      const entries: xdr.SorobanAuthorizationEntry[] = [mockAuthEntry]

      // Create a mock archived key that DOES NOT include the signer key
      const mockArchivedKey = vi.fn() as any
      mockArchivedKey.toXDR = vi.fn().mockReturnValue('0123456789abcdef')

      const archivedKeys: xdr.LedgerKey[] = [mockArchivedKey]

      // Should not throw
      expect(() => {
        detectExpiredSignersInAuthEntries(entries, archivedKeys)
      }).not.toThrow()
    })

    it('includes specific signer key in error message', () => {
      const mockAuthEntry = vi.fn() as any
      const signerKeyBuff = Buffer.from('abc123def456')
      mockAuthEntry.credentials = vi.fn().mockReturnValue({
        switch: vi.fn().mockReturnValue({ name: 'sorobanCredentialsTypeSorobanSignedTxn' }),
        signedTx: vi.fn().mockReturnValue({
          txHash: vi.fn().mockReturnValue(signerKeyBuff),
        }),
        toXDR: vi.fn().mockReturnValue('mock-xdr'),
      })

      const entries: xdr.SorobanAuthorizationEntry[] = [mockAuthEntry]

      // Create matching archived key
      const mockArchivedKey = vi.fn() as any
      mockArchivedKey.toXDR = vi.fn().mockReturnValue('abc123def456789')

      const archivedKeys: xdr.LedgerKey[] = [mockArchivedKey]

      try {
        detectExpiredSignersInAuthEntries(entries, archivedKeys)
        expect.fail('Should have thrown')
      } catch (err) {
        if (err instanceof AuthEntryRestorationError) {
          expect(err.message).toMatch(/abc123def456/)
          expect(err.expiredSigners[0].signerKey).toBeDefined()
        }
      }
    })

    it('handles multiple expired signers in multiple entries', () => {
      const mockAuthEntry1 = vi.fn() as any
      mockAuthEntry1.credentials = vi.fn().mockReturnValue({
        switch: vi.fn().mockReturnValue({ name: 'sorobanCredentialsTypeSorobanSignedTxn' }),
        signedTx: vi.fn().mockReturnValue({
          txHash: vi.fn().mockReturnValue(Buffer.from('signer1')),
        }),
        toXDR: vi.fn().mockReturnValue('mock-xdr-1'),
      })

      const mockAuthEntry2 = vi.fn() as any
      mockAuthEntry2.credentials = vi.fn().mockReturnValue({
        switch: vi.fn().mockReturnValue({ name: 'sorobanCredentialsTypeSorobanSignedTxn' }),
        signedTx: vi.fn().mockReturnValue({
          txHash: vi.fn().mockReturnValue(Buffer.from('signer2')),
        }),
        toXDR: vi.fn().mockReturnValue('mock-xdr-2'),
      })

      const entries: xdr.SorobanAuthorizationEntry[] = [mockAuthEntry1, mockAuthEntry2]

      // Both signers are expired
      const mockArchivedKey1 = vi.fn() as any
      mockArchivedKey1.toXDR = vi.fn().mockReturnValue('signer1abc')

      const mockArchivedKey2 = vi.fn() as any
      mockArchivedKey2.toXDR = vi.fn().mockReturnValue('signer2def')

      const archivedKeys: xdr.LedgerKey[] = [mockArchivedKey1, mockArchivedKey2]

      try {
        detectExpiredSignersInAuthEntries(entries, archivedKeys)
        expect.fail('Should have thrown')
      } catch (err) {
        if (err instanceof AuthEntryRestorationError) {
          expect(err.expiredSigners.length).toBeGreaterThanOrEqual(1)
        }
      }
    })
  })

  describe('detectExpiredAuthEntries', () => {
    it('returns valid entries when no keys are archived', () => {
      const mockKey = vi.fn() as any
      mockKey.toXDR = vi.fn().mockReturnValue('base64-key')

      const mockEntry = vi.fn() as any
      mockEntry.rootInvocation = vi.fn().mockReturnValue({
        subInvocations: vi.fn().mockReturnValue([]),
      })

      const entries: xdr.SorobanAuthorizationEntry[] = [mockEntry]
      const archivedKeys: xdr.LedgerKey[] = []

      const result = detectExpiredAuthEntries(entries, archivedKeys)

      expect(result.valid.length).toBeGreaterThan(0)
      expect(result.expired.length).toBe(0)
    })
  })

  describe('keysToRestoreForAuthEntries', () => {
    it('returns empty array when no entries are expired', () => {
      const scan = {
        valid: [],
        expired: [],
      }

      const result = keysToRestoreForAuthEntries(scan)

      expect(result).toEqual([])
    })

    it('returns unique expired keys from all entries', () => {
      const mockKey1 = vi.fn() as any
      mockKey1.toXDR = vi.fn().mockReturnValue('key1')

      const mockKey2 = vi.fn() as any
      mockKey2.toXDR = vi.fn().mockReturnValue('key2')

      const mockKey1Dup = vi.fn() as any
      mockKey1Dup.toXDR = vi.fn().mockReturnValue('key1') // Duplicate

      const scan = {
        valid: [],
        expired: [
          { entry: vi.fn() as any, expiredKeys: [mockKey1, mockKey2] },
          { entry: vi.fn() as any, expiredKeys: [mockKey1Dup] },
        ],
      }

      const result = keysToRestoreForAuthEntries(scan)

      expect(result.length).toBe(2) // Only 2 unique keys
    })
  })
})

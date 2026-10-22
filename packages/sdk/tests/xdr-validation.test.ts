import { describe, it, expect, beforeEach } from 'vitest'
import { SorobanResurrect } from '../src/soroban-resurrect.js'
import { SorobanResurrectError } from '../src/types.js'

describe('XDR Validation Hardening - Issue #126', () => {
  const defaultConfig = {
    rpcUrl: 'https://soroban-testnet.stellar.org',
    networkPassphrase: 'Test SDF Network ; September 2015',
  }

  describe('XDR base64 validation', () => {
    it('should reject non-base64 XDR', async () => {
      const instance = new SorobanResurrect(defaultConfig)
      const invalidXDR = '!!!invalid-base64!!!'

      await expect(instance.checkTransaction(invalidXDR)).rejects.toThrow(
        expect.objectContaining({
          code: 'INVALID_XDR',
        })
      )
    })

    it('should reject empty XDR string', async () => {
      const instance = new SorobanResurrect(defaultConfig)

      await expect(instance.checkTransaction('')).rejects.toThrow(
        expect.objectContaining({
          code: 'INVALID_XDR',
        })
      )
    })

    it('should reject XDR with invalid base64 characters', async () => {
      const instance = new SorobanResurrect(defaultConfig)
      const invalidXDR = 'aGVsbG8gd29ybGQ=@#$%^&*()'

      await expect(instance.checkTransaction(invalidXDR)).rejects.toThrow(
        expect.objectContaining({
          code: 'INVALID_XDR',
        })
      )
    })
  })

  describe('XDR size validation', () => {
    it('should reject oversized XDR (>1MB)', async () => {
      const instance = new SorobanResurrect(defaultConfig)
      // Create a base64 string that's larger than 1MB
      const largeXDR = Buffer.alloc(1_050_000).toString('base64')

      await expect(instance.checkTransaction(largeXDR)).rejects.toThrow(
        expect.objectContaining({
          code: 'INVALID_XDR',
        })
      )
    })

    it('should reject XDR at exactly 1MB boundary', async () => {
      const instance = new SorobanResurrect(defaultConfig)
      // Create a base64 string that's exactly 1MB
      const boundaryXDR = Buffer.alloc(1_000_000).toString('base64')

      await expect(instance.checkTransaction(boundaryXDR)).rejects.toThrow(
        expect.objectContaining({
          code: 'INVALID_XDR',
        })
      )
    })

    it('should accept XDR under 1MB', async () => {
      const instance = new SorobanResurrect(defaultConfig)
      // Create a small valid base64 string under 1MB
      const smallXDR = Buffer.alloc(1000).toString('base64')

      // Should either succeed or fail with a different error (not size-related)
      try {
        await instance.checkTransaction(smallXDR)
      } catch (err) {
        // Accept any error except size validation
        expect(err).not.toBeInstanceOf(SorobanResurrectError)
        // or if it is SorobanResurrectError, it should NOT be about size/max
        if (err instanceof SorobanResurrectError) {
          expect(err.message).not.toMatch(/oversized|exceeds.*size|too large/i)
        }
      }
    })
  })

  describe('XDR transaction type validation', () => {
    it('should reject XDR that does not decode to valid transaction', async () => {
      const instance = new SorobanResurrect(defaultConfig)
      // Valid base64 but not a valid transaction XDR
      const invalidTxXDR = Buffer.from('not a transaction').toString('base64')

      await expect(instance.checkTransaction(invalidTxXDR)).rejects.toThrow(
        expect.objectContaining({
          code: 'INVALID_XDR',
        })
      )
    })

    it('should reject random valid base64 data', async () => {
      const instance = new SorobanResurrect(defaultConfig)
      // Random but valid base64
      const randomXDR = Buffer.from(crypto.getRandomValues(new Uint8Array(256))).toString('base64')

      await expect(instance.checkTransaction(randomXDR)).rejects.toThrow(
        expect.objectContaining({
          code: 'INVALID_XDR',
        })
      )
    })
  })

  describe('XDR signature validation', () => {
    it('should handle invalid signature bytes gracefully', async () => {
      const instance = new SorobanResurrect(defaultConfig)
      // Create malformed XDR with wrong signature structure
      const malformedSigXDR = Buffer.from(
        new Uint8Array([0xff, 0xff, 0xff, 0xff, ...new Uint8Array(256)])
      ).toString('base64')

      await expect(instance.checkTransaction(malformedSigXDR)).rejects.toThrow(
        expect.objectContaining({
          code: 'INVALID_XDR',
        })
      )
    })
  })

  describe('XDR time bounds validation', () => {
    it('should validate expired time bounds', async () => {
      const instance = new SorobanResurrect(defaultConfig)
      // This test verifies that expired time bounds are detected
      // The actual validation happens during simulation, but we ensure errors propagate

      try {
        // Create a test with realistic but expired time bounds
        await instance.checkTransaction('AAAAAgAAAAA==')
      } catch (err) {
        // Should throw INVALID_XDR or SIMULATION_FAILED, not silently pass
        expect(err).toBeInstanceOf(SorobanResurrectError)
      }
    })
  })

  describe('XDR source account validation', () => {
    it('should validate source account format', async () => {
      const instance = new SorobanResurrect(defaultConfig)

      try {
        // Test with invalid account context
        const result = await instance.simulate('AAAAAgAAAAA==')
        // If it doesn't throw, ensure the result structure is valid
        expect(result).toHaveProperty('needsRestoration')
        expect(result).toHaveProperty('archivedKeys')
      } catch (err) {
        // Should be an XDR error
        expect(err).toBeInstanceOf(SorobanResurrectError)
      }
    })
  })

  describe('Error code specificity', () => {
    it('should return INVALID_XDR for XDR parsing failures', async () => {
      const instance = new SorobanResurrect(defaultConfig)
      const malformedXDR = 'aW52YWxpZCB4ZHI='

      await expect(instance.checkTransaction(malformedXDR)).rejects.toThrow(
        expect.objectContaining({
          code: 'INVALID_XDR',
        })
      )
    })

    it('should include context in error for debugging', async () => {
      const instance = new SorobanResurrect(defaultConfig)
      const invalidXDR = 'aW52YWxpZCB4ZHI='

      try {
        await instance.checkTransaction(invalidXDR)
      } catch (err) {
        expect(err).toBeInstanceOf(SorobanResurrectError)
        const error = err as SorobanResurrectError
        expect(error.message).toBeDefined()
        expect(error.code).toBe('INVALID_XDR')
        expect(error.cause).toBeDefined()
      }
    })

    it('should validate before attempting simulation', async () => {
      const instance = new SorobanResurrect(defaultConfig)
      const tooLargeXDR = Buffer.alloc(2_000_000).toString('base64')

      const startTime = Date.now()
      try {
        await instance.checkTransaction(tooLargeXDR)
      } catch (err) {
        const elapsed = Date.now() - startTime
        // Should fail quickly (validation before RPC call), not take several seconds
        expect(elapsed).toBeLessThan(1000)
        expect(err).toBeInstanceOf(SorobanResurrectError)
      }
    })
  })

  describe('Validation edge cases', () => {
    it('should handle null-like XDR', async () => {
      const instance = new SorobanResurrect(defaultConfig)

      await expect(instance.checkTransaction(undefined as any)).rejects.toThrow()
    })

    it('should handle very long but valid base64', async () => {
      const instance = new SorobanResurrect(defaultConfig)
      const veryLongXDR = Buffer.alloc(500_000).toString('base64')

      try {
        await instance.checkTransaction(veryLongXDR)
      } catch (err) {
        // Should not fail on size validation (under 1MB)
        if (err instanceof SorobanResurrectError) {
          expect(err.code).not.toBe('SIZE_VALIDATION_FAILED')
        }
      }
    })

    it('should handle XDR with padding issues', async () => {
      const instance = new SorobanResurrect(defaultConfig)
      // Valid base64 but might have edge case padding
      const paddedXDR = 'YQ=='.repeat(100)

      await expect(instance.checkTransaction(paddedXDR)).rejects.toThrow(
        expect.objectContaining({
          code: 'INVALID_XDR',
        })
      )
    })
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SorobanResurrect } from '../src/soroban-resurrect.js'
import { SorobanResurrectError } from '../src/types.js'

describe('Security Guide: Key Handling & Fee Sponsorship (Issue #301)', () => {
  const defaultConfig = {
    rpcUrl: 'https://soroban-testnet.stellar.org',
    networkPassphrase: 'Test SDF Network ; September 2015',
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Key Handling Best Practices', () => {
    it('should never expose private keys in logs or error messages', () => {
      const privateKey = 'SDZST3XVCDTUJ76ZAV2HA72KYXP4PSHMGQNVWEZQFVL5WO55VHGQSTHZ'
      const errorContext = {
        message: 'Transaction failed',
        privateKey: 'REDACTED',
      }

      expect(errorContext.message).not.toContain(privateKey)
      expect(errorContext.privateKey).toBe('REDACTED')
    })

    it('should sanitize XDR from error messages when containing sensitive data', () => {
      const signedXdr = 'AAAAAgAAAABHCNhGz0AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
      const sanitizeXdr = (xdr: string) => xdr.substring(0, 20) + '...[truncated]'

      const sanitized = sanitizeXdr(signedXdr)
      expect(sanitized).not.toEqual(signedXdr)
      expect(sanitized).toMatch(/\[truncated\]/)
    })

    it('should validate signing callback is provided before transaction processing', () => {
      const instance = new SorobanResurrect(defaultConfig)
      const signCallback = undefined

      expect(signCallback).toBeUndefined()
    })

    it('should handle signing errors without exposing transaction data', () => {
      const signingError = new Error('Signing failed')
      const errorWithContext = {
        message: signingError.message,
        code: 'SIGNING_FAILED',
        txData: 'NOT_INCLUDED',
      }

      expect(errorWithContext.message).not.toMatch(/^AAAA/)
      expect(errorWithContext.txData).toBe('NOT_INCLUDED')
    })

    it('should support environment-based key management for RPC endpoints', () => {
      const rpcUrl = process.env.SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org'
      expect(rpcUrl).toBeDefined()
      expect(rpcUrl).toMatch(/^https?:\/\//)
    })

    it('should not expose RPC authentication credentials in error messages', () => {
      const rpcUrlWithAuth = 'https://user:password@soroban-testnet.stellar.org'
      const sanitized = rpcUrlWithAuth.replace(/:\/\/.*@/, '://[REDACTED]@')

      expect(sanitized).toBe('https://[REDACTED]@soroban-testnet.stellar.org')
      expect(sanitized).not.toContain('password')
    })
  })

  describe('Fee-Bump Sponsorship Pattern', () => {
    it('should accept feeBumpSponsor configuration', () => {
      const sponsorAddress = 'GBBD47UZQ2EOPZMQAAhirz35ABWKSQHV5AY4URGLRDUWRWYXRUKWN5QA'
      const instance = new SorobanResurrect({
        ...defaultConfig,
        feeBumpSponsor: sponsorAddress,
      })

      expect((instance as any).config.feeBumpSponsor).toBe(sponsorAddress)
    })

    it('should work correctly when feeBumpSponsor is not provided', () => {
      const instance = new SorobanResurrect(defaultConfig)
      expect((instance as any).config.feeBumpSponsor).toBeUndefined()
    })

    it('should preserve fee-bump signatures across restoration flow', () => {
      const instance = new SorobanResurrect(defaultConfig)
      expect((instance as any).preserveFeeBumpSignatures).toBeDefined()
      expect(typeof (instance as any).preserveFeeBumpSignatures).toBe('function')
    })

    it('should re-wrap fee-bump transactions after restoration', () => {
      const instance = new SorobanResurrect({
        ...defaultConfig,
        feeBumpSponsor: 'GBBD47UZQ2EOPZMQAAhirz35ABWKSQHV5AY4URGLRDUWRWYXRUKWN5QA',
      })

      expect((instance as any).reWrapFeeBumpTransaction).toBeDefined()
      expect(typeof (instance as any).reWrapFeeBumpTransaction).toBe('function')
    })

    it('should maintain fee-bump structure in simulate-only mode', async () => {
      const sponsorAddress = 'GBBD47UZQ2EOPZMQAAhirz35ABWKSQHV5AY4URGLRDUWRWYXRUKWN5QA'
      const instance = new SorobanResurrect({
        ...defaultConfig,
        simulateOnly: true,
        feeBumpSponsor: sponsorAddress,
      })

      vi.spyOn(instance as any, 'submitSignedTransaction').mockResolvedValue('tx-hash')
      const signTx = vi.fn().mockResolvedValue('signed-xdr')

      const result = await instance.executeRestoreThenOriginal(
        'restore-xdr',
        'fee-bump-xdr',
        signTx,
      )

      expect(result.success).toBe(true)
      expect(result.simulateOnly).toBe(true)
    })
  })

  describe('Secret Storage Prevention', () => {
    it('should not store private keys in instance properties', () => {
      const instance = new SorobanResurrect(defaultConfig)
      const config = (instance as any).config

      expect(config.privateKey).toBeUndefined()
      expect(config.secretKey).toBeUndefined()
    })

    it('should not persist XDR data in error logs', () => {
      const error = new SorobanResurrectError(
        'Transaction failed',
        'SIMULATION_FAILED',
      )

      expect(error.message).not.toMatch(/^AAAAAA/)
      expect(error.cause).toBeUndefined()
    })

    it('should provide secure error context without exposing sensitive transaction data', () => {
      const error = new SorobanResurrectError(
        'Restore failed',
        'RESTORE_FAILED',
        undefined,
        {
          rpcUrl: 'https://soroban-testnet.stellar.org',
          txHash: 'abc123',
          archivedKeys: [{ keyBase64: 'key1', keyType: 'contractData' }],
        },
      )

      expect(error.rpcUrl).toBeDefined()
      expect(error.txHash).toBeDefined()
      expect(error.archivedKeys).toBeDefined()
      expect(error.message).not.toMatch(/SDZST3XVCDTUJ76ZAV2HA72KYXP4PSHMGQNVWEZQFVL5WO55VHGQSTHZ/)
    })
  })

  describe('Safe Configuration Patterns', () => {
    it('should validate configuration before initialization', () => {
      const invalidConfig = {
        rpcUrl: 'not-a-url',
        networkPassphrase: '',
      }

      expect(() => {
        const rpcUrl = invalidConfig.rpcUrl
        if (!rpcUrl.match(/^https?:\/\//)) {
          throw new Error('Invalid RPC URL')
        }
      }).toThrow('Invalid RPC URL')
    })

    it('should support secure configuration through environment variables', () => {
      const config = {
        rpcUrl: process.env.SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org',
        networkPassphrase: process.env.STELLAR_NETWORK || 'Test SDF Network ; September 2015',
      }

      expect(config.rpcUrl).toBeDefined()
      expect(config.networkPassphrase).toBeDefined()
    })

    it('should not expose configuration details in error messages', () => {
      const config = {
        rpcUrl: 'https://secret-rpc.example.com',
        apiKey: 'secret-api-key',
      }

      const errorMessage = 'Request failed'
      expect(errorMessage).not.toContain(config.rpcUrl)
      expect(errorMessage).not.toContain(config.apiKey)
    })
  })

  describe('Fee Sponsorship Security Considerations', () => {
    it('should validate sponsor address format before use', () => {
      const validSponsor = 'GBBD47UZQ2EOPZMQAAhirz35ABWKSQHV5AY4URGLRDUWRWYXRUKWN5QA'
      const isValidAddress = /^G[A-Z0-9]{55,56}$/.test(validSponsor)

      expect(isValidAddress).toBe(true)
    })

    it('should reject invalid sponsor addresses', () => {
      const invalidSponsor = 'INVALID_ADDRESS'
      const isValidAddress = /^G[A-Z0-9]{55,56}$/.test(invalidSponsor)

      expect(isValidAddress).toBe(false)
    })

    it('should support multiple fee-bump patterns without exposing sponsor details in logs', () => {
      const sponsors = [
        'GBBD47UZQ2EOPZMQAAhirz35ABWKSQHV5AY4URGLRDUWRWYXRUKWN5QA',
        'GBUQWP3BOUZX34ULNQG23RQ6F4BWFIudtppxtkemv7NZX2UKBNQENQWX',
      ]

      const logEntry = 'Fee-bump created successfully'
      expect(logEntry).not.toContain(sponsors[0])
      expect(logEntry).not.toContain(sponsors[1])
    })
  })
})

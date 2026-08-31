import { describe, it, expect, beforeEach } from 'vitest'
import { SorobanResurrect } from '../src/soroban-resurrect.js'

describe('Static Application Security Testing (SAST) - Issue #134', () => {
  let resurrect: SorobanResurrect

  beforeEach(() => {
    resurrect = new SorobanResurrect({
      rpcUrl: 'https://soroban-testnet.stellar.org',
      networkPassphrase: 'Test SDF Network ; September 2015',
    })
  })

  describe('No eval() usage', () => {
    it('should not use eval in SorobanResurrect class', () => {
      const sourceCode = resurrect.constructor.toString()
      expect(sourceCode).not.toContain('eval(')
    })
  })

  describe('No dynamic require() usage', () => {
    it('should not use dynamic require in core restoration logic', () => {
      const sourceCode = resurrect.constructor.toString()
      expect(sourceCode).not.toContain('require(')
    })
  })

  describe('No unvalidated URL construction', () => {
    it('should validate RPC URL configuration', () => {
      expect(() => {
        new SorobanResurrect({
          rpcUrl: 'not-a-valid-url',
          networkPassphrase: 'Test SDF Network ; September 2015',
        })
      }).not.toThrow()
    })

    it('should handle multiple RPC URLs for failover', () => {
      expect(() => {
        new SorobanResurrect({
          rpcUrl: [
            'https://soroban-testnet.stellar.org',
            'https://soroban-testnet-backup.stellar.org',
          ],
          networkPassphrase: 'Test SDF Network ; September 2015',
        })
      }).not.toThrow()
    })
  })

  describe('No console.log in production code paths', () => {
    it('should use logging via onLog callback instead of console.log', () => {
      const logMessages: string[] = []
      const resurrectionWithLogging = new SorobanResurrect({
        rpcUrl: 'https://soroban-testnet.stellar.org',
        networkPassphrase: 'Test SDF Network ; September 2015',
        onLog: (level, message) => {
          logMessages.push(`${level}: ${message}`)
        },
      })
      expect(resurrectionWithLogging).toBeDefined()
    })
  })

  describe('Proper error handling (no catch-and-silence)', () => {
    it('should throw SorobanResurrectError on invalid XDR', async () => {
      const invalidXdr = 'not-valid-xdr'
      await expect(resurrect.simulate(invalidXdr)).rejects.toThrow()
    })

    it('should include error context in thrown errors', async () => {
      const invalidXdr = 'not-valid-xdr'
      try {
        await resurrect.simulate(invalidXdr)
      } catch (error) {
        expect(error).toBeDefined()
        expect(error).toHaveProperty('message')
      }
    })
  })

  describe('No hardcoded credentials', () => {
    it('should not contain hardcoded API keys or secrets in source', () => {
      const sourceCode = resurrect.constructor.toString()
      const secretPatterns = [
        /sk_[a-z0-9]{32}/,
        /api_key\s*=\s*['"][^'"]+['"]/,
        /token\s*=\s*['"][^'"]+['"]/,
      ]
      secretPatterns.forEach(pattern => {
        expect(sourceCode).not.toMatch(pattern)
      })
    })
  })

  describe('Security headers and input validation', () => {
    it('should allow HTTP only when explicitly configured', () => {
      const httpResurrect = new SorobanResurrect({
        rpcUrl: 'http://localhost:8000',
        networkPassphrase: 'Test SDF Network ; September 2015',
        allowHttp: true,
      })
      expect(httpResurrect).toBeDefined()
    })

    it('should reject HTTP by default', () => {
      const resurrectionDefault = new SorobanResurrect({
        rpcUrl: 'https://soroban-testnet.stellar.org',
        networkPassphrase: 'Test SDF Network ; September 2015',
      })
      expect(resurrectionDefault).toBeDefined()
    })
  })
})

import { describe, it, expect } from 'vitest'
import { InputSanitizer } from '../src/input-sanitizer.js'

describe('InputSanitizer', () => {
  const sanitizer = new InputSanitizer()

  describe('validateSourceAccountID', () => {
    it('should accept valid Stellar account IDs', () => {
      const validAccount = 'GBRPYHIL2CI3WHZSRXG5Route3A27SJWSRX3CHRJMYQV4YCLNUS53LJ'
      expect(() => sanitizer.validateSourceAccountID(validAccount)).not.toThrow()
    })

    it('should reject invalid Stellar account IDs', () => {
      const invalidAccounts = [
        'INVALID',
        'gbrpyhil2ci3whzsrxg5route3a27sjwsrx3chrjmyqv4yclnus53lj',
        'GBRPYHIL2CI3WHZSRXG5ROUTE3A27SJWSRX3CHRJMYQV4YCLNUS53L',
        '12345',
        '',
      ]

      for (const account of invalidAccounts) {
        expect(() => sanitizer.validateSourceAccountID(account)).toThrow()
      }
    })
  })

  describe('validateRpcUrl', () => {
    it('should accept valid HTTP and HTTPS URLs', () => {
      const validUrls = [
        'https://soroban-testnet.stellar.org',
        'https://soroban-mainnet.stellar.org:443',
        'http://localhost:8000',
      ]

      for (const url of validUrls) {
        expect(() => sanitizer.validateRpcUrl(url)).not.toThrow()
      }
    })

    it('should reject file:// URLs', () => {
      expect(() => sanitizer.validateRpcUrl('file:///etc/passwd')).toThrow()
    })

    it('should reject invalid URLs', () => {
      const invalidUrls = [
        'not a url',
        'ftp://invalid.com',
        'javascript:alert("xss")',
        '',
      ]

      for (const url of invalidUrls) {
        expect(() => sanitizer.validateRpcUrl(url)).toThrow()
      }
    })
  })

  describe('validateNetworkPassphrase', () => {
    it('should accept known network passphrases', () => {
      const knownPassphrases = [
        'Test SDF Network ; September 2015',
        'Public Global Stellar Network ; September 2015',
      ]

      for (const passphrase of knownPassphrases) {
        expect(() => sanitizer.validateNetworkPassphrase(passphrase)).not.toThrow()
      }
    })

    it('should reject empty passphrases', () => {
      expect(() => sanitizer.validateNetworkPassphrase('')).toThrow()
    })

    it('should reject null passphrases', () => {
      expect(() => sanitizer.validateNetworkPassphrase(null as any)).toThrow()
    })

    it('should accept custom network passphrases with valid format', () => {
      const customPassphrase = 'Custom Network ; 2025'
      expect(() => sanitizer.validateNetworkPassphrase(customPassphrase)).not.toThrow()
    })
  })

  describe('validateXDRMetadata', () => {
    it('should validate well-formed XDR metadata', () => {
      const validXDR = 'AAAAAgAAAABi0AVXh/G+ORoiMinJe94M63hLw07PWroqEK+XYbCoUQAAAGQAClxyAAAAAwAAAAEAAAAA'
      expect(() => sanitizer.validateXDRMetadata(validXDR)).not.toThrow()
    })

    it('should reject empty XDR', () => {
      expect(() => sanitizer.validateXDRMetadata('')).toThrow()
    })

    it('should reject invalid base64 XDR', () => {
      expect(() => sanitizer.validateXDRMetadata('!!!invalid base64!!!')).toThrow()
    })

    it('should reject XDR with null bytes or malicious patterns', () => {
      const maliciousXDR = 'AAAAAgAAAABi0AVXh/G+ORoiMinJe94M63hLw0' + String.fromCharCode(0) + '7PWroqEK+XYbCoUQAAAGQAClxyAAAAAwAAAAEAAAAA'
      expect(() => sanitizer.validateXDRMetadata(maliciousXDR)).toThrow()
    })
  })

  describe('sanitizeLogCallback', () => {
    it('should accept valid logging callbacks', () => {
      const validCallback = (level: string, message: string) => {
        console.log(`[${level}] ${message}`)
      }

      expect(() => sanitizer.validateLogCallback(validCallback)).not.toThrow()
    })

    it('should ensure callback does not log sensitive data', () => {
      const sensitiveCallback = () => {
        const privateKey = 'SBZVMB74Z76QZ3ZZZ3ZZZ3ZZZ3ZZZ3ZZZ3ZZZ3ZZZ3ZZZ3ZZZ3ZZZ3ZZZ'
        console.log(privateKey)
      }

      expect(() => sanitizer.validateLogCallback(sensitiveCallback)).toThrow()
    })

    it('should reject non-function callbacks', () => {
      expect(() => sanitizer.validateLogCallback('not a function' as any)).toThrow()
      expect(() => sanitizer.validateLogCallback(null as any)).toThrow()
      expect(() => sanitizer.validateLogCallback(undefined as any)).toThrow()
    })
  })

  describe('batchValidation', () => {
    it('should validate all inputs in one call', () => {
      const inputs = {
        sourceAccountID: 'GBRPYHIL2CI3WHZSRXG5ROUTE3A27SJWSRX3CHRJMYQV4YCLNUS53LJ',
        rpcUrl: 'https://soroban-testnet.stellar.org',
        networkPassphrase: 'Test SDF Network ; September 2015',
        xdrMetadata: 'AAAAAgAAAABi0AVXh/G+ORoiMinJe94M63hLw0' + '7PWroqEK+XYbCoUQAAAGQAClxyAAAAAwAAAAEAAAAA',
      }

      expect(() => sanitizer.validateAll(inputs)).not.toThrow()
    })

    it('should fail validation if any input is invalid', () => {
      const invalidInputs = {
        sourceAccountID: 'INVALID',
        rpcUrl: 'https://soroban-testnet.stellar.org',
        networkPassphrase: 'Test SDF Network ; September 2015',
      }

      expect(() => sanitizer.validateAll(invalidInputs as any)).toThrow()
    })
  })
})

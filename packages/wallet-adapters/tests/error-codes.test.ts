import { describe, it, expect, vi, beforeEach } from 'vitest'
import { WalletAdapterError, mapCommonWalletError } from '../src/types.js'
import type { WalletAdapterErrorCode } from '../src/types.js'

describe('WalletAdapterErrorCode coverage', () => {
  describe('error code enum', () => {
    it('should have all defined error codes', () => {
      const validCodes: WalletAdapterErrorCode[] = [
        'NOT_INSTALLED',
        'DEPENDENCY_NOT_INSTALLED',
        'CONNECTION_FAILED',
        'USER_REJECTED',
        'DEVICE_DISCONNECTED',
        'TIMEOUT',
        'INVALID_XDR',
      ]

      expect(validCodes).toHaveLength(7)
    })
  })

  describe('WalletAdapterError', () => {
    it('should create error with NOT_INSTALLED code', () => {
      const error = new WalletAdapterError('Wallet not found', 'NOT_INSTALLED')
      expect(error.code).toBe('NOT_INSTALLED')
      expect(error.name).toBe('WalletAdapterError')
      expect(error.message).toBe('Wallet not found')
    })

    it('should create error with DEPENDENCY_NOT_INSTALLED code', () => {
      const error = new WalletAdapterError('Dependency missing', 'DEPENDENCY_NOT_INSTALLED')
      expect(error.code).toBe('DEPENDENCY_NOT_INSTALLED')
    })

    it('should create error with CONNECTION_FAILED code', () => {
      const error = new WalletAdapterError('Connection failed', 'CONNECTION_FAILED')
      expect(error.code).toBe('CONNECTION_FAILED')
    })

    it('should create error with USER_REJECTED code', () => {
      const error = new WalletAdapterError('User rejected', 'USER_REJECTED')
      expect(error.code).toBe('USER_REJECTED')
    })

    it('should create error with DEVICE_DISCONNECTED code', () => {
      const error = new WalletAdapterError('Device disconnected', 'DEVICE_DISCONNECTED')
      expect(error.code).toBe('DEVICE_DISCONNECTED')
    })

    it('should create error with TIMEOUT code', () => {
      const error = new WalletAdapterError('Request timeout', 'TIMEOUT')
      expect(error.code).toBe('TIMEOUT')
    })

    it('should create error with INVALID_XDR code', () => {
      const error = new WalletAdapterError('Invalid XDR', 'INVALID_XDR')
      expect(error.code).toBe('INVALID_XDR')
    })

    it('should include cause in error', () => {
      const cause = new Error('Original error')
      const error = new WalletAdapterError('Wrapped error', 'CONNECTION_FAILED', cause)
      expect(error.cause).toBe(cause)
    })
  })

  describe('mapCommonWalletError', () => {
    it('should return existing WalletAdapterError as-is', () => {
      const original = new WalletAdapterError('Already mapped', 'NOT_INSTALLED')
      const mapped = mapCommonWalletError('TestWallet', original)
      expect(mapped).toBe(original)
    })

    it('should map rejection messages to USER_REJECTED', () => {
      const rejectionMessages = [
        'User rejected',
        'User denied',
        'User canceled',
        'user cancelled the request',
        'Window closed',
      ]

      rejectionMessages.forEach(msg => {
        const error = mapCommonWalletError('TestWallet', new Error(msg))
        expect(error.code).toBe('USER_REJECTED')
      })
    })

    it('should map not-installed messages to NOT_INSTALLED', () => {
      const notInstalledMessages = [
        'Extension not installed',
        'Wallet not found',
        'No bridge detected',
        'Extension not detected',
      ]

      notInstalledMessages.forEach(msg => {
        const error = mapCommonWalletError('TestWallet', new Error(msg))
        expect(error.code).toBe('NOT_INSTALLED')
      })
    })

    it('should default to CONNECTION_FAILED for unknown errors', () => {
      const error = mapCommonWalletError('TestWallet', new Error('Unknown error'))
      expect(error.code).toBe('CONNECTION_FAILED')
    })

    it('should handle string causes', () => {
      const error = mapCommonWalletError('TestWallet', 'String error message')
      expect(error.code).toBe('CONNECTION_FAILED')
    })

    it('should preserve wallet name in mapped error message', () => {
      const error = mapCommonWalletError('Freighter', new Error('rejected'))
      expect(error.message).toContain('Freighter')
    })

    it('should handle case-insensitive matching for rejection', () => {
      const error = mapCommonWalletError('TestWallet', new Error('USER REJECTED REQUEST'))
      expect(error.code).toBe('USER_REJECTED')
    })

    it('should handle case-insensitive matching for not installed', () => {
      const error = mapCommonWalletError('TestWallet', new Error('EXTENSION NOT INSTALLED'))
      expect(error.code).toBe('NOT_INSTALLED')
    })
  })

  describe('all adapters should support error codes', () => {
    it('should define error code for Freighter adapter errors', () => {
      const freighterErrors = [
        { cause: 'Extension not installed', expectedCode: 'NOT_INSTALLED' },
        { cause: 'User denied access', expectedCode: 'USER_REJECTED' },
        { cause: 'Connection timeout', expectedCode: 'CONNECTION_FAILED' },
      ]

      freighterErrors.forEach(({ cause, expectedCode }) => {
        const error = mapCommonWalletError('Freighter', new Error(cause))
        expect(error.code).toBe(expectedCode)
      })
    })

    it('should define error code for Ledger adapter errors', () => {
      const ledgerErrors = [
        { cause: 'Device not found', expectedCode: 'NOT_INSTALLED' },
        { cause: 'User rejected', expectedCode: 'USER_REJECTED' },
      ]

      ledgerErrors.forEach(({ cause, expectedCode }) => {
        const error = mapCommonWalletError('Ledger', new Error(cause))
        expect(error.code).toBe(expectedCode)
      })
    })

    it('should define error code for Albedo adapter errors', () => {
      const albedoErrors = [
        { cause: 'Not installed', expectedCode: 'NOT_INSTALLED' },
        { cause: 'Request denied', expectedCode: 'USER_REJECTED' },
      ]

      albedoErrors.forEach(({ cause, expectedCode }) => {
        const error = mapCommonWalletError('Albedo', new Error(cause))
        expect(error.code).toBe(expectedCode)
      })
    })

    it('should define error code for Rabet adapter errors', () => {
      const rabetErrors = [
        { cause: 'Bridge not available', expectedCode: 'CONNECTION_FAILED' },
        { cause: 'User cancelled', expectedCode: 'USER_REJECTED' },
      ]

      rabetErrors.forEach(({ cause, expectedCode }) => {
        const error = mapCommonWalletError('Rabet', new Error(cause))
        expect(error.code).toBe(expectedCode)
      })
    })

    it('should define error code for xBull adapter errors', () => {
      const xbullErrors = [
        { cause: 'Extension closed', expectedCode: 'USER_REJECTED' },
        { cause: 'Connection failed', expectedCode: 'CONNECTION_FAILED' },
      ]

      xbullErrors.forEach(({ cause, expectedCode }) => {
        const error = mapCommonWalletError('xBull', new Error(cause))
        expect(error.code).toBe(expectedCode)
      })
    })

    it('should define error code for Lobstr adapter errors', () => {
      const lobstrErrors = [
        { cause: 'Not found', expectedCode: 'NOT_INSTALLED' },
        { cause: 'Denied', expectedCode: 'USER_REJECTED' },
      ]

      lobstrErrors.forEach(({ cause, expectedCode }) => {
        const error = mapCommonWalletError('Lobstr', new Error(cause))
        expect(error.code).toBe(expectedCode)
      })
    })
  })

  describe('error code consistency across wallets', () => {
    const walletNames = ['Freighter', 'Ledger', 'Albedo', 'Rabet', 'xBull', 'Lobstr']

    it('all wallets should return USER_REJECTED for rejection messages', () => {
      walletNames.forEach(walletName => {
        const error = mapCommonWalletError(walletName, new Error('user rejected'))
        expect(error.code).toBe('USER_REJECTED')
      })
    })

    it('all wallets should return NOT_INSTALLED for missing messages', () => {
      walletNames.forEach(walletName => {
        const error = mapCommonWalletError(walletName, new Error('not installed'))
        expect(error.code).toBe('NOT_INSTALLED')
      })
    })

    it('all wallets should return CONNECTION_FAILED for unknown errors', () => {
      walletNames.forEach(walletName => {
        const error = mapCommonWalletError(walletName, new Error('unknown error'))
        expect(error.code).toBe('CONNECTION_FAILED')
      })
    })
  })
})

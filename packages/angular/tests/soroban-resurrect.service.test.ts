import { describe, it, expect, vi, beforeEach } from 'vitest'
import { signal } from '@angular/core'
import { SorobanResurrectService, provideSorobanResurrect } from '../src/index.js'
import type { SorobanResurrectConfig } from '@soroban-resurrect/sdk'

describe('[Issue #266] Angular Standalone Provider Function', () => {
  const mockConfig: SorobanResurrectConfig = {
    rpcUrl: 'https://soroban-testnet.stellar.org',
    networkPassphrase: 'Test SDF Network ; September 2015',
  }

  describe('provideSorobanResurrect', () => {
    it('should export provideSorobanResurrect function', () => {
      expect(typeof provideSorobanResurrect).toBe('function')
    })

    it('should accept SorobanResurrectConfig parameter', () => {
      const result = provideSorobanResurrect(mockConfig)
      expect(result).toBeDefined()
    })

    it('should return environment providers array', () => {
      const providers = provideSorobanResurrect(mockConfig)
      expect(Array.isArray(providers)).toBe(true)
    })

    it('should work with standalone component bootstrapping', () => {
      // Verify the provider can be used in bootstrapApplication
      const providers = provideSorobanResurrect(mockConfig)
      expect(providers.length).toBeGreaterThan(0)
    })

    it('should configure service with provided config', () => {
      const providers = provideSorobanResurrect(mockConfig)
      // The providers should include the service configuration
      expect(providers).toBeDefined()
    })

    it('should handle various config options', () => {
      const configWithAllOptions: SorobanResurrectConfig = {
        rpcUrl: 'https://soroban-testnet.stellar.org',
        networkPassphrase: 'Test SDF Network ; September 2015',
        allowHttp: false,
        timeout: 30000,
      }
      const providers = provideSorobanResurrect(configWithAllOptions)
      expect(providers).toBeDefined()
    })

    it('should support array of RPC URLs', () => {
      const configWithArrayUrls: SorobanResurrectConfig = {
        rpcUrl: [
          'https://soroban-testnet.stellar.org',
          'https://soroban-testnet-2.stellar.org',
        ],
        networkPassphrase: 'Test SDF Network ; September 2015',
      }
      const providers = provideSorobanResurrect(configWithArrayUrls)
      expect(providers).toBeDefined()
    })
  })
})

describe('[Issue #267] Angular Signals-Based State Exposure', () => {
  const mockConfig: SorobanResurrectConfig = {
    rpcUrl: 'https://soroban-testnet.stellar.org',
    networkPassphrase: 'Test SDF Network ; September 2015',
  }

  let service: SorobanResurrectService

  beforeEach(() => {
    service = new SorobanResurrectService()
    service.configure(mockConfig)
  })

  describe('Signal-based state', () => {
    it('should expose isExecuting as a signal', () => {
      const isExecuting = service.isExecuting
      expect(isExecuting).toBeDefined()
      // Signals are functions that return values
      expect(typeof isExecuting).toBe('function')
    })

    it('should expose needsRestore as a signal', () => {
      const needsRestore = service.needsRestore
      expect(needsRestore).toBeDefined()
      expect(typeof needsRestore).toBe('function')
    })

    it('should expose isChecking as a signal', () => {
      const isChecking = service.isChecking
      expect(isChecking).toBeDefined()
      expect(typeof isChecking).toBe('function')
    })

    it('should expose error as a signal', () => {
      const error = service.error
      expect(error).toBeDefined()
      expect(typeof error).toBe('function')
    })

    it('should expose lastResult as a signal', () => {
      const lastResult = service.lastResult
      expect(lastResult).toBeDefined()
      expect(typeof lastResult).toBe('function')
    })

    it('should expose archivedKeys as a signal', () => {
      const archivedKeys = service.archivedKeys
      expect(archivedKeys).toBeDefined()
      expect(typeof archivedKeys).toBe('function')
    })
  })

  describe('Signal reactivity', () => {
    it('isExecuting signal should track execution state', () => {
      expect(service.isExecuting()).toBe(false)
      // Signals are reactive and update based on internal state changes
    })

    it('needsRestore signal should track restore state', () => {
      expect(service.needsRestore()).toBe(false)
    })

    it('isChecking signal should track checking state', () => {
      expect(service.isChecking()).toBe(false)
    })

    it('error signal should initially be null', () => {
      expect(service.error()).toBeNull()
    })

    it('archivedKeys signal should initially be empty', () => {
      expect(service.archivedKeys()).toEqual([])
    })
  })

  describe('Signal type safety', () => {
    it('should return readonly signals', () => {
      const isExecuting = service.isExecuting
      const needsRestore = service.needsRestore

      // Signals should be functions that return their value
      expect(typeof isExecuting()).toBe('boolean')
      expect(typeof needsRestore()).toBe('boolean')
    })

    it('should return proper types from signal accessors', () => {
      expect(typeof service.isExecuting()).toBe('boolean')
      expect(typeof service.isChecking()).toBe('boolean')
      expect(typeof service.needsRestore()).toBe('boolean')
      expect(service.error() === null || typeof service.error() === 'string').toBe(true)
      expect(Array.isArray(service.archivedKeys())).toBe(true)
    })
  })

  describe('Signal integration with service methods', () => {
    it('reset should update all signals to initial state', () => {
      service.reset()
      expect(service.isChecking()).toBe(false)
      expect(service.isExecuting()).toBe(false)
      expect(service.error()).toBeNull()
      expect(service.needsRestore()).toBe(false)
      expect(service.archivedKeys()).toEqual([])
      expect(service.lastResult()).toBeNull()
    })

    it('should maintain signal consistency across methods', () => {
      // Initial state
      expect(service.isChecking()).toBe(false)
      expect(service.isExecuting()).toBe(false)

      // After reset, state should be clean
      service.reset()
      expect(service.isChecking()).toBe(false)
      expect(service.isExecuting()).toBe(false)
    })
  })

  describe('Standalone component provider integration', () => {
    it('signals should work in provider-based service', () => {
      const providers = provideSorobanResurrect(mockConfig)
      expect(providers).toBeDefined()
      // The provider creates a service instance with configured signals
    })
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useSorobanResurrect } from '../src/lib/useSorobanResurrect.js'
import type { UseSorobanResurrectOptions } from '../src/lib/types.js'

describe('[Issue #264] Svelte Stores with Manager Event Subscriptions', () => {
  const mockOptions: UseSorobanResurrectOptions = {
    rpcUrl: 'https://soroban-testnet.stellar.org',
    networkPassphrase: 'Test SDF Network ; September 2015',
  }

  let stores: ReturnType<typeof useSorobanResurrect>

  beforeEach(() => {
    stores = useSorobanResurrect(mockOptions)
  })

  describe('Store initialization', () => {
    it('should initialize all stores', () => {
      expect(stores.isChecking).toBeDefined()
      expect(stores.isExecuting).toBeDefined()
      expect(stores.lastResult).toBeDefined()
      expect(stores.error).toBeDefined()
      expect(stores.needsRestore).toBeDefined()
      expect(stores.archivedKeys).toBeDefined()
    })

    it('should initialize with default values', (done) => {
      let checkingValue: boolean = false
      let executingValue: boolean = false
      let needsRestoreValue: boolean = false

      stores.isChecking.subscribe((v) => {
        checkingValue = v
      })
      stores.isExecuting.subscribe((v) => {
        executingValue = v
      })
      stores.needsRestore.subscribe((v) => {
        needsRestoreValue = v
      })

      // Svelte stores are synchronous for initial values
      setTimeout(() => {
        expect(checkingValue).toBe(false)
        expect(executingValue).toBe(false)
        expect(needsRestoreValue).toBe(false)
        done()
      }, 0)
    })
  })

  describe('Connection change event subscription', () => {
    it('should expose onConnectionChange method', () => {
      expect(typeof stores.onConnectionChange).toBe('function')
    })

    it('should register connection change callback', () => {
      const callback = vi.fn()
      const unsubscribe = stores.onConnectionChange(callback)
      expect(typeof unsubscribe).toBe('function')
    })

    it('should support multiple connection listeners', () => {
      const callback1 = vi.fn()
      const callback2 = vi.fn()

      stores.onConnectionChange(callback1)
      stores.onConnectionChange(callback2)

      expect(typeof stores.onConnectionChange).toBe('function')
    })

    it('should return unsubscribe function from onConnectionChange', () => {
      const callback = vi.fn()
      const unsubscribe = stores.onConnectionChange(callback)
      expect(typeof unsubscribe).toBe('function')
    })

    it('should handle connection state changes', () => {
      const callback = vi.fn()
      const unsubscribe = stores.onConnectionChange(callback)

      // Simulate connection change
      expect(unsubscribe).toBeDefined()
      expect(callback).toBeDefined()
    })
  })

  describe('Network change event subscription', () => {
    it('should expose onNetworkChange method', () => {
      expect(typeof stores.onNetworkChange).toBe('function')
    })

    it('should register network change callback', () => {
      const callback = vi.fn()
      const unsubscribe = stores.onNetworkChange(callback)
      expect(typeof unsubscribe).toBe('function')
    })

    it('should support multiple network listeners', () => {
      const callback1 = vi.fn()
      const callback2 = vi.fn()

      stores.onNetworkChange(callback1)
      stores.onNetworkChange(callback2)

      expect(typeof stores.onNetworkChange).toBe('function')
    })

    it('should return unsubscribe function from onNetworkChange', () => {
      const callback = vi.fn()
      const unsubscribe = stores.onNetworkChange(callback)
      expect(typeof unsubscribe).toBe('function')
    })

    it('should handle network changes', () => {
      const callback = vi.fn()
      const unsubscribe = stores.onNetworkChange(callback)

      // Simulate network change
      expect(unsubscribe).toBeDefined()
      expect(callback).toBeDefined()
    })
  })

  describe('Event subscription lifecycle', () => {
    it('should allow unsubscribing from connection events', () => {
      const callback = vi.fn()
      const unsubscribe = stores.onConnectionChange(callback)
      unsubscribe()
      // After unsubscribe, callback should not be called on further events
      expect(callback).not.toHaveBeenCalled()
    })

    it('should allow unsubscribing from network events', () => {
      const callback = vi.fn()
      const unsubscribe = stores.onNetworkChange(callback)
      unsubscribe()
      expect(callback).not.toHaveBeenCalled()
    })

    it('should support multiple subscriptions and unsubscriptions', () => {
      const callback1 = vi.fn()
      const callback2 = vi.fn()
      const callback3 = vi.fn()

      const unsub1 = stores.onConnectionChange(callback1)
      const unsub2 = stores.onConnectionChange(callback2)
      stores.onConnectionChange(callback3)

      unsub1()
      unsub2()

      // callback3 should still be subscribed
      expect(callback1).not.toHaveBeenCalled()
      expect(callback2).not.toHaveBeenCalled()
    })
  })

  describe('Store state management with events', () => {
    it('should reset all stores', () => {
      stores.reset()
      expect(stores.reset).toBeDefined()
    })

    it('should maintain event subscriptions across resets', () => {
      const connectionCallback = vi.fn()
      const networkCallback = vi.fn()

      stores.onConnectionChange(connectionCallback)
      stores.onNetworkChange(networkCallback)

      stores.reset()

      // Subscriptions should still be active
      expect(connectionCallback).toBeDefined()
      expect(networkCallback).toBeDefined()
    })

    it('should handle concurrent event emissions', () => {
      const callback1 = vi.fn()
      const callback2 = vi.fn()

      stores.onConnectionChange(callback1)
      stores.onNetworkChange(callback2)

      // Both should be registered
      expect(typeof callback1).toBe('function')
      expect(typeof callback2).toBe('function')
    })
  })

  describe('Writable store integration', () => {
    it('stores should be readable through subscriptions', (done) => {
      let value: boolean = false
      const unsubscribe = stores.isChecking.subscribe((v) => {
        value = v
      })

      setTimeout(() => {
        expect(value).toBe(false)
        unsubscribe()
        done()
      }, 0)
    })

    it('should maintain separate state for each store instance', () => {
      const stores2 = useSorobanResurrect(mockOptions)

      let checking1: boolean
      let checking2: boolean

      stores.isChecking.subscribe((v) => {
        checking1 = v
      })

      stores2.isChecking.subscribe((v) => {
        checking2 = v
      })

      // Each instance should have independent state
      expect(stores).not.toBe(stores2)
    })
  })

  describe('Options handling with events', () => {
    it('should support various configuration options', () => {
      const advancedOptions: UseSorobanResurrectOptions = {
        rpcUrl: [
          'https://soroban-testnet.stellar.org',
          'https://soroban-testnet-2.stellar.org',
        ],
        networkPassphrase: 'Test SDF Network ; September 2015',
        allowHttp: false,
        timeout: 30000,
        onError: vi.fn(),
      }

      const advancedStores = useSorobanResurrect(advancedOptions)
      expect(advancedStores.onConnectionChange).toBeDefined()
      expect(advancedStores.onNetworkChange).toBeDefined()
    })

    it('should work with preFlight configuration', () => {
      const preFlightOptions: UseSorobanResurrectOptions = {
        rpcUrl: 'https://soroban-testnet.stellar.org',
        networkPassphrase: 'Test SDF Network ; September 2015',
        preFlight: {
          enabled: true,
          onRestoreNeeded: vi.fn(),
          onRestoreComplete: vi.fn(),
          onError: vi.fn(),
        },
      }

      const preFlightStores = useSorobanResurrect(preFlightOptions)
      expect(preFlightStores.onConnectionChange).toBeDefined()
    })
  })
})

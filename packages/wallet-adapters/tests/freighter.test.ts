import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { FreighterAdapter } from '../src/adapters/freighter.js'

describe('FreighterAdapter', () => {
  let mockFreighterApi: any
  let originalWindow: any
  let localStorage: Record<string, string> = {}

  beforeEach(() => {
    vi.clearAllMocks()
    localStorage = {}

    mockFreighterApi = {
      getAddress: vi.fn(),
      getNetworkDetails: vi.fn(),
      signTransaction: vi.fn(),
      isAllowed: vi.fn(),
      requestAccess: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
    }

    // Mock window and localStorage
    Object.defineProperty(global, 'window', {
      value: {
        freighterApi: mockFreighterApi,
      },
      writable: true,
    })

    Object.defineProperty(global, 'localStorage', {
      value: {
        getItem: (key: string) => localStorage[key] ?? null,
        setItem: (key: string, value: string) => {
          localStorage[key] = value
        },
        removeItem: (key: string) => {
          delete localStorage[key]
        },
      },
      writable: true,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('restoreSession', () => {
    it('returns null when no persisted session exists', async () => {
      const adapter = new FreighterAdapter()
      const result = await adapter.restoreSession()
      expect(result).toBeNull()
    })

    it('returns null when Freighter extension is not available', async () => {
      localStorage['soroban-resurrect:freighter:connected'] = '1'
      Object.defineProperty(global, 'window', {
        value: {},
        writable: true,
      })
      const adapter = new FreighterAdapter()
      const result = await adapter.restoreSession()
      expect(result).toBeNull()
    })

    it('retries isAllowed check when extension is not ready on fast reload', async () => {
      localStorage['soroban-resurrect:freighter:connected'] = '1'

      // Simulate extension not ready initially, then ready on retry
      let callCount = 0
      mockFreighterApi.isAllowed.mockImplementation(async () => {
        callCount++
        if (callCount < 2) {
          // First call: extension not ready
          throw new Error('Extension not initialized')
        }
        // Second call: extension ready
        return true
      })

      mockFreighterApi.getAddress.mockResolvedValue({
        address: 'GBUQWP3BOUZX34ULNQG23RQ6F4YUSXHTQSXUSMIQ2KE7LCLNDV2Z4JO',
      })

      mockFreighterApi.getNetworkDetails.mockResolvedValue({
        networkPassphrase: 'Test SDF Network ; September 2015',
      })

      const adapter = new FreighterAdapter()
      const result = await adapter.restoreSession()

      expect(result).not.toBeNull()
      expect(result?.address).toBe('GBUQWP3BOUZX34ULNQG23RQ6F4YUSXHTQSXUSMIQ2KE7LCLNDV2Z4JO')
      expect(mockFreighterApi.isAllowed).toHaveBeenCalledTimes(2)
    })

    it('fails gracefully after exhausting retries when extension never becomes ready', async () => {
      localStorage['soroban-resurrect:freighter:connected'] = '1'

      // Simulate extension never becoming ready
      mockFreighterApi.isAllowed.mockRejectedValue(
        new Error('Extension not initialized')
      )

      const adapter = new FreighterAdapter()
      const result = await adapter.restoreSession()

      expect(result).toBeNull()
      // Should have attempted multiple retries, not just once
      expect(mockFreighterApi.isAllowed.mock.calls.length).toBeGreaterThan(1)
    })

    it('restores immediately without retry delay when extension is already ready', async () => {
      localStorage['soroban-resurrect:freighter:connected'] = '1'

      mockFreighterApi.isAllowed.mockResolvedValue(true)
      mockFreighterApi.getAddress.mockResolvedValue({
        address: 'GBUQWP3BOUZX34ULNQG23RQ6F4YUSXHTQSXUSMIQ2KE7LCLNDV2Z4JO',
      })
      mockFreighterApi.getNetworkDetails.mockResolvedValue({
        networkPassphrase: 'Test SDF Network ; September 2015',
      })

      const startTime = Date.now()
      const adapter = new FreighterAdapter()
      const result = await adapter.restoreSession()
      const elapsed = Date.now() - startTime

      expect(result).not.toBeNull()
      expect(mockFreighterApi.isAllowed).toHaveBeenCalledTimes(1)
      // Should complete quickly without significant delay when ready
      expect(elapsed).toBeLessThan(100)
    })

    it('clears persisted session when isAllowed returns false', async () => {
      localStorage['soroban-resurrect:freighter:connected'] = '1'

      mockFreighterApi.isAllowed.mockResolvedValue(false)

      const adapter = new FreighterAdapter()
      const result = await adapter.restoreSession()

      expect(result).toBeNull()
      expect(localStorage['soroban-resurrect:freighter:connected']).toBeUndefined()
    })
  })
})

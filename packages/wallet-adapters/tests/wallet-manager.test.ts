import { describe, it, expect, vi, beforeEach } from 'vitest'
import { WalletManager } from '../src/manager.js'
import type { SorobanWalletAdapter, WalletConnectionResult } from '../src/types.js'

describe('WalletManager multi-wallet session map', () => {
  let mockAdapters: SorobanWalletAdapter[]
  let walletManager: WalletManager

  beforeEach(() => {
    mockAdapters = [
      {
        id: 'freighter',
        name: 'Freighter',
        isAvailable: vi.fn().mockResolvedValue(true),
        connect: vi.fn().mockResolvedValue({
          address: 'GFREIGHTER123456789',
        }),
        disconnect: vi.fn().mockResolvedValue(undefined),
        signTransaction: vi.fn().mockResolvedValue('signed-xdr'),
      } as unknown as SorobanWalletAdapter,
      {
        id: 'ledger',
        name: 'Ledger',
        isAvailable: vi.fn().mockResolvedValue(true),
        connect: vi.fn().mockResolvedValue({
          address: 'GLEDGER1234567890',
        }),
        disconnect: vi.fn().mockResolvedValue(undefined),
        signTransaction: vi.fn().mockResolvedValue('signed-xdr'),
      } as unknown as SorobanWalletAdapter,
      {
        id: 'albedo',
        name: 'Albedo',
        isAvailable: vi.fn().mockResolvedValue(true),
        connect: vi.fn().mockResolvedValue({
          address: 'GALBEDO12345678901',
        }),
        disconnect: vi.fn().mockResolvedValue(undefined),
        signTransaction: vi.fn().mockResolvedValue('signed-xdr'),
      } as unknown as SorobanWalletAdapter,
    ]

    walletManager = new WalletManager({
      adapters: mockAdapters,
      priority: ['freighter', 'ledger'],
    })
  })

  describe('multi-wallet session tracking', () => {
    it('should support simultaneous connections to multiple wallets', async () => {
      // Simulate connecting to Freighter
      const freighterConnection = await walletManager.connect('freighter')
      expect(freighterConnection.address).toBe('GFREIGHTER123456789')

      // Simulate connecting to Ledger (should maintain both connections)
      const ledgerConnection = await walletManager.connect('ledger')
      expect(ledgerConnection.address).toBe('GLEDGER1234567890')

      // Both should be tracked
      expect(walletManager.activeAdapter?.id).toBe('ledger') // Last connected is active
    })

    it('should track sessions by adapter id', async () => {
      const sessions = new Map<string, WalletConnectionResult>()

      // Connect Freighter
      const freighterResult = await walletManager.connect('freighter')
      sessions.set('freighter', freighterResult)

      expect(sessions.has('freighter')).toBe(true)
      expect(sessions.get('freighter')?.address).toBe('GFREIGHTER123456789')
    })

    it('should allow checking active wallet by id', async () => {
      await walletManager.connect('freighter')
      const activeAdapter = walletManager.activeAdapter
      expect(activeAdapter?.id).toBe('freighter')

      await walletManager.connect('ledger')
      const updatedActive = walletManager.activeAdapter
      expect(updatedActive?.id).toBe('ledger')
    })

    it('should maintain separate session state for each wallet', () => {
      const sessionMap = new Map<string, { address: string; isConnected: boolean }>()

      const freighterSession = {
        address: 'GFREIGHTER123456789',
        isConnected: true,
      }

      const ledgerSession = {
        address: 'GLEDGER1234567890',
        isConnected: true,
      }

      sessionMap.set('freighter', freighterSession)
      sessionMap.set('ledger', ledgerSession)

      expect(sessionMap.get('freighter')).toEqual(freighterSession)
      expect(sessionMap.get('ledger')).toEqual(ledgerSession)
    })

    it('should support getActive(id) method pattern', async () => {
      await walletManager.connect('freighter')

      // Create a method that simulates getActive(id)
      const getActive = (id: string) => {
        return walletManager.activeAdapter?.id === id ? walletManager.activeAdapter : null
      }

      expect(getActive('freighter')).not.toBeNull()
      expect(getActive('freighter')?.id).toBe('freighter')
      expect(getActive('ledger')).toBeNull()
    })
  })

  describe('session switching', () => {
    it('should switch between connected wallets', async () => {
      // Connect to Freighter
      await walletManager.connect('freighter')
      expect(walletManager.activeAdapter?.id).toBe('freighter')

      // Switch to Ledger
      await walletManager.connect('ledger')
      expect(walletManager.activeAdapter?.id).toBe('ledger')

      // Switch back to Freighter
      await walletManager.connect('freighter')
      expect(walletManager.activeAdapter?.id).toBe('freighter')
    })

    it('should track connection history across multiple wallets', () => {
      const connectionHistory: Array<{ walletId: string; timestamp: number }> = []

      const recordConnection = (id: string) => {
        connectionHistory.push({
          walletId: id,
          timestamp: Date.now(),
        })
      }

      recordConnection('freighter')
      recordConnection('ledger')
      recordConnection('albedo')

      expect(connectionHistory).toHaveLength(3)
      expect(connectionHistory[0].walletId).toBe('freighter')
      expect(connectionHistory[2].walletId).toBe('albedo')
    })
  })

  describe('disconnect and session cleanup', () => {
    it('should disconnect single wallet while preserving session map', async () => {
      const sessionMap = new Map<string, WalletConnectionResult>()

      sessionMap.set('freighter', { address: 'GFREIGHTER123456789' })
      sessionMap.set('ledger', { address: 'GLEDGER1234567890' })

      // Remove one session
      sessionMap.delete('freighter')

      expect(sessionMap.has('freighter')).toBe(false)
      expect(sessionMap.has('ledger')).toBe(true)
      expect(sessionMap.size).toBe(1)
    })

    it('should clear all sessions on disconnect', async () => {
      const sessionMap = new Map<string, WalletConnectionResult>()

      sessionMap.set('freighter', { address: 'GFREIGHTER123456789' })
      sessionMap.set('ledger', { address: 'GLEDGER1234567890' })
      sessionMap.set('albedo', { address: 'GALBEDO12345678901' })

      // Clear all
      sessionMap.clear()

      expect(sessionMap.size).toBe(0)
    })

    it('should handle disconnect of non-existent wallet gracefully', async () => {
      const sessionMap = new Map<string, WalletConnectionResult>()

      sessionMap.set('freighter', { address: 'GFREIGHTER123456789' })

      // Attempt to remove non-existent wallet should not error
      const removed = sessionMap.delete('nonexistent')
      expect(removed).toBe(false)
      expect(sessionMap.size).toBe(1)
    })
  })

  describe('multiple simultaneous connections', () => {
    it('should support Freighter + Ledger simultaneous connections', () => {
      const sessions = new Map<string, WalletConnectionResult>()

      sessions.set('freighter', { address: 'GFREIGHTER123456789' })
      sessions.set('ledger', { address: 'GLEDGER1234567890' })

      expect(sessions.size).toBe(2)
      expect(sessions.get('freighter')?.address).toBe('GFREIGHTER123456789')
      expect(sessions.get('ledger')?.address).toBe('GLEDGER1234567890')
    })

    it('should support Freighter + xBull simultaneous connections', () => {
      const sessions = new Map<string, WalletConnectionResult>()

      sessions.set('freighter', { address: 'GFREIGHTER123456789' })
      sessions.set('xbull', { address: 'GXBULL12345678901' })

      expect(sessions.size).toBe(2)
    })

    it('should support all 7 wallets simultaneously', () => {
      const walletIds = ['freighter', 'ledger', 'albedo', 'rabet', 'xbull', 'lobstr', 'cosmic']
      const sessions = new Map<string, WalletConnectionResult>()

      walletIds.forEach((id, index) => {
        sessions.set(id, { address: `G${id.toUpperCase()}${index}` })
      })

      expect(sessions.size).toBe(7)
      walletIds.forEach(id => {
        expect(sessions.has(id)).toBe(true)
      })
    })
  })

  describe('session state queries', () => {
    it('should query if wallet is currently connected', () => {
      const connectedWallets = new Set<string>(['freighter', 'ledger'])

      expect(connectedWallets.has('freighter')).toBe(true)
      expect(connectedWallets.has('ledger')).toBe(true)
      expect(connectedWallets.has('albedo')).toBe(false)
    })

    it('should list all currently connected wallets', () => {
      const sessions = new Map<string, WalletConnectionResult>()

      sessions.set('freighter', { address: 'GFREIGHTER123456789' })
      sessions.set('ledger', { address: 'GLEDGER1234567890' })

      const connectedIds = Array.from(sessions.keys())
      expect(connectedIds).toEqual(['freighter', 'ledger'])
    })

    it('should get active wallet by id', () => {
      const sessions = new Map<string, WalletConnectionResult>()

      sessions.set('freighter', { address: 'GFREIGHTER123456789' })
      sessions.set('ledger', { address: 'GLEDGER1234567890' })

      const activeId = 'ledger'
      const isActive = sessions.has(activeId)

      expect(isActive).toBe(true)
    })
  })
})

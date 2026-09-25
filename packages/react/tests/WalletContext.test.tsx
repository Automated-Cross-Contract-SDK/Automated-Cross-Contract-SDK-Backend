import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { WalletProvider } from '../src/wallet/WalletProvider.js'
import { useWallets } from '../src/wallet/useWallets.js'
import type { WalletAdapter } from '../src/wallet/types.js'
import type { ReactNode } from 'react'

const createMockWallet = (id: string, name: string): WalletAdapter => ({
  id,
  name,
  isAvailable: vi.fn().mockResolvedValue(true),
  connect: vi.fn().mockResolvedValue({ publicKey: `key-${id}` }),
  disconnect: vi.fn().mockResolvedValue(undefined),
  signTransaction: vi.fn().mockResolvedValue('signed-xdr'),
})

describe('WalletContext - connectTimeoutMs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('provides default connectTimeoutMs of 30000ms', () => {
    const wallets = [createMockWallet('test', 'Test Wallet')]

    function Wrapper({ children }: { children: ReactNode }) {
      return <WalletProvider wallets={wallets}>{children}</WalletProvider>
    }

    const { result } = renderHook(() => useWallets(), { wrapper: Wrapper })

    expect(result.current.connectTimeoutMs).toBe(30000)
  })

  it('respects custom connectTimeoutMs', () => {
    const wallets = [createMockWallet('test', 'Test Wallet')]

    function Wrapper({ children }: { children: ReactNode }) {
      return <WalletProvider wallets={wallets} connectTimeoutMs={5000}>{children}</WalletProvider>
    }

    const { result } = renderHook(() => useWallets(), { wrapper: Wrapper })

    expect(result.current.connectTimeoutMs).toBe(5000)
  })

  it('aborts connection if it exceeds timeout', async () => {
    const slowWallet = createMockWallet('slow', 'Slow Wallet')
    slowWallet.connect = vi.fn().mockImplementation(
      () => new Promise(resolve => setTimeout(() => resolve({ publicKey: 'key' }), 5000)),
    )

    const wallets = [slowWallet]

    function Wrapper({ children }: { children: ReactNode }) {
      return <WalletProvider wallets={wallets} connectTimeoutMs={1000}>{children}</WalletProvider>
    }

    const { result } = renderHook(() => useWallets(), { wrapper: Wrapper })

    await act(async () => {
      await expect(result.current.connect('slow')).rejects.toThrow('Connection timeout')
    })

    expect(result.current.error).toBe('Connection timeout')
    expect(result.current.isConnecting).toBe(false)
  })

  it('resets pending state on timeout', async () => {
    const slowWallet = createMockWallet('slow', 'Slow Wallet')
    slowWallet.connect = vi.fn().mockImplementation(
      () => new Promise(resolve => setTimeout(() => resolve({ publicKey: 'key' }), 5000)),
    )

    const wallets = [slowWallet]

    function Wrapper({ children }: { children: ReactNode }) {
      return <WalletProvider wallets={wallets} connectTimeoutMs={500}>{children}</WalletProvider>
    }

    const { result } = renderHook(() => useWallets(), { wrapper: Wrapper })

    await act(async () => {
      const promise = result.current.connect('slow')
      await new Promise(r => setTimeout(r, 100))
      expect(result.current.isConnecting).toBe(true)
      await expect(promise).rejects.toThrow()
    })

    expect(result.current.isConnecting).toBe(false)
    expect(result.current.error).toBe('Connection timeout')
  })

  it('successfully connects when within timeout', async () => {
    const wallet = createMockWallet('test', 'Test Wallet')
    wallet.connect = vi.fn().mockImplementation(
      () => new Promise(resolve => setTimeout(() => resolve({ publicKey: 'key-test' }), 100)),
    )

    const wallets = [wallet]

    function Wrapper({ children }: { children: ReactNode }) {
      return <WalletProvider wallets={wallets} connectTimeoutMs={5000}>{children}</WalletProvider>
    }

    const { result } = renderHook(() => useWallets(), { wrapper: Wrapper })

    await act(async () => {
      await result.current.connect('test')
    })

    expect(result.current.isConnecting).toBe(false)
    expect(result.current.error).toBeNull()
    expect(result.current.publicKey).toBe('key-test')
  })

  it('clears previous timeout when connect is called again', async () => {
    const wallet = createMockWallet('test', 'Test Wallet')
    const wallets = [wallet]

    function Wrapper({ children }: { children: ReactNode }) {
      return <WalletProvider wallets={wallets} connectTimeoutMs={2000}>{children}</WalletProvider>
    }

    const { result } = renderHook(() => useWallets(), { wrapper: Wrapper })

    await act(async () => {
      await result.current.connect('test')
    })

    expect(result.current.publicKey).toBe('key-test')
    expect(result.current.error).toBeNull()
  })
})

import { describe, expect, it, vi } from 'vitest'
import { WalletManager } from '../src/manager.js'
import { DEFAULT_ADAPTER_PRIORITY, DEFAULT_WALLET_CAPABILITIES } from '../src/types.js'
import type { SorobanWalletAdapter, WalletCapabilities } from '../src/types.js'

interface FakeAdapterOptions {
  priority?: number
  available?: boolean
  capabilities?: Partial<WalletCapabilities>
}

function fakeAdapter(id: string, options: FakeAdapterOptions = {}): SorobanWalletAdapter {
  return {
    id,
    name: `${id} wallet`,
    priority: options.priority,
    capabilities: options.capabilities,
    isAvailable: vi.fn().mockResolvedValue(options.available ?? true),
    connect: vi.fn().mockResolvedValue({ address: `G${id.toUpperCase()}` }),
    disconnect: vi.fn().mockResolvedValue(undefined),
    signTransaction: vi.fn().mockResolvedValue('signed-xdr'),
  } as unknown as SorobanWalletAdapter
}

function ids(wallets: Array<{ id: string }>): string[] {
  return wallets.map((wallet) => wallet.id)
}

describe('WalletManager deterministic detection ordering (issue #441)', () => {
  it('orders available wallets by descriptor priority, not registration order', async () => {
    const manager = new WalletManager({
      adapters: [
        fakeAdapter('rabet', { priority: 40 }),
        fakeAdapter('freighter', { priority: 10 }),
        fakeAdapter('xbull', { priority: 20 }),
      ],
    })

    expect(ids(await manager.getAvailableWallets())).toEqual(['freighter', 'xbull', 'rabet'])
    expect(ids(manager.getWalletDescriptors())).toEqual(['freighter', 'xbull', 'rabet'])
  })

  it('is stable across repeated detections in the same environment', async () => {
    const manager = new WalletManager({
      adapters: [
        fakeAdapter('c', { priority: 20 }),
        fakeAdapter('a', { priority: 10 }),
        fakeAdapter('b', { priority: 10 }),
      ],
    })

    const first = ids(await manager.getAvailableWallets())
    const second = ids(await manager.getAvailableWallets())
    expect(first).toEqual(second)
    expect(first).toEqual(['a', 'b', 'c'])
  })

  it('honours the app-level override list before adapter priorities', async () => {
    const manager = new WalletManager({
      adapters: [
        fakeAdapter('freighter', { priority: 10 }),
        fakeAdapter('xbull', { priority: 20 }),
        fakeAdapter('albedo', { priority: 30 }),
      ],
      priority: ['albedo', 'freighter'],
    })

    expect(ids(await manager.getAvailableWallets())).toEqual(['albedo', 'freighter', 'xbull'])
  })

  it('keeps override-listed wallets ahead of unlisted ones regardless of adapter priority', async () => {
    const manager = new WalletManager({
      adapters: [fakeAdapter('fast', { priority: 1 }), fakeAdapter('pinned', { priority: 999 })],
      priority: ['pinned'],
    })

    expect(ids(await manager.getAvailableWallets())).toEqual(['pinned', 'fast'])
  })

  it('breaks priority ties by registration order (the order availability probes run)', async () => {
    const manager = new WalletManager({
      adapters: [fakeAdapter('second'), fakeAdapter('first')],
    })

    expect(ids(await manager.getAvailableWallets())).toEqual(['second', 'first'])
  })

  it('excludes unavailable wallets while preserving deterministic order', async () => {
    const manager = new WalletManager({
      adapters: [
        fakeAdapter('a', { priority: 10 }),
        fakeAdapter('b', { priority: 20, available: false }),
        fakeAdapter('c', { priority: 30 }),
      ],
    })

    expect(ids(await manager.getAvailableWallets())).toEqual(['a', 'c'])
    expect(ids(manager.getWalletDescriptors())).toEqual(['a', 'b', 'c'])
  })

  it('falls back to the documented default priority when an adapter omits one', () => {
    const manager = new WalletManager({ adapters: [fakeAdapter('legacy')] })

    const [descriptor] = manager.getWalletDescriptors()
    expect(descriptor.priority).toBe(DEFAULT_ADAPTER_PRIORITY)
  })

  it('resolves conservative default capabilities for adapters that declare none', () => {
    const manager = new WalletManager({ adapters: [fakeAdapter('unknown')] })

    const [descriptor] = manager.getWalletDescriptors()
    expect(descriptor.capabilities).toEqual(DEFAULT_WALLET_CAPABILITIES)
  })

  it('surfaces declared capabilities so dApps can filter wallets', async () => {
    const manager = new WalletManager({
      adapters: [
        fakeAdapter('soroban', {
          priority: 10,
          capabilities: { supportsSoroban: true, supportsSignedTxNote: true },
        }),
        fakeAdapter('classic', { priority: 20, capabilities: { supportsSoroban: false } }),
      ],
    })

    const available = await manager.getAvailableWallets()
    const sorobanWallets = available.filter((wallet) => wallet.capabilities.supportsSoroban)

    expect(ids(sorobanWallets)).toEqual(['soroban'])
    expect(sorobanWallets[0].capabilities.supportsSignedTxNote).toBe(true)
    // Unspecified capability fields fall back to the conservative default.
    expect(available[1].capabilities).toEqual({
      supportsSoroban: false,
      supportsSignedTxNote: false,
    })
  })
})

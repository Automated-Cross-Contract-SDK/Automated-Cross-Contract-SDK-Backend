/**
 * Issue #547: expose consistent, typed capability descriptors for wallet adapters.
 */

import { describe, it, expect, vi } from 'vitest'
import { WalletManager } from '../src/manager.js'
import { DEFAULT_WALLET_CAPABILITIES } from '../src/types.js'
import type { SorobanWalletAdapter, WalletCapabilities } from '../src/types.js'

function makeAdapter(id: string, overrides: Partial<SorobanWalletAdapter> = {}): SorobanWalletAdapter {
  return {
    id,
    name: id,
    isAvailable: vi.fn().mockResolvedValue(true),
    connect: vi.fn().mockResolvedValue({ address: 'GTEST' }),
    disconnect: vi.fn().mockResolvedValue(undefined),
    signTransaction: vi.fn().mockResolvedValue('signed-xdr'),
    ...overrides,
  } as SorobanWalletAdapter
}

const CAPABILITY_KEYS = Object.keys(DEFAULT_WALLET_CAPABILITIES).sort()

describe('typed wallet capability descriptors (#547)', () => {
  it('returns a descriptor for every registered adapter in deterministic order', () => {
    const manager = new WalletManager({
      adapters: [makeAdapter('freighter', { priority: 10 }), makeAdapter('albedo', { priority: 30 })],
    })
    const descriptors = manager.getWalletDescriptors()

    expect(descriptors.map((d) => d.id)).toEqual(['freighter', 'albedo'])
  })

  it('exposes exactly the typed WalletCapabilities keys on every descriptor', () => {
    const manager = new WalletManager({
      adapters: [makeAdapter('a', { capabilities: { supportsSoroban: true } }), makeAdapter('b')],
    })

    for (const descriptor of manager.getWalletDescriptors()) {
      expect(Object.keys(descriptor.capabilities).sort()).toEqual(CAPABILITY_KEYS)
      expect(typeof descriptor.capabilities.supportsSoroban).toBe('boolean')
      expect(typeof descriptor.capabilities.supportsSignedTxNote).toBe('boolean')
    }
  })

  it('merges a partial adapter declaration over the documented defaults', () => {
    const manager = new WalletManager({
      adapters: [makeAdapter('partial', { capabilities: { supportsSoroban: true } })],
    })
    const [descriptor] = manager.getWalletDescriptors()

    const expected: WalletCapabilities = { ...DEFAULT_WALLET_CAPABILITIES, supportsSoroban: true }
    expect(descriptor.capabilities).toEqual(expected)
  })

  it('falls back to conservative defaults for an adapter that declares no capabilities', () => {
    const manager = new WalletManager({ adapters: [makeAdapter('bare')] })
    const [descriptor] = manager.getWalletDescriptors()

    expect(descriptor.capabilities).toEqual(DEFAULT_WALLET_CAPABILITIES)
    expect(descriptor.capabilities.supportsSoroban).toBe(false)
  })

  it('lets a dApp filter descriptors by a capability', () => {
    const manager = new WalletManager({
      adapters: [
        makeAdapter('sorobanWallet', { capabilities: { supportsSoroban: true } }),
        makeAdapter('classicOnly', { capabilities: { supportsSoroban: false } }),
      ],
    })
    const sorobanIds = manager
      .getWalletDescriptors()
      .filter((d) => d.capabilities.supportsSoroban)
      .map((d) => d.id)

    expect(sorobanIds).toEqual(['sorobanWallet'])
  })
})

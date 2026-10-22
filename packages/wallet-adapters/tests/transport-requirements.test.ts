/**
 * Issue #546: report secure-context and browser transport requirements per wallet.
 */

import { describe, it, expect, vi } from 'vitest'
import { WalletManager } from '../src/manager.js'
import type { SorobanWalletAdapter, WalletDescriptor } from '../src/types.js'

function makeAdapter(
  id: string,
  requirements?: { secureContext: boolean; transports: string[] },
): SorobanWalletAdapter {
  return {
    id,
    name: id,
    isAvailable: vi.fn().mockResolvedValue(true),
    connect: vi.fn().mockResolvedValue({ address: 'GTEST' }),
    disconnect: vi.fn().mockResolvedValue(undefined),
    signTransaction: vi.fn().mockResolvedValue('signed-xdr'),
    ...(requirements ? { requirements } : {}),
  } as unknown as SorobanWalletAdapter
}

function descriptorsOf(adapters: SorobanWalletAdapter[]): Map<string, WalletDescriptor & { requirements?: unknown }> {
  const manager = new WalletManager({ adapters })
  return new Map(
    (manager.getWalletDescriptors() as Array<WalletDescriptor & { requirements?: unknown }>).map((d) => [d.id, d]),
  )
}

describe('per-wallet transport and secure-context requirements (#546)', () => {
  it('exposes a requirements object on every wallet descriptor', () => {
    const byId = descriptorsOf([makeAdapter('freighter'), makeAdapter('ledger')])

    for (const descriptor of byId.values()) {
      expect(descriptor.requirements).toEqual({
        secureContext: expect.any(Boolean),
        transports: expect.any(Array),
      })
    }
  })

  it('reports the declared secureContext flag and transports for an adapter', () => {
    const byId = descriptorsOf([
      makeAdapter('ledger', { secureContext: true, transports: ['webhid', 'webusb'] }),
    ])

    expect(byId.get('ledger')?.requirements).toEqual({
      secureContext: true,
      transports: ['webhid', 'webusb'],
    })
  })

  it('defaults to secureContext false and no transports for an adapter that declares nothing', () => {
    const byId = descriptorsOf([makeAdapter('bare')])

    expect(byId.get('bare')?.requirements).toEqual({ secureContext: false, transports: [] })
  })

  it('does not mutate the adapter-declared requirements when building descriptors', () => {
    const declared = { secureContext: true, transports: ['postMessage'] }
    const adapter = makeAdapter('albedo', declared)

    descriptorsOf([adapter]).get('albedo')!.requirements = { secureContext: false, transports: [] }

    expect((adapter as unknown as { requirements: unknown }).requirements).toEqual({
      secureContext: true,
      transports: ['postMessage'],
    })
  })
})

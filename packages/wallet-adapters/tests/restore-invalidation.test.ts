/**
 * Issue #545: in-flight restores must be invalidated when the wallet account
 * or network changes.
 */

import { describe, it, expect, vi } from 'vitest'
import { WalletManager } from '../src/manager.js'
import type { ConnectionStatusListener, SorobanWalletAdapter, WalletConnectionStatus } from '../src/types.js'

function makeAdapter(address: string) {
  let emitStatus: ConnectionStatusListener = () => undefined
  const adapter = {
    id: 'mock',
    name: 'Mock',
    isAvailable: vi.fn().mockResolvedValue(true),
    connect: vi.fn().mockResolvedValue({ address }),
    disconnect: vi.fn().mockResolvedValue(undefined),
    signTransaction: vi.fn().mockResolvedValue('signed-xdr'),
    onConnectionChange: vi.fn((listener: ConnectionStatusListener) => {
      emitStatus = listener
      return () => undefined
    }),
  } as unknown as SorobanWalletAdapter
  return {
    adapter,
    emit: (status: WalletConnectionStatus, result?: { address: string }) => emitStatus(status, result),
  }
}

describe('restore invalidation on account or network change (#545)', () => {
  it('notifies account-change listeners with the previous and next address', async () => {
    const { adapter, emit } = makeAdapter('GOLD')
    const manager = new WalletManager({ adapters: [adapter] })
    await manager.connect('mock')

    const listener = vi.fn()
    manager.onAccountChange(listener)
    emit('connected', { address: 'GNEW' })

    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenCalledWith({ previous: 'GOLD', next: 'GNEW' })
  })

  it('does not notify account-change listeners when the same account reports connected again', async () => {
    const { adapter, emit } = makeAdapter('GSAME')
    const manager = new WalletManager({ adapters: [adapter] })
    await manager.connect('mock')

    const listener = vi.fn()
    manager.onAccountChange(listener)
    emit('connected', { address: 'GSAME' })

    expect(listener).not.toHaveBeenCalled()
  })

  it('stops notifying after the account-change subscription is removed', async () => {
    const { adapter, emit } = makeAdapter('GOLD')
    const manager = new WalletManager({ adapters: [adapter] })
    await manager.connect('mock')

    const listener = vi.fn()
    const unsubscribe = manager.onAccountChange(listener)
    unsubscribe()
    emit('connected', { address: 'GNEW' })

    expect(listener).not.toHaveBeenCalled()
  })

  it('forwards network changes from the active adapter so restores can be invalidated', async () => {
    let emitNetwork: (change: { networkPassphrase?: string }) => void = () => undefined
    const adapter = {
      id: 'mock',
      name: 'Mock',
      isAvailable: vi.fn().mockResolvedValue(true),
      connect: vi.fn().mockResolvedValue({ address: 'GOLD' }),
      disconnect: vi.fn().mockResolvedValue(undefined),
      signTransaction: vi.fn().mockResolvedValue('signed-xdr'),
      onNetworkChange: vi.fn((listener: typeof emitNetwork) => {
        emitNetwork = listener
        return () => undefined
      }),
    } as unknown as SorobanWalletAdapter
    const manager = new WalletManager({ adapters: [adapter] })
    await manager.connect('mock')

    const listener = vi.fn()
    manager.onNetworkChange(listener)
    emitNetwork({ networkPassphrase: 'Test SDF Network ; September 2015' })

    expect(listener).toHaveBeenCalledWith({ networkPassphrase: 'Test SDF Network ; September 2015' })
  })
})

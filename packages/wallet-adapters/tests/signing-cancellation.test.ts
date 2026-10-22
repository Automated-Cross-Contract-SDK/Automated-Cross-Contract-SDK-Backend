/**
 * Issue #544: cancellation and cleanup for pending wallet signing prompts.
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import { WalletManager } from '../src/manager.js'
import { withConnectTimeout } from '../src/types.js'
import type { SorobanWalletAdapter } from '../src/types.js'

function makeAdapter(overrides: Partial<SorobanWalletAdapter> = {}): SorobanWalletAdapter {
  return {
    id: 'mock',
    name: 'Mock',
    isAvailable: vi.fn().mockResolvedValue(true),
    connect: vi.fn().mockResolvedValue({ address: 'GMOCK' }),
    disconnect: vi.fn().mockResolvedValue(undefined),
    signTransaction: vi.fn(() => new Promise<string>(() => {})),
    ...overrides,
  } as SorobanWalletAdapter
}

describe('pending signing prompt cancellation (#544)', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('invokes cancelConnect exactly once when a pending prompt times out', async () => {
    vi.useFakeTimers()
    const cancelConnect = vi.fn()
    const pending = withConnectTimeout(new Promise(() => {}), { name: 'Mock', cancelConnect }, 1000)
    const settled = expect(pending).rejects.toMatchObject({ code: 'CONNECTION_TIMEOUT' })
    await vi.advanceTimersByTimeAsync(1000)
    await settled
    expect(cancelConnect).toHaveBeenCalledTimes(1)
  })

  it('does not invoke cancelConnect when the prompt resolves before the timeout', async () => {
    vi.useFakeTimers()
    const cancelConnect = vi.fn()
    const pending = withConnectTimeout(Promise.resolve('ok'), { name: 'Mock', cancelConnect }, 1000)
    await expect(pending).resolves.toBe('ok')
    await vi.advanceTimersByTimeAsync(5000)
    expect(cancelConnect).not.toHaveBeenCalled()
  })

  it('still reports CONNECTION_TIMEOUT when cancelConnect throws during cleanup', async () => {
    vi.useFakeTimers()
    const cancelConnect = vi.fn(() => {
      throw new Error('bridge already closed')
    })
    const pending = withConnectTimeout(new Promise(() => {}), { name: 'Mock', cancelConnect }, 500)
    const settled = expect(pending).rejects.toMatchObject({ code: 'CONNECTION_TIMEOUT' })
    await vi.advanceTimersByTimeAsync(500)
    await settled
  })

  it('rejects a pending signTransaction with USER_REJECTED when the manager cancels signing', async () => {
    const adapter = makeAdapter()
    const manager = new WalletManager({ adapters: [adapter] })
    await manager.connect('mock')

    const signing = manager.activeAdapter!.signTransaction('AAAA-xdr')
    const settled = expect(signing).rejects.toMatchObject({ code: 'USER_REJECTED' })
    manager.cancelSigning()
    await settled
  })

  it('invokes the adapter cancelSigning hook once when signing is cancelled', async () => {
    const cancelSigning = vi.fn()
    const adapter = makeAdapter({ cancelSigning } as Partial<SorobanWalletAdapter>)
    const manager = new WalletManager({ adapters: [adapter] })
    await manager.connect('mock')

    void manager.activeAdapter!.signTransaction('AAAA-xdr').catch(() => undefined)
    manager.cancelSigning()
    expect(cancelSigning).toHaveBeenCalledTimes(1)
  })

  it('is a no-op when no signing prompt is pending', async () => {
    const manager = new WalletManager({ adapters: [makeAdapter()] })
    await manager.connect('mock')
    expect(() => manager.cancelSigning()).not.toThrow()
  })
})

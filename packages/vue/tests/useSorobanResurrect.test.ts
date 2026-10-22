import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useSorobanResurrect } from '../src/composables/useSorobanResurrect.js'
import type { UseSorobanResurrectOptions } from '../src/types.js'

const defaultOptions: UseSorobanResurrectOptions = {
  rpcUrl: 'https://soroban-testnet.stellar.org',
  networkPassphrase: 'Test SDF Network ; September 2015',
}

describe('useSorobanResurrect - SSR guard', () => {
  let originalWindow: typeof window | undefined

  beforeEach(() => {
    originalWindow = global.window
  })

  afterEach(() => {
    if (originalWindow) {
      global.window = originalWindow
    } else {
      // @ts-ignore
      delete global.window
    }
  })

  it('returns SSR-safe refs when window is undefined', () => {
    // @ts-ignore
    delete global.window

    const result = useSorobanResurrect(defaultOptions)

    expect(result.isChecking).toBeDefined()
    expect(result.isExecuting).toBeDefined()
    expect(result.lastResult).toBeDefined()
    expect(result.error).toBeDefined()
    expect(result.needsRestore).toBeDefined()
    expect(result.archivedKeys).toBeDefined()
  })

  it('throws when calling checkTransaction during SSR', async () => {
    // @ts-ignore
    delete global.window

    const result = useSorobanResurrect(defaultOptions)

    await expect(result.checkTransaction('tx-xdr')).rejects.toThrow('useSorobanResurrect cannot be called during SSR')
  })

  it('throws when calling executeWithRestore during SSR', async () => {
    // @ts-ignore
    delete global.window

    const result = useSorobanResurrect(defaultOptions)

    await expect(
      result.executeWithRestore('tx-xdr', async () => 'signed'),
    ).rejects.toThrow('useSorobanResurrect cannot be called during SSR')
  })

  it('reset does not throw during SSR', () => {
    // @ts-ignore
    delete global.window

    const result = useSorobanResurrect(defaultOptions)

    expect(() => result.reset()).not.toThrow()
  })
})

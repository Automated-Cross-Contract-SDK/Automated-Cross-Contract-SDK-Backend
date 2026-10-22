import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const fallbackKeys = {
  readOnly: [{ toXDR: () => 'ro-key' }],
  readWrite: [{ toXDR: () => 'rw-key' }],
  all: [{ toXDR: () => 'ro-key' }, { toXDR: () => 'rw-key' }],
}

vi.mock('@soroban-resurrect/sdk', () => ({
  extractKeysFromFootprint: vi.fn(() => fallbackKeys),
  classifyLedgerKey: vi.fn(() => ({
    keyType: 'contractData',
    restorePriority: 2,
  })),
  extractFootprintFromTransactionStreaming: vi.fn(() => fallbackKeys),
}))

vi.mock('@stellar/stellar-sdk', () => ({
  xdr: {
    LedgerFootprint: { fromXDR: vi.fn(() => ({})) },
    LedgerKey: { fromXDR: vi.fn(() => ({})) },
  },
}))

const originalWebAssembly = globalThis.WebAssembly

async function loadFreshModule() {
  vi.resetModules()
  return import('../src/index.js')
}

describe('footprint-parser-wasm lazy loading', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    Object.defineProperty(globalThis, 'WebAssembly', {
      value: originalWebAssembly,
      configurable: true,
      writable: true,
    })
  })

  it('does not initialise WASM at import time', async () => {
    const instantiate = vi.spyOn(WebAssembly, 'instantiate')
    await loadFreshModule()
    expect(instantiate).not.toHaveBeenCalled()
  })

  it('returns false and skips the pkg import when WebAssembly is unavailable', async () => {
    Object.defineProperty(globalThis, 'WebAssembly', { value: undefined, configurable: true, writable: true })
    const mod = await loadFreshModule()

    await expect(mod.initWasm()).resolves.toBe(false)
  })

  it('falls back to the TypeScript parser when the WASM pkg cannot be loaded', async () => {
    const mod = await loadFreshModule()

    await expect(mod.initWasm()).resolves.toBe(false)
    expect(console.warn).toHaveBeenCalledWith(
      '[footprint-parser-wasm] WASM init failed, falling back to TypeScript:',
      expect.any(String),
    )

    const keys = await mod.extractFootprintKeys('AAAA')
    expect(keys).toEqual({
      readOnlyCount: 1,
      readWriteCount: 1,
      totalCount: 2,
      keysBase64: ['ro-key', 'rw-key'],
    })
  })

  it('attempts WASM initialisation once and caches the failed result', async () => {
    const mod = await loadFreshModule()

    await expect(mod.initWasm()).resolves.toBe(false)
    await expect(mod.initWasm()).resolves.toBe(false)

    expect(console.warn).toHaveBeenCalledTimes(1)
  })
})

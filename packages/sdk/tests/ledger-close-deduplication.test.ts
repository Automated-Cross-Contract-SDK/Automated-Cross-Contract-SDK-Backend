import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SorobanResurrect } from '../src/soroban-resurrect.js'

describe('SorobanResurrect: ledger-close event deduplication', () => {
  let client: SorobanResurrect
  let logSpy: any

  beforeEach(() => {
    logSpy = vi.fn()
    client = new SorobanResurrect({
      rpcUrl: 'https://example.com',
      networkPassphrase: 'Test Network',
      onLog: logSpy,
    })
  })

  it('emits ledger-close event for the first sequence', () => {
    const isDuplicate = client.emitLedgerClose(1000)
    expect(isDuplicate).toBe(false)
    expect(logSpy).toHaveBeenCalledWith('info', expect.stringContaining('Ledger closed: sequence 1000'))
  })

  it('suppresses duplicate ledger-close event for the same sequence within 2s', () => {
    client.emitLedgerClose(1001)
    const isDuplicate = client.emitLedgerClose(1001)

    expect(isDuplicate).toBe(true)
    expect(logSpy).toHaveBeenCalledWith('info', expect.stringContaining('Suppressed duplicate ledger-close event for sequence 1001'))
  })

  it('allows different sequences to emit independently', () => {
    expect(client.emitLedgerClose(1000)).toBe(false)
    expect(client.emitLedgerClose(1001)).toBe(false)
    expect(client.emitLedgerClose(1002)).toBe(false)

    // Duplicates are suppressed
    expect(client.emitLedgerClose(1000)).toBe(true)
    expect(client.emitLedgerClose(1001)).toBe(true)
    expect(client.emitLedgerClose(1002)).toBe(true)
  })

  it('allows re-emission of same sequence after 2-second window', async () => {
    // Mock the short window for testing
    const testClient = new SorobanResurrect({
      rpcUrl: 'https://example.com',
      networkPassphrase: 'Test Network',
      onLog: logSpy,
    })

    // Create a new client with deduplicator using shorter window for testing
    expect(testClient.emitLedgerClose(2000)).toBe(false)
    expect(testClient.emitLedgerClose(2000)).toBe(true)

    // After waiting longer than 2 seconds, same sequence can be emitted again
    await new Promise(r => setTimeout(r, 2100))

    expect(testClient.emitLedgerClose(2000)).toBe(false)
  })

  it('handles a sequence of reconnect-like events with duplicates', () => {
    // Simulate: sequence 100 arrives, connection drops and reconnects, same sequence arrives again
    expect(client.emitLedgerClose(100)).toBe(false)
    expect(client.emitLedgerClose(100)).toBe(true) // Duplicate suppressed

    // More sequences continue arriving
    expect(client.emitLedgerClose(101)).toBe(false)
    expect(client.emitLedgerClose(102)).toBe(false)

    // Old sequence arrives again (reconnect re-deliver)
    expect(client.emitLedgerClose(100)).toBe(true) // Still within window, still suppressed

    // But not the new ones
    expect(client.emitLedgerClose(101)).toBe(true) // Duplicate
    expect(client.emitLedgerClose(102)).toBe(true) // Duplicate
  })

  it('logs appropriate messages for emitted vs suppressed events', () => {
    client.emitLedgerClose(5000)
    expect(logSpy).toHaveBeenCalledWith('info', 'Ledger closed: sequence 5000')

    logSpy.mockClear()

    client.emitLedgerClose(5000)
    expect(logSpy).toHaveBeenCalledWith('info', 'Suppressed duplicate ledger-close event for sequence 5000')
  })
})

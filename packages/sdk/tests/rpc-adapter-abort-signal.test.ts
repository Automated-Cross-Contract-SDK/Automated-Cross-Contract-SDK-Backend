/**
 * Issue #526: every method on the RPC adapter must accept an AbortSignal and
 * forward it to the underlying server. An already-aborted signal must reject
 * the call with an AbortError without issuing the request, and an in-flight
 * request must be cancelled when its signal fires.
 */
import { describe, it, expect, vi } from 'vitest'
import { StellarSdkRpcAdapter } from '../../rpc/src/stellar-sdk-adapter.js'

const METHODS = [
  { name: 'getAccount', args: ['GABC'] },
  { name: 'simulateTransaction', args: [{}] },
  { name: 'sendTransaction', args: [{}] },
  { name: 'getTransaction', args: ['hash'] },
  { name: 'getLedgerEntries', args: [{}] },
  { name: 'getNetwork', args: [] },
] as const

function makeServer() {
  const server: Record<string, ReturnType<typeof vi.fn>> = {}
  for (const { name } of METHODS) {
    server[name] = vi.fn(() => Promise.resolve({}))
  }
  return server
}

/** Replaces every server method with one that never settles, simulating a slow node. */
function hangAllMethods(server: Record<string, ReturnType<typeof vi.fn>>) {
  for (const { name } of METHODS) {
    server[name].mockImplementation(() => new Promise(() => undefined))
  }
}

describe('RPC adapter AbortSignal propagation (#526)', () => {
  it.each(METHODS)('$name rejects with AbortError when the signal is already aborted', async ({ name, args }) => {
    const server = makeServer()
    const adapter = new StellarSdkRpcAdapter(server as any) as any
    const controller = new AbortController()
    controller.abort()

    await expect(adapter[name](...args, controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
    expect(server[name]).not.toHaveBeenCalled()
  })

  it.each(METHODS)('$name forwards the signal to the underlying server', async ({ name, args }) => {
    const server = makeServer()
    const adapter = new StellarSdkRpcAdapter(server as any) as any
    const controller = new AbortController()

    void adapter[name](...args, controller.signal)

    const forwarded = server[name].mock.calls[0]?.at(-1) as AbortSignal | undefined
    expect(forwarded).toBe(controller.signal)
  })

  it.each(METHODS)('$name cancels an in-flight request when the signal fires', async ({ name, args }) => {
    const server = makeServer()
    hangAllMethods(server)
    const adapter = new StellarSdkRpcAdapter(server as any) as any
    const controller = new AbortController()

    const pending = adapter[name](...args, controller.signal)
    controller.abort()

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('leaves calls without a signal unchanged', async () => {
    const server = makeServer()
    server.getNetwork.mockResolvedValueOnce({ passphrase: 'Test SDF Network ; September 2015' })
    const adapter = new StellarSdkRpcAdapter(server as any)

    await expect(adapter.getNetwork()).resolves.toEqual({ passphrase: 'Test SDF Network ; September 2015' })
  })
})

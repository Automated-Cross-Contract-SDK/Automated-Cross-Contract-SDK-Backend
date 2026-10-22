import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SorobanResurrect } from '../src/soroban-resurrect.js'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('concurrent restore submissions are coalesced (#513)', () => {
  let client: SorobanResurrect
  let send: ReturnType<typeof vi.spyOn>
  const sign = vi.fn(async (xdr: string) => `signed-${xdr}`)

  beforeEach(() => {
    vi.clearAllMocks()
    client = new SorobanResurrect({
      rpcUrl: 'https://soroban-testnet.stellar.org',
      networkPassphrase: 'Test SDF Network ; September 2015',
    })
    send = vi.spyOn(client as any, 'sendSignedTransaction')
  })

  it('shares one submission between concurrent calls for the same XDR', async () => {
    const gate = deferred<string>()
    send.mockReturnValue(gate.promise)

    const first = (client as any).submitSignedTransaction('tx-A', sign)
    const second = (client as any).submitSignedTransaction('tx-A', sign)

    expect(send).toHaveBeenCalledTimes(1)
    gate.resolve('hash-A')
    await expect(first).resolves.toBe('hash-A')
    await expect(second).resolves.toBe('hash-A')
  })

  it('does not coalesce different transactions', async () => {
    send.mockImplementation(async (xdr: unknown) => `hash-${String(xdr)}`)

    const [a, b] = await Promise.all([
      (client as any).submitSignedTransaction('tx-A', sign),
      (client as any).submitSignedTransaction('tx-B', sign),
    ])

    expect(send).toHaveBeenCalledTimes(2)
    expect([a, b]).toEqual(['hash-tx-A', 'hash-tx-B'])
  })

  it('propagates a failure to every waiter and then allows a fresh attempt', async () => {
    const gate = deferred<string>()
    send.mockReturnValueOnce(gate.promise)

    const first = (client as any).submitSignedTransaction('tx-A', sign)
    const second = (client as any).submitSignedTransaction('tx-A', sign)
    gate.reject(new Error('network down'))

    await expect(first).rejects.toThrow('network down')
    await expect(second).rejects.toThrow('network down')

    send.mockResolvedValueOnce('hash-retry')
    await expect((client as any).submitSignedTransaction('tx-A', sign)).resolves.toBe('hash-retry')
    expect(send).toHaveBeenCalledTimes(2)
  })

  it('clears the in-flight entry once a submission settles', async () => {
    send.mockResolvedValue('hash-A')

    await (client as any).submitSignedTransaction('tx-A', sign)

    expect((client as any).inFlightSubmissions.size).toBe(0)
  })
})

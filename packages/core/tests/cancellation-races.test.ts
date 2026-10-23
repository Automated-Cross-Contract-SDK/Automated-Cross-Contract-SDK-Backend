import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Account, Keypair, Operation, SorobanRpc, TransactionBuilder } from '@stellar/stellar-sdk'
import { SorobanResurrect } from '../src/soroban-resurrect.js'

const NETWORK_PASSPHRASE = 'Test SDF Network ; September 2015'

function createClient(signal: AbortSignal): SorobanResurrect {
  return new SorobanResurrect({
    rpcUrl: 'https://soroban-testnet.stellar.org',
    networkPassphrase: NETWORK_PASSPHRASE,
    pollIntervalMs: 1,
    maxPollAttempts: 5,
    signal,
  } as any)
}

describe('cancellation races during signing, submission and confirmation polling', () => {
  let controller: AbortController
  let client: SorobanResurrect
  let send: ReturnType<typeof vi.fn>
  let getTx: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.spyOn(SorobanRpc.Server.prototype, 'getNetwork').mockResolvedValue({ passphrase: NETWORK_PASSPHRASE } as any)
    controller = new AbortController()
    client = createClient(controller.signal)
    vi.spyOn(client as any, 'ensureNetworkIdentityMatches').mockResolvedValue(undefined)
    vi.spyOn(client as any, 'assertSignerMatchesSource').mockReturnValue(undefined)
    vi.spyOn(client as any, 'retryOnFailure').mockImplementation((fn: any) => fn())
    send = vi.fn(async () => ({ status: 'PENDING', hash: 'abc' }))
    getTx = vi.fn(async () => ({ status: 'NOT_FOUND' }))
    vi.spyOn(SorobanRpc.Server.prototype, 'sendTransaction').mockImplementation(send as any)
    vi.spyOn(SorobanRpc.Server.prototype, 'getTransaction').mockImplementation(getTx as any)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  const submit = (sign: (xdr: string) => Promise<string>) =>
    (client as any).submitSignedTransaction('unsigned', sign) as Promise<string>

  it('does not call the wallet when aborted before signing', async () => {
    controller.abort()
    const sign = vi.fn(async (x: string) => x)

    await expect(submit(sign)).rejects.toMatchObject({ name: 'AbortError', stage: 'signing', txHash: undefined })
    expect(sign).not.toHaveBeenCalled()
    expect(send).not.toHaveBeenCalled()
  })

  it('does not submit when aborted while the wallet is signing', async () => {
    const sign = vi.fn(async (x: string) => {
      controller.abort('user closed wallet')
      return x
    })

    await expect(submit(sign)).rejects.toMatchObject({
      name: 'AbortError',
      stage: 'submission',
      cause: 'user closed wallet',
    })
    expect(sign).toHaveBeenCalledOnce()
    expect(send).not.toHaveBeenCalled()
  })

  it('reports the hash when aborted after submission, before polling', async () => {
    const signedXDR = new TransactionBuilder(new Account(Keypair.random().publicKey(), '1'), {
      fee: '100',
      networkPassphrase: NETWORK_PASSPHRASE,
    })
      .addOperation(Operation.bumpSequence({ bumpTo: '2' }))
      .setTimeout(0)
      .build()
      .toXDR()
    send.mockImplementation(async () => {
      controller.abort()
      return { status: 'PENDING', hash: 'abc' }
    })

    const err = await submit(async () => signedXDR).catch((e) => e)

    expect(err).toMatchObject({ name: 'AbortError', stage: 'confirmation', txHash: 'abc' })
    expect(err.message).toMatch(/may still be applied/)
    expect(send).toHaveBeenCalledOnce()
    expect(getTx).not.toHaveBeenCalled()
  })

  it('stops confirmation polling when aborted between polls', async () => {
    getTx.mockImplementation(async () => {
      if (getTx.mock.calls.length === 2) controller.abort()
      return { status: 'NOT_FOUND' }
    })

    await expect(client.waitForTransaction('abc')).rejects.toMatchObject({
      name: 'AbortError',
      stage: 'confirmation',
      txHash: 'abc',
    })
    expect(getTx).toHaveBeenCalledTimes(2)
  })

  it('lets a receipt that lands before the abort win', async () => {
    getTx.mockImplementation(async () => {
      controller.abort()
      return { status: 'SUCCESS' }
    })

    await expect(client.waitForTransaction('abc')).resolves.toEqual({ hash: 'abc', transport: 'polling' })
  })

  it('does nothing when the signal is never aborted', async () => {
    let calls = 0
    getTx.mockImplementation(async () => (++calls === 3 ? { status: 'SUCCESS' } : { status: 'NOT_FOUND' }))

    await expect(client.waitForTransaction('abc')).resolves.toMatchObject({ hash: 'abc' })
    expect(getTx).toHaveBeenCalledTimes(3)
  })
})

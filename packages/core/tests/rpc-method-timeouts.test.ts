import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SorobanRpc } from '@stellar/stellar-sdk'
import { SorobanResurrect } from '../src/soroban-resurrect.js'

const RPC_URL = 'https://soroban-testnet.stellar.org'
const NETWORK_PASSPHRASE = 'Test SDF Network ; September 2015'

type MethodCall = <T>(method: 'getAccount' | 'getTransaction', call: () => Promise<T>) => Promise<T>

function neverSettles(): Promise<never> {
  return new Promise<never>(() => {})
}

describe('rpcMethodTimeouts', () => {
  beforeEach(() => {
    vi.spyOn(SorobanRpc.Server.prototype, 'getNetwork').mockResolvedValue({
      passphrase: NETWORK_PASSPHRASE,
    } as never)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('fails a configured method once its own limit elapses', async () => {
    const client = new SorobanResurrect({
      rpcUrl: RPC_URL,
      networkPassphrase: NETWORK_PASSPHRASE,
      rpcMethodTimeouts: { getAccount: 40 },
    })
    const withMethodTimeout = (client as unknown as { withMethodTimeout: MethodCall })
      .withMethodTimeout.bind(client)
    const startedAt = Date.now()

    const failure = withMethodTimeout('getAccount', neverSettles)

    await expect(failure).rejects.toThrow(/RPC method getAccount timed out after 40ms/)
    await expect(failure).rejects.toHaveProperty('code', 'NETWORK_ERROR')

    const elapsed = Date.now() - startedAt
    expect(elapsed).toBeGreaterThanOrEqual(35)
    expect(elapsed).toBeLessThan(500)
  })

  it('leaves methods without an override unbounded by this limit', async () => {
    const client = new SorobanResurrect({
      rpcUrl: RPC_URL,
      networkPassphrase: NETWORK_PASSPHRASE,
      rpcMethodTimeouts: { getAccount: 40 },
    })
    const withMethodTimeout = (client as unknown as { withMethodTimeout: MethodCall })
      .withMethodTimeout.bind(client)

    const result = await withMethodTimeout('getTransaction', () =>
      new Promise<string>(resolve => setTimeout(() => resolve('done'), 80)),
    )

    expect(result).toBe('done')
  })

  it('returns the call result when it settles within the limit', async () => {
    const client = new SorobanResurrect({
      rpcUrl: RPC_URL,
      networkPassphrase: NETWORK_PASSPHRASE,
      rpcMethodTimeouts: { getAccount: 500 },
    })
    const withMethodTimeout = (client as unknown as { withMethodTimeout: MethodCall })
      .withMethodTimeout.bind(client)

    await expect(withMethodTimeout('getAccount', async () => 'fast')).resolves.toBe('fast')
  })
})

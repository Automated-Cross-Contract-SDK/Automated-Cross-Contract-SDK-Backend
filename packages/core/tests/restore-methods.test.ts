import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SorobanRpc } from '@stellar/stellar-sdk'
import { SorobanResurrect } from '../src/soroban-resurrect.js'

const RPC_URL = 'https://rpc.example.com'
const NETWORK_PASSPHRASE = 'Test SDF Network ; September 2015'
const SOURCE = 'GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H'
const ARCHIVED_KEYS = [{ key: 'k1', keyBase64: 'AAAA' }] as never

const METHOD_NOT_FOUND = { jsonrpc: '2.0', id: 1, error: { code: -32601, message: 'method not found' } }
const INVALID_PARAMS = { jsonrpc: '2.0', id: 1, error: { code: -32602, message: 'invalid params' } }

/** Builds a fetch stub that answers each probed method from `missing`. */
function probeFetch(missing: string[] = []) {
  return vi.fn(async (_url: string, init?: RequestInit) => {
    const { method } = JSON.parse(String(init?.body)) as { method: string }
    const body = missing.includes(method) ? METHOD_NOT_FOUND : INVALID_PARAMS
    return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
  })
}

function createClient(): SorobanResurrect {
  return new SorobanResurrect({ rpcUrl: RPC_URL, networkPassphrase: NETWORK_PASSPHRASE })
}

type Probeable = { ensureRestoreMethodsAvailable(): Promise<void> }

describe('restore flow RPC method check', () => {
  beforeEach(() => {
    vi.spyOn(SorobanRpc.Server.prototype, 'getNetwork').mockResolvedValue({
      passphrase: NETWORK_PASSPHRASE,
      protocolVersion: 22,
    } as never)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('passes when every required method exists, even if invalid-params is returned', async () => {
    vi.stubGlobal('fetch', probeFetch())
    const client = createClient()

    await expect((client as unknown as Probeable).ensureRestoreMethodsAvailable()).resolves.toBeUndefined()
    client.destroy()
  })

  it('fails before building when sendTransaction is missing, naming the method', async () => {
    vi.stubGlobal('fetch', probeFetch(['sendTransaction']))
    const client = createClient()

    const error = await client.buildRestoreTransaction(ARCHIVED_KEYS, SOURCE).catch(err => err)

    expect(error.code).toBe('RPC_METHOD_UNAVAILABLE')
    expect(error.message).toContain('sendTransaction')
    expect(error.message).toContain(RPC_URL)
    client.destroy()
  })

  it('fails the batch builder the same way when getLedgerEntries is missing', async () => {
    vi.stubGlobal('fetch', probeFetch(['getLedgerEntries']))
    const client = createClient()

    const error = await client.buildRestoreTransactionBatches(ARCHIVED_KEYS, SOURCE).catch(err => err)

    expect(error.code).toBe('RPC_METHOD_UNAVAILABLE')
    expect(error.message).toContain('getLedgerEntries')
    client.destroy()
  })

  it('reports a transport failure as NETWORK_ERROR rather than a missing method', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('socket hang up')
    }))
    const client = createClient()

    const error = await client.buildRestoreTransaction(ARCHIVED_KEYS, SOURCE).catch(err => err)

    expect(error.code).toBe('NETWORK_ERROR')
    expect(error.message).toContain('socket hang up')
    client.destroy()
  })

  it('re-probes after a transport failure instead of caching it', async () => {
    const fetchStub = vi
      .fn()
      .mockRejectedValueOnce(new Error('socket hang up'))
      .mockImplementation(probeFetch() as never)
    vi.stubGlobal('fetch', fetchStub)
    const client = createClient()
    const checker = client as unknown as Probeable

    await expect(checker.ensureRestoreMethodsAvailable()).rejects.toThrow('socket hang up')
    await expect(checker.ensureRestoreMethodsAvailable()).resolves.toBeUndefined()
    client.destroy()
  })

  it('caches a successful probe so repeated builds do not re-probe the endpoint', async () => {
    const fetchStub = probeFetch()
    vi.stubGlobal('fetch', fetchStub)
    const client = createClient()
    const checker = client as unknown as Probeable

    await checker.ensureRestoreMethodsAvailable()
    await checker.ensureRestoreMethodsAvailable()

    expect(fetchStub).toHaveBeenCalledTimes(4)
    client.destroy()
  })
})

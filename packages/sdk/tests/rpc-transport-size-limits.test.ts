/**
 * Issue #527: request and response bodies crossing the RPC transport must be
 * capped by configurable limits. Oversized requests are rejected before they
 * are sent, and oversized responses are rejected before they are parsed, so a
 * misbehaving or hostile endpoint cannot exhaust memory.
 *
 * The Stellar SDK sends every RPC call through its shared axios instance, so
 * the transport is stubbed at the axios adapter level.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { createRequire } from 'node:module'
import type { AxiosRequestConfig } from 'axios'
import { createStellarSdkAdapter } from '../../rpc/src/stellar-sdk-adapter.js'

// The SDK's RPC client is a module-level axios instance that is not exported,
// so load it by the path the SDK's entry point resolves to.
const require = createRequire(import.meta.url)
const sdkEntry = require.resolve('@stellar/stellar-sdk')
const { default: sdkAxios } = require(sdkEntry.replace(/lib\/index\.js$/, 'lib/rpc/axios.js'))

const RPC_URL = 'https://rpc.example.com'
const LIMITS = { maxRequestBytes: 1024, maxResponseBytes: 4096 }

type Reply = { status: number; headers: Record<string, string>; data: string }

const originalAdapter = sdkAxios.defaults.adapter

/** Routes every RPC request through `respond` instead of the network. */
function stubTransport(respond: (config: AxiosRequestConfig) => Reply) {
  const calls: AxiosRequestConfig[] = []
  sdkAxios.defaults.adapter = async (config: AxiosRequestConfig) => {
    calls.push(config)
    const reply = respond(config)
    return {
      data: reply.data,
      status: reply.status,
      statusText: 'OK',
      headers: reply.headers,
      config,
      request: {},
    } as any
  }
  return calls
}

const rpcResult = (result: unknown) => JSON.stringify({ jsonrpc: '2.0', id: 1, result })

describe('RPC transport size limits (#527)', () => {
  afterEach(() => {
    sdkAxios.defaults.adapter = originalAdapter
  })

  it('rejects a response whose declared content-length exceeds maxResponseBytes', async () => {
    stubTransport(() => ({
      status: 200,
      headers: { 'content-type': 'application/json', 'content-length': String(LIMITS.maxResponseBytes + 1) },
      data: rpcResult({}),
    }))
    const adapter = createStellarSdkAdapter(RPC_URL, undefined, { limits: LIMITS } as any)

    await expect(adapter.getNetwork()).rejects.toThrow(/maxResponseBytes/)
  })

  it('rejects a response body larger than maxResponseBytes even without a content-length', async () => {
    const oversized = rpcResult({ padding: 'x'.repeat(LIMITS.maxResponseBytes * 2) })
    stubTransport(() => ({
      status: 200,
      headers: { 'content-type': 'application/json' },
      data: oversized,
    }))
    const adapter = createStellarSdkAdapter(RPC_URL, undefined, { limits: LIMITS } as any)

    await expect(adapter.getNetwork()).rejects.toThrow(/maxResponseBytes/)
  })

  it('rejects an outgoing request body larger than maxRequestBytes before sending it', async () => {
    const calls = stubTransport(() => ({
      status: 200,
      headers: { 'content-type': 'application/json' },
      data: rpcResult({ entries: [] }),
    }))
    const adapter = createStellarSdkAdapter(RPC_URL, undefined, { limits: LIMITS } as any)
    const oversizedKey = { toXDR: () => 'A'.repeat(LIMITS.maxRequestBytes * 2) } as any

    await expect(adapter.getLedgerEntries(oversizedKey)).rejects.toThrow(/maxRequestBytes/)
    expect(calls).toHaveLength(0)
  })

  it('passes responses within the limits through unchanged', async () => {
    stubTransport(() => ({
      status: 200,
      headers: { 'content-type': 'application/json', 'content-length': '64' },
      data: rpcResult({ passphrase: 'Test SDF Network ; September 2015' }),
    }))
    const adapter = createStellarSdkAdapter(RPC_URL, undefined, { limits: LIMITS } as any)

    const result = await adapter.getNetwork()

    expect(result).toMatchObject({ passphrase: 'Test SDF Network ; September 2015' })
  })

  it('applies no size limit when limits are not configured', async () => {
    stubTransport(() => ({
      status: 200,
      headers: { 'content-type': 'application/json' },
      data: rpcResult({ padding: 'y'.repeat(LIMITS.maxResponseBytes * 4) }),
    }))
    const adapter = createStellarSdkAdapter(RPC_URL)

    await expect(adapter.getNetwork()).resolves.toBeDefined()
  })
})

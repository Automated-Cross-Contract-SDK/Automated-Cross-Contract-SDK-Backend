/**
 * Issue #524: normalized RPC errors must carry the stable identifier (URL) of
 * the endpoint that produced them, so callers can tell which node failed when
 * several fallbacks are configured.
 */
import { describe, it, expect } from 'vitest'
import { SorobanResurrect } from '../src/soroban-resurrect.js'
import { SorobanResurrectError } from '../src/types.js'

const PRIMARY = 'https://rpc-primary.example.com'
const FALLBACK = 'https://rpc-fallback.example.com'

function makeClient() {
  return new SorobanResurrect({
    rpcUrl: [PRIMARY, FALLBACK],
    networkPassphrase: 'Test SDF Network ; September 2015',
    failoverConfig: { maxFailuresBeforeFallback: 1 },
  } as any)
}

describe('RPC error endpoint identifier (#524)', () => {
  it('normalizes a transport failure into NETWORK_ERROR with the failing endpoint url', async () => {
    const client = makeClient() as any
    const failing = Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' })

    const err = await client
      .retryOnFailure(async () => {
        throw failing
      }, 'getLedgerEntries')
      .catch((e: unknown) => e)

    expect(err).toBeInstanceOf(SorobanResurrectError)
    expect(err.code).toBe('NETWORK_ERROR')
    expect(err.rpcUrl).toBe(PRIMARY)
    expect(err.cause).toBe(failing)
  })

  it('reports the fallback url after failover, not the endpoint that was abandoned', async () => {
    const client = makeClient() as any
    client.failoverManager.recordFailure(PRIMARY)

    const err = await client
      .retryOnFailure(async () => {
        throw new Error('503 Service Unavailable')
      }, 'simulateTransaction')
      .catch((e: unknown) => e)

    expect(err.rpcUrl).toBe(FALLBACK)
  })

  it('keeps the endpoint identifier in the serialized error context', async () => {
    const client = makeClient() as any

    const err = await client
      .retryOnFailure(async () => {
        throw new Error('connection refused')
      }, 'getNetwork')
      .catch((e: unknown) => e)

    expect(err.message).toContain(PRIMARY)
    expect(err.rpcUrl).toBe(PRIMARY)
  })

  it('does not attach an endpoint identifier to non-transport errors', async () => {
    const client = makeClient() as any

    const err = await client
      .retryOnFailure(async () => {
        throw new SorobanResurrectError('bad xdr', 'INVALID_XDR')
      }, 'sendTransaction')
      .catch((e: unknown) => e)

    expect(err.code).toBe('INVALID_XDR')
    expect(err.rpcUrl).toBeUndefined()
  })
})

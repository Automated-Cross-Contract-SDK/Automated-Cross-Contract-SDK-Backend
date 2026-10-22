/**
 * Issue #525: once a restore flow starts, every read it performs should go to
 * the same RPC endpoint. A mid-flow failover must not split one flow across
 * nodes whose ledger state may differ.
 */
import { describe, it, expect, vi } from 'vitest'
import { SorobanResurrect } from '../src/soroban-resurrect.js'

const PRIMARY = 'https://rpc-primary.example.com'
const FALLBACK = 'https://rpc-fallback.example.com'

function makeClient() {
  return new SorobanResurrect({
    rpcUrl: [PRIMARY, FALLBACK],
    networkPassphrase: 'Test SDF Network ; September 2015',
    failoverConfig: { maxFailuresBeforeFallback: 1 },
  } as any)
}

/** Records the endpoint each call was routed to. */
function recordEndpoints(client: any) {
  const urls: string[] = []
  const original = client.getServer.bind(client)
  client.getServer = (url?: string) => {
    const target = url ?? client.failoverManager.getCurrentUrl()
    urls.push(target)
    return original(target)
  }
  return urls
}

describe('restore flow endpoint consistency (#525)', () => {
  it('routes every read in one restore flow to the same endpoint', async () => {
    const client = makeClient() as any
    const urls = recordEndpoints(client)

    const flow = client.beginRestoreFlow()
    for (let i = 0; i < 5; i++) {
      await client.retryOnFailure(async () => i, 'getLedgerEntries(diff)')
    }
    flow.end()

    expect(new Set(urls).size).toBe(1)
    expect(urls[0]).toBe(PRIMARY)
  })

  it('keeps the pinned endpoint when the primary fails mid-flow', async () => {
    const client = makeClient() as any
    const urls = recordEndpoints(client)

    await client.retryOnFailure(async () => 'ok', 'getLedgerEntries')
    await client.retryOnFailure(async () => {
      throw new Error('429 Too Many Requests')
    }, 'getLedgerEntries').catch(() => undefined)
    await client.retryOnFailure(async () => 'ok', 'simulateTransaction')

    const distinct = new Set(urls)
    expect(distinct.size).toBe(1)
  })

  it('does not change endpoints between the simulate and the submit step of one restore', async () => {
    const client = makeClient() as any
    const urls = recordEndpoints(client)
    const failoverSpy = vi.spyOn(client.failoverManager, 'recordFailure')

    await client.retryOnFailure(async () => 'simulated', 'simulateTransaction')
    client.failoverManager.recordFailure(PRIMARY)
    await client.retryOnFailure(async () => 'submitted', 'sendTransaction')

    expect(failoverSpy).toHaveBeenCalledWith(PRIMARY)
    expect(new Set(urls).size).toBe(1)
  })

  it('releases the pin when the restore flow ends so later flows can fail over', async () => {
    const client = makeClient() as any
    const flow = client.beginRestoreFlow()
    flow.end()

    client.failoverManager.recordFailure(PRIMARY)
    expect(client.failoverManager.getCurrentUrl()).toBe(FALLBACK)
  })
})

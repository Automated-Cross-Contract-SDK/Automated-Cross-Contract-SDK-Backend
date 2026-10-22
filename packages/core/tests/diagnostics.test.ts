import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SorobanRpc } from '@stellar/stellar-sdk'
import { SorobanResurrect } from '../src/soroban-resurrect.js'

const PRIMARY_URL = 'https://primary.example.com'
const SECONDARY_URL = 'https://secondary.example.com'
const NETWORK_PASSPHRASE = 'Test SDF Network ; September 2015'

function createClient(rpcUrl: string | string[] = PRIMARY_URL): SorobanResurrect {
  return new SorobanResurrect({
    rpcUrl,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
}

describe('SorobanResurrect.getDiagnostics', () => {
  beforeEach(() => {
    vi.spyOn(SorobanRpc.Server.prototype, 'getNetwork').mockResolvedValue({
      passphrase: NETWORK_PASSPHRASE,
      protocolVersion: 22,
    } as never)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('reports the negotiated network, protocol version and active endpoint', async () => {
    const client = createClient(PRIMARY_URL)

    const diagnostics = await client.getDiagnostics()

    expect(diagnostics.networkPassphrase).toBe(NETWORK_PASSPHRASE)
    expect(diagnostics.protocolVersion).toBe(22)
    expect(diagnostics.networkError).toBeNull()
    expect(diagnostics.activeEndpoint).toBe(PRIMARY_URL)
    expect(diagnostics.endpoints.map(ep => ep.url)).toEqual([PRIMARY_URL])
    client.destroy()
  })

  it('lists every RPC method the SDK calls', async () => {
    const client = createClient(PRIMARY_URL)

    const diagnostics = await client.getDiagnostics()

    expect(diagnostics.sdkRpcMethods).toEqual(
      expect.arrayContaining(['getNetwork', 'simulateTransaction', 'sendTransaction', 'getTransaction', 'getLedgerEntries']),
    )
    client.destroy()
  })

  it('reports a failed getNetwork call without throwing', async () => {
    vi.spyOn(SorobanRpc.Server.prototype, 'getNetwork').mockRejectedValue(new Error('connection refused'))
    const client = createClient(PRIMARY_URL)

    const diagnostics = await client.getDiagnostics()

    expect(diagnostics.networkPassphrase).toBeNull()
    expect(diagnostics.protocolVersion).toBeNull()
    expect(diagnostics.networkError).toContain('connection refused')
    expect(diagnostics.activeEndpoint).toBe(PRIMARY_URL)
    client.destroy()
  })

  it('moves the active endpoint to the next URL once the primary is marked unhealthy', async () => {
    const client = createClient([PRIMARY_URL, SECONDARY_URL])
    const failover = (client as unknown as { failoverManager: { recordFailure(url: string): void } }).failoverManager
    for (let i = 0; i < 3; i++) failover.recordFailure(PRIMARY_URL)

    const diagnostics = await client.getDiagnostics()

    expect(diagnostics.activeEndpoint).toBe(SECONDARY_URL)
    const primary = diagnostics.endpoints.find(ep => ep.url === PRIMARY_URL)
    expect(primary?.isHealthy).toBe(false)
    client.destroy()
  })

  it('reports no active endpoint when every endpoint is unhealthy', async () => {
    const client = createClient(PRIMARY_URL)
    const failover = (client as unknown as { failoverManager: { recordFailure(url: string): void } }).failoverManager
    for (let i = 0; i < 3; i++) failover.recordFailure(PRIMARY_URL)

    const diagnostics = await client.getDiagnostics()

    expect(diagnostics.activeEndpoint).toBeNull()
    client.destroy()
  })
})

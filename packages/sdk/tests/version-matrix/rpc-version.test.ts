import { describe, it, expect, beforeAll } from 'vitest'
import { SorobanResurrect } from '../../src/soroban-resurrect.js'
import { SorobanResurrectError } from '../../src/types.js'
import {
  VersionNegotiator,
  PROTOCOL_COMPATIBILITY_MATRIX,
  MIN_SUPPORTED_PROTOCOL,
  MAX_SUPPORTED_PROTOCOL,
} from '../../src/version-negotiator.js'
import { SorobanRpc } from '@stellar/stellar-sdk'

/**
 * Version-specific integration tests for Soroban RPC.
 *
 * These suites validate the SDK's behaviour against each supported protocol
 * version (20, 21, 22).  Point `SOROBAN_RPC_URL` at the target RPC endpoint.
 *
 * Currently supported RPC endpoints:
 *   - Testnet:  https://soroban-testnet.stellar.org        (protocol 22)
 *   - Futurenet: https://rpc-futurenet.stellar.org          (protocol 22)
 *   - Local:    http://localhost:8000/soroban/rpc           (varies)
 */

const RPC_URL = process.env.SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org'
const NETWORK_PASSPHRASE =
  process.env.SOROBAN_NETWORK_PASSPHRASE || 'Test SDF Network ; September 2015'
const RUN_VERSION_MATRIX = process.env.RUN_VERSION_MATRIX === 'true'

const itIf = RUN_VERSION_MATRIX ? it : it.skip

// ---------------------------------------------------------------------------
// Protocol discovery helper
// ---------------------------------------------------------------------------

async function detectProtocolVersion(
  server: SorobanRpc.Server,
): Promise<number | null> {
  try {
    const negotiator = new VersionNegotiator((l, m) => {
      if (l === 'error') console.error(`[VersionNegotiator] ${m}`)
    })
    const info = await negotiator.negotiate(server)
    return info.protocolVersion
  } catch {
    // Older nodes may not expose getVersionInfo
    return null
  }
}

// ---------------------------------------------------------------------------
// Protocol compatibility table tests
// ---------------------------------------------------------------------------

describe('Protocol Compatibility Matrix', () => {
  it('MIN_SUPPORTED_PROTOCOL is 20', () => {
    expect(MIN_SUPPORTED_PROTOCOL).toBe(20)
  })

  it('MAX_SUPPORTED_PROTOCOL is 22', () => {
    expect(MAX_SUPPORTED_PROTOCOL).toBe(22)
  })

  it('supports protocols 20, 21, and 22', () => {
    for (const version of [20, 21, 22]) {
      expect(PROTOCOL_COMPATIBILITY_MATRIX[version]).toBeDefined()
      expect(PROTOCOL_COMPATIBILITY_MATRIX[version].supported).toBe(true)
    }
  })

  it('protocol 20 uses v20 XDR variant', () => {
    expect(PROTOCOL_COMPATIBILITY_MATRIX[20].xdrVariant).toBe('v20')
  })

  it('protocol 21 uses v21 XDR variant', () => {
    expect(PROTOCOL_COMPATIBILITY_MATRIX[21].xdrVariant).toBe('v21')
  })

  it('protocol 22 uses v22 XDR variant', () => {
    expect(PROTOCOL_COMPATIBILITY_MATRIX[22].xdrVariant).toBe('v22')
  })
})

// ---------------------------------------------------------------------------
// VersionNegotiator unit tests
// ---------------------------------------------------------------------------

describe('VersionNegotiator', () => {
  it('returns protocol 20 when getVersionInfo is unavailable', async () => {
    const negotiator = new VersionNegotiator(() => {})
    const mockServer = { getHealth: () => Promise.resolve({}) } as unknown as SorobanRpc.Server

    const info = await negotiator.negotiate(mockServer)
    expect(info.protocolVersion).toBe(20)
    expect(info.supported).toBe(true)
  })

  it('extracts protocolVersion from a valid response object', async () => {
    const negotiator = new VersionNegotiator(() => {})
    const mockServer = {
      getVersionInfo: () =>
        Promise.resolve({
          protocolVersion: 22,
          coreVersion: 'stellar-core 21.0.0',
        }),
      getHealth: () => Promise.resolve({}),
    } as unknown as SorobanRpc.Server

    const info = await negotiator.negotiate(mockServer)
    expect(info.protocolVersion).toBe(22)
    expect(info.coreVersion).toBe('stellar-core 21.0.0')
  })

  it('rejects unsupported protocols below MIN', async () => {
    const negotiator = new VersionNegotiator(() => {})
    const mockServer = {
      getVersionInfo: () => Promise.resolve({ protocolVersion: 19 }),
      getHealth: () => Promise.resolve({}),
    } as unknown as SorobanRpc.Server

    await expect(negotiator.negotiate(mockServer)).rejects.toThrow(
      'Unsupported Soroban protocol version',
    )
  })

  it('adapts XDR encoding for v20', () => {
    const negotiator = new VersionNegotiator(() => {})
    const opts = negotiator.adaptXdrEncoding('v20')
    expect(opts.protocolVersion).toBe(20)
    expect(opts.useBase64).toBe(true)
    expect(opts.strictMode).toBe(true)
  })

  it('adapts XDR encoding for v22 (non-strict)', () => {
    const negotiator = new VersionNegotiator(() => {})
    const opts = negotiator.adaptXdrEncoding('v22')
    expect(opts.protocolVersion).toBe(22)
    expect(opts.useBase64).toBe(true)
    expect(opts.strictMode).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// RPC connectivity tests (runtime-conditional)
// ---------------------------------------------------------------------------

describe('SDK ↔ RPC connectivity', () => {
  let client: SorobanResurrect
  let protocolVersion: number | null

  beforeAll(async () => {
    client = new SorobanResurrect({
      rpcUrl: RPC_URL,
      networkPassphrase: NETWORK_PASSPHRASE,
      allowHttp: true,
    })

    const server = client.getRpcServer()
    protocolVersion = await detectProtocolVersion(server)
    console.log(`Detected RPC protocol version: ${protocolVersion ?? 'unknown'}`)
  })

  itIf('connects to the RPC endpoint and returns health status', async () => {
    const server = client.getRpcServer()
    const health = await server.getHealth()
    expect(health).toBeDefined()
  })

  itIf('getNetwork returns expected passphrase', async () => {
    const server = client.getRpcServer()
    const network = await server.getNetwork()
    expect(network.passphrase).toBe(NETWORK_PASSPHRASE)
  })

  itIf('getLatestLedger returns a valid ledger sequence', async () => {
    const server = client.getRpcServer()
    const ledger = await server.getLatestLedger()
    expect(ledger.sequence).toBeGreaterThan(0)
  })

  itIf('simulation rejects invalid XDR', async () => {
    await expect(client.simulate('invalid-xdr')).rejects.toThrow(
      SorobanResurrectError,
    )
  })
})

// ---------------------------------------------------------------------------
// Protocol 20 specific tests
// ---------------------------------------------------------------------------

describe('Protocol 20 specific', () => {
  itIf(
    'VersionNegotiator handles legacy nodes missing getVersionInfo gracefully',
    async () => {
      const negotiator = new VersionNegotiator(() => {})
      const mockServer = {} as unknown as SorobanRpc.Server

      const info = await negotiator.negotiate(mockServer)
      expect(info.protocolVersion).toBe(20)
      expect(info.supported).toBe(true)
    },
  )

  itIf('XDR encoding options for v20 use strict mode', () => {
    const negotiator = new VersionNegotiator(() => {})
    const opts = negotiator.adaptXdrEncoding('v20')
    expect(opts.strictMode).toBe(true)
    expect(opts.useBase64).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Protocol 21 specific tests
// ---------------------------------------------------------------------------

describe('Protocol 21 specific', () => {
  itIf('XDR encoding options for v21 use strict mode', () => {
    const negotiator = new VersionNegotiator(() => {})
    const opts = negotiator.adaptXdrEncoding('v21')
    expect(opts.strictMode).toBe(true)
    expect(opts.useBase64).toBe(true)
    expect(opts.protocolVersion).toBe(21)
  })

  itIf('COMPATIBILITY_MATRIX entry for protocol 21 exists', () => {
    const entry = PROTOCOL_COMPATIBILITY_MATRIX[21]
    expect(entry.xdrVariant).toBe('v21')
    expect(entry.supported).toBe(true)
    expect(entry.notes).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// Protocol 22 specific tests
// ---------------------------------------------------------------------------

describe('Protocol 22 specific', () => {
  itIf('XDR encoding options for v22 are non-strict', () => {
    const negotiator = new VersionNegotiator(() => {})
    const opts = negotiator.adaptXdrEncoding('v22')
    expect(opts.strictMode).toBe(false)
    expect(opts.protocolVersion).toBe(22)
  })

  itIf('COMPATIBILITY_MATRIX entry for protocol 22 is current mainnet', () => {
    const entry = PROTOCOL_COMPATIBILITY_MATRIX[22]
    expect(entry.notes).toContain('mainnet')
  })

  itIf('protocol version from RPC falls within supported range', async () => {
    const client = new SorobanResurrect({
      rpcUrl: RPC_URL,
      networkPassphrase: NETWORK_PASSPHRASE,
      allowHttp: true,
    })
    const server = client.getRpcServer()
    const version = await detectProtocolVersion(server)

    if (version !== null) {
      expect(version).toBeGreaterThanOrEqual(MIN_SUPPORTED_PROTOCOL)
      expect(version).toBeLessThanOrEqual(MAX_SUPPORTED_PROTOCOL)
    }
  })
})

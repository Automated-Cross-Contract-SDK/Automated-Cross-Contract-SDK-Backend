/**
 * Issue #495 — tested Stellar Core / Soroban RPC compatibility matrix.
 *
 * Pins the supported protocol range and the behaviour of `VersionNegotiator`
 * at each boundary: supported, below minimum, above maximum, per-network
 * minimum overrides, and older nodes without `getVersionInfo`.
 */
import { describe, it, expect, vi } from 'vitest'
import type { SorobanRpc } from '@stellar/stellar-sdk'
import {
  PROTOCOL_COMPATIBILITY_MATRIX,
  MIN_SUPPORTED_PROTOCOL,
  MAX_SUPPORTED_PROTOCOL,
  MIN_PROTOCOL_PER_NETWORK,
  VersionNegotiator,
} from '../src/version-negotiator.js'

function fakeServer(protocolVersion: number): SorobanRpc.Server {
  return {
    getVersionInfo: vi.fn().mockResolvedValue({ protocolVersion, version: `21.0.0-${protocolVersion}` }),
  } as unknown as SorobanRpc.Server
}

function negotiatorFor(networkId?: string, minProtocolPerNetwork?: Record<string, number>) {
  const onLog = vi.fn()
  return { negotiator: new VersionNegotiator(onLog, networkId, minProtocolPerNetwork), onLog }
}

describe('protocol compatibility matrix (issue #495)', () => {
  describe('matrix definition', () => {
    const versions = Object.keys(PROTOCOL_COMPATIBILITY_MATRIX).map(Number).sort((a, b) => a - b)

    it('covers a contiguous protocol range from MIN to MAX', () => {
      expect(MIN_SUPPORTED_PROTOCOL).toBe(versions[0])
      expect(MAX_SUPPORTED_PROTOCOL).toBe(versions[versions.length - 1])
      expect(versions).toEqual(
        Array.from({ length: MAX_SUPPORTED_PROTOCOL - MIN_SUPPORTED_PROTOCOL + 1 }, (_, i) => MIN_SUPPORTED_PROTOCOL + i),
      )
    })

    it('maps each protocol version to the matching XDR variant', () => {
      for (const version of versions) {
        expect(PROTOCOL_COMPATIBILITY_MATRIX[version].xdrVariant).toBe(`v${version}`)
      }
    })

    it('marks every listed protocol version as supported and documented', () => {
      for (const version of versions) {
        expect(PROTOCOL_COMPATIBILITY_MATRIX[version].supported).toBe(true)
        expect(PROTOCOL_COMPATIBILITY_MATRIX[version].notes?.length ?? 0).toBeGreaterThan(0)
      }
    })

    it('has no per-network minimum overrides by default', () => {
      expect(MIN_PROTOCOL_PER_NETWORK).toEqual({})
    })
  })

  describe('VersionNegotiator', () => {
    it('reports no version info before negotiation', () => {
      const { negotiator } = negotiatorFor()
      expect(negotiator.getVersionInfo()).toBeNull()
    })

    it.each(Object.keys(PROTOCOL_COMPATIBILITY_MATRIX).map(Number))(
      'negotiates protocol %i as supported with its matrix XDR variant',
      async version => {
        const { negotiator } = negotiatorFor()
        const info = await negotiator.negotiate(fakeServer(version))

        expect(info.protocolVersion).toBe(version)
        expect(info.supported).toBe(true)
        expect(info.xdrVariant).toBe(`v${version}`)
        expect(negotiator.getVersionInfo()).toEqual(info)
      },
    )

    it('rejects a protocol below the global minimum with UNSUPPORTED_PROTOCOL', async () => {
      const { negotiator, onLog } = negotiatorFor()
      const below = MIN_SUPPORTED_PROTOCOL - 1

      await expect(negotiator.negotiate(fakeServer(below))).rejects.toMatchObject({
        code: 'UNSUPPORTED_PROTOCOL',
      })
      expect(onLog).toHaveBeenCalledWith('error', expect.stringContaining(`${below}`), expect.anything())
    })

    it('accepts a protocol above the maximum but flags it as unsupported', async () => {
      const { negotiator, onLog } = negotiatorFor()
      const above = MAX_SUPPORTED_PROTOCOL + 1

      const info = await negotiator.negotiate(fakeServer(above))

      expect(info.protocolVersion).toBe(above)
      expect(info.supported).toBe(false)
      expect(info.xdrVariant).toBe('unknown')
      expect(onLog).toHaveBeenCalledWith('warn', expect.stringContaining('newer than max tested'), expect.anything())
    })

    it('applies a per-network minimum override', async () => {
      const { negotiator } = negotiatorFor('testnet', { testnet: MIN_SUPPORTED_PROTOCOL + 1 })

      await expect(negotiator.negotiate(fakeServer(MIN_SUPPORTED_PROTOCOL))).rejects.toMatchObject({
        code: 'UNSUPPORTED_PROTOCOL',
      })
    })

    it('falls back to the minimum protocol when the server lacks getVersionInfo', async () => {
      const { negotiator } = negotiatorFor()
      const legacyServer = {} as SorobanRpc.Server

      const info = await negotiator.negotiate(legacyServer)

      expect(info.protocolVersion).toBe(MIN_SUPPORTED_PROTOCOL)
      expect(info.supported).toBe(true)
      expect(info.xdrVariant).toBe(`v${MIN_SUPPORTED_PROTOCOL}`)
    })
  })

  describe('adaptXdrEncoding', () => {
    it.each(Object.keys(PROTOCOL_COMPATIBILITY_MATRIX).map(Number))(
      'returns base64 encoding pinned to protocol %i for its variant',
      version => {
        const { negotiator } = negotiatorFor()
        const options = negotiator.adaptXdrEncoding(`v${version}` as 'v20' | 'v21' | 'v22')

        expect(options.useBase64).toBe(true)
        expect(options.protocolVersion).toBe(version)
      },
    )

    it('falls back to conservative defaults for an unknown variant', () => {
      const { negotiator } = negotiatorFor()
      expect(negotiator.adaptXdrEncoding('unknown')).toEqual({
        useBase64: true,
        strictMode: true,
        protocolVersion: MIN_SUPPORTED_PROTOCOL,
      })
    })
  })
})

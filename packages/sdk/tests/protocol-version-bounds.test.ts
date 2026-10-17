import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  VersionNegotiator,
  MIN_SUPPORTED_PROTOCOL,
  MAX_SUPPORTED_PROTOCOL,
  PROTOCOL_COMPATIBILITY_MATRIX,
} from '../src/version-negotiator.js'

const DOC_PATH = fileURLToPath(new URL('../../../docs/protocol-versions.md', import.meta.url))
const doc = readFileSync(DOC_PATH, 'utf8')

const serverReporting = (protocolVersion: number) =>
  ({ getVersionInfo: async () => ({ protocolVersion }) }) as any

describe('protocol version bounds documentation', () => {
  it('documents the minimum and maximum constants', () => {
    expect(doc).toContain(`\`MIN_SUPPORTED_PROTOCOL\` | ${MIN_SUPPORTED_PROTOCOL} `)
    expect(doc).toContain(`\`MAX_SUPPORTED_PROTOCOL\` | ${MAX_SUPPORTED_PROTOCOL} `)
  })

  it('lists every protocol in the supported range in the compatibility matrix', () => {
    for (let v = MIN_SUPPORTED_PROTOCOL; v <= MAX_SUPPORTED_PROTOCOL; v++) {
      const entry = PROTOCOL_COMPATIBILITY_MATRIX[v]
      expect(entry, `matrix entry for protocol ${v}`).toBeDefined()
      expect(entry.supported).toBe(true)
      expect(doc).toMatch(new RegExp(`^\\| ${v}\\s+\\| ${entry.xdrVariant}\\s+\\|`, 'm'))
    }
  })
})

describe('protocol version bounds behavior', () => {
  it('rejects a node below the minimum with UNSUPPORTED_PROTOCOL', async () => {
    const negotiator = new VersionNegotiator(vi.fn())
    const below = MIN_SUPPORTED_PROTOCOL - 1

    await expect(negotiator.negotiate(serverReporting(below))).rejects.toMatchObject({
      code: 'UNSUPPORTED_PROTOCOL',
      message: expect.stringContaining(`Unsupported Soroban protocol version ${below}`),
    })
  })

  it('accepts a node exactly at the minimum', async () => {
    const negotiator = new VersionNegotiator(vi.fn())
    const info = await negotiator.negotiate(serverReporting(MIN_SUPPORTED_PROTOCOL))
    expect(info.protocolVersion).toBe(MIN_SUPPORTED_PROTOCOL)
    expect(info.supported).toBe(true)
  })

  it('accepts a node at the maximum without a newer-than-tested warning', async () => {
    const onLog = vi.fn()
    const info = await new VersionNegotiator(onLog).negotiate(serverReporting(MAX_SUPPORTED_PROTOCOL))

    expect(info.protocolVersion).toBe(MAX_SUPPORTED_PROTOCOL)
    expect(onLog).not.toHaveBeenCalledWith('warn', expect.stringContaining('newer than max tested'), expect.anything())
  })

  it('accepts a node above the maximum but warns that behavior may vary', async () => {
    const onLog = vi.fn()
    const above = MAX_SUPPORTED_PROTOCOL + 1
    const info = await new VersionNegotiator(onLog).negotiate(serverReporting(above))

    expect(info.protocolVersion).toBe(above)
    expect(onLog).toHaveBeenCalledWith(
      'warn',
      expect.stringContaining(`newer than max tested (${MAX_SUPPORTED_PROTOCOL})`),
      { protocolVersion: above },
    )
  })

  it('applies a per-network minimum that is stricter than the global one', async () => {
    const negotiator = new VersionNegotiator(vi.fn(), 'testnet', { testnet: MIN_SUPPORTED_PROTOCOL + 1 })

    await expect(negotiator.negotiate(serverReporting(MIN_SUPPORTED_PROTOCOL))).rejects.toMatchObject({
      code: 'UNSUPPORTED_PROTOCOL',
    })
  })
})

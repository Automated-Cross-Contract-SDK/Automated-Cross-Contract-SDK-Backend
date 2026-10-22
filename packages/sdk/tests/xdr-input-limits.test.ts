import { describe, it, expect } from 'vitest'
import {
  extractFootprintFromTransaction,
  extractFootprintFromTransactionStreaming,
  STREAMING_THRESHOLD_BYTES,
} from '../src/footprint-parser.js'

const NETWORK_PASSPHRASE = 'Test SDF Network ; September 2015'

describe('XDR input limits before decoding (#533)', () => {
  it('uses a 1 MB threshold to switch to the streaming parser', () => {
    expect(STREAMING_THRESHOLD_BYTES).toBe(1024 * 1024)
  })

  it('returns null instead of throwing for oversized non-XDR payloads', () => {
    const oversized = Buffer.alloc(STREAMING_THRESHOLD_BYTES * 2 + 1).toString('base64')

    expect(() => extractFootprintFromTransactionStreaming(oversized)).not.toThrow()
    expect(extractFootprintFromTransactionStreaming(oversized)).toBeNull()
  })

  it('returns null for oversized payloads in the full-object parser', () => {
    const oversized = Buffer.alloc(STREAMING_THRESHOLD_BYTES * 2 + 1).toString('base64')

    expect(extractFootprintFromTransaction(oversized, NETWORK_PASSPHRASE)).toBeNull()
  })

  it('returns null for empty input in both parsers', () => {
    expect(extractFootprintFromTransactionStreaming('')).toBeNull()
    expect(extractFootprintFromTransaction('', NETWORK_PASSPHRASE)).toBeNull()
  })

  it('returns null for truncated XDR rather than returning partial footprints', () => {
    // A valid-looking base64 prefix of an envelope cut off mid-structure.
    const truncated = Buffer.from([0, 0, 0, 2, 0, 0, 0, 0, 0, 0]).toString('base64')

    expect(extractFootprintFromTransactionStreaming(truncated)).toBeNull()
  })

  it('does not decode bytes after a malformed union discriminant', () => {
    // Discriminant 99 is not a valid TransactionEnvelope arm.
    const invalidArm = Buffer.from([0, 0, 0, 99, 1, 2, 3, 4]).toString('base64')

    expect(extractFootprintFromTransactionStreaming(invalidArm)).toBeNull()
  })
})

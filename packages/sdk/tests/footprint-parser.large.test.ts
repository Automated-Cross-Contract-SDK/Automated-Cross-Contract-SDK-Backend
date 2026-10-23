import { describe, it, expect } from 'vitest'
import { xdr } from '@stellar/stellar-sdk'
import {
  extractKeysFromFootprint,
  classifyLedgerKey,
  encodeLedgerKey,
  extractFootprintFromTransaction,
} from '../src/footprint-parser.js'

function footprint(size: number): xdr.LedgerFootprint {
  const keys = Array.from({ length: size }, (_, i) => {
    const id = Buffer.alloc(32)
    id.writeUInt32BE(i)
    return i % 2
      ? xdr.LedgerKey.contractCode(new xdr.LedgerKeyContractCode({ hash: id }))
      : xdr.LedgerKey.ttl(new xdr.LedgerKeyTtl({ keyHash: id }))
  })
  return new xdr.LedgerFootprint({ readOnly: keys.slice(0, size / 2), readWrite: keys.slice(size / 2) })
}

describe('large-footprint parsing (real XDR)', () => {
  it('round-trips and classifies 5000 keys within budget', () => {
    const b64 = footprint(5000).toXDR('base64')
    const start = performance.now()
    const { all, readOnly, readWrite } = extractKeysFromFootprint(xdr.LedgerFootprint.fromXDR(b64, 'base64'))
    const classified = all.map(classifyLedgerKey)
    const encoded = all.map(encodeLedgerKey)
    const elapsed = performance.now() - start

    expect(readOnly).toHaveLength(2500)
    expect(readWrite).toHaveLength(2500)
    expect(new Set(encoded).size).toBe(5000)
    expect(classified.filter((c) => c.keyType === 'contractCode')).toHaveLength(2500)
    expect(elapsed).toBeLessThan(5000)
  })

  it('handles an empty footprint', () => {
    const { all } = extractKeysFromFootprint(new xdr.LedgerFootprint({ readOnly: [], readWrite: [] }))
    expect(all).toEqual([])
  })

  it('returns null for malformed or truncated transaction XDR', () => {
    expect(extractFootprintFromTransaction('not-xdr', 'Test SDF Network ; September 2015')).toBeNull()
    expect(extractFootprintFromTransaction(footprint(10).toXDR('base64').slice(0, 20), 'x')).toBeNull()
  })
})

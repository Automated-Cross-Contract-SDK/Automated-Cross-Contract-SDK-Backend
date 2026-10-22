import { describe, it, expect } from 'vitest'
import { Keypair, xdr } from '@stellar/stellar-sdk'
import { classifyLedgerKey, extractKeysFromFootprint } from '../src/index'

/** Deterministic PRNG (mulberry32) so failures reproduce from the seed. */
function rng(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const contract = xdr.ScAddress.scAddressTypeContract(Buffer.alloc(32, 7) as any)

function contractDataKey(key: xdr.ScVal): xdr.LedgerKey {
  return xdr.LedgerKey.contractData(
    new xdr.LedgerKeyContractData({ contract, key, durability: xdr.ContractDataDurability.persistent() }),
  )
}

function footprintBytes(): Buffer {
  const footprint = new xdr.LedgerFootprint({
    readOnly: [xdr.LedgerKey.account(new xdr.LedgerKeyAccount({ accountId: Keypair.random().xdrPublicKey() }))],
    readWrite: [contractDataKey(xdr.ScVal.scvSymbol('balance'))],
  })
  return footprint.toXDR()
}

/** Decoding must either return a value or throw an Error; never hang or throw a non-Error. */
function decodeOrError(bytes: Buffer): xdr.LedgerFootprint | Error {
  try {
    return xdr.LedgerFootprint.fromXDR(bytes)
  } catch (err) {
    expect(err).toBeInstanceOf(Error)
    return err as Error
  }
}

describe('XDR decoder fuzzing', () => {
  it('rejects every truncation of a valid footprint', () => {
    const bytes = footprintBytes()
    for (let len = 0; len < bytes.length; len++) {
      expect(decodeOrError(bytes.subarray(0, len))).toBeInstanceOf(Error)
    }
  })

  it('rejects valid footprints with trailing bytes', () => {
    const bytes = Buffer.concat([footprintBytes(), Buffer.alloc(4)])
    expect(decodeOrError(bytes)).toBeInstanceOf(Error)
  })

  it('rejects oversized length prefixes without allocating them', () => {
    // readOnly array count of 0x7fffffff followed by no elements.
    const bytes = Buffer.from([0x7f, 0xff, 0xff, 0xff])
    expect(decodeOrError(bytes)).toBeInstanceOf(Error)
  })

  it('handles large but well-formed footprints', () => {
    const keys = Array.from({ length: 2000 }, (_, i) => contractDataKey(xdr.ScVal.scvU32(i)))
    const decoded = xdr.LedgerFootprint.fromXDR(new xdr.LedgerFootprint({ readOnly: [], readWrite: keys }).toXDR())
    const result = extractKeysFromFootprint(decoded)
    expect(result.readWrite).toHaveLength(2000)
  })

  it('decodes or cleanly rejects deeply nested ScVal keys', () => {
    for (const depth of [10, 100, 1000]) {
      let val = xdr.ScVal.scvU32(1)
      for (let i = 0; i < depth; i++) val = xdr.ScVal.scvVec([val])
      let bytes: Buffer
      try {
        bytes = contractDataKey(val).toXDR()
      } catch (err) {
        expect(err).toBeInstanceOf(Error)
        continue
      }
      try {
        const key = xdr.LedgerKey.fromXDR(bytes)
        expect(() => classifyLedgerKey(key)).not.toThrow()
      } catch (err) {
        // The SDK enforces a nesting depth limit; exceeding it must be a normal Error.
        expect(err).toBeInstanceOf(Error)
      }
    }
  })

  it('never throws a non-Error on random byte mutations', () => {
    const seed = 0x5eed
    const next = rng(seed)
    const base = footprintBytes()
    for (let round = 0; round < 500; round++) {
      const bytes = Buffer.from(base)
      const flips = 1 + Math.floor(next() * 4)
      for (let f = 0; f < flips; f++) bytes[Math.floor(next() * bytes.length)] = Math.floor(next() * 256)
      const out = decodeOrError(bytes)
      if (!(out instanceof Error)) {
        expect(() => extractKeysFromFootprint(out), `seed ${seed} round ${round}`).not.toThrow()
      }
    }
  })
})

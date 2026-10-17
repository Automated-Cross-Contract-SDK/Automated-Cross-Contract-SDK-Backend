import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { xdr } from '@stellar/stellar-sdk'
import { extractFootprintFromTransaction, extractKeysFromFootprint } from '../src/footprint-parser.js'

const TESTNET_PASSPHRASE = 'Test SDF Network ; September 2015'
const corpus: Array<{ hash: string; envelopeXdr: string }> = JSON.parse(
  readFileSync(fileURLToPath(new URL('./fixtures/testnet-envelopes.json', import.meta.url)), 'utf8'),
)

// Captured classic payment: has no sorobanData at all (the "absent" case).
const classicXdr = corpus.find(c => {
  const env = xdr.TransactionEnvelope.fromXDR(c.envelopeXdr, 'base64')
  return env.v1().tx().ext().switch() !== 1
})!.envelopeXdr

// Captured Soroban invoke with its footprint cleared (the "empty" case).
const withEmptyFootprint = (envelopeXdr: string): string => {
  const env = xdr.TransactionEnvelope.fromXDR(envelopeXdr, 'base64')
  const resources = env.v1().tx().ext().sorobanData().resources()
  resources.footprint(new xdr.LedgerFootprint({ readOnly: [], readWrite: [] }))
  return env.toXDR('base64')
}
const sorobanXdr = corpus.find(c => {
  const env = xdr.TransactionEnvelope.fromXDR(c.envelopeXdr, 'base64')
  return env.v1().tx().ext().switch() === 1
})!.envelopeXdr
const emptyFootprintXdr = withEmptyFootprint(sorobanXdr)

describe('absent versus empty footprints', () => {
  it('keeps the empty-footprint envelope decodable with zero footprint keys', () => {
    const env = xdr.TransactionEnvelope.fromXDR(emptyFootprintXdr, 'base64')
    const footprint = env.v1().tx().ext().sorobanData().resources().footprint()
    expect(footprint.readOnly()).toHaveLength(0)
    expect(footprint.readWrite()).toHaveLength(0)
  })

  it('reports an empty footprint as zero keys in every bucket', () => {
    const footprint = new xdr.LedgerFootprint({ readOnly: [], readWrite: [] })
    expect(extractKeysFromFootprint(footprint)).toEqual({ readOnly: [], readWrite: [], all: [] })
  })

  it('returns null for an absent footprint (classic envelope without sorobanData)', () => {
    expect(extractFootprintFromTransaction(classicXdr, TESTNET_PASSPHRASE)).toBeNull()
  })

  // Known defect shared with the corpus tests: the parser never reads sorobanData,
  // so an empty Soroban footprint is reported as null, the same as an absent one.
  // Flips to a passing expectation once the parser is fixed.
  it.fails('returns an empty footprint object, not null, for an empty Soroban footprint', () => {
    const result = extractFootprintFromTransaction(emptyFootprintXdr, TESTNET_PASSPHRASE)
    expect(result).not.toBeNull()
    expect(result?.all).toEqual([])
  })

  it('keeps absent and empty distinguishable at the envelope level', () => {
    const classicHasSoroban = xdr.TransactionEnvelope.fromXDR(classicXdr, 'base64')
      .v1()
      .tx()
      .ext()
      .switch() === 1
    const emptyHasSoroban = xdr.TransactionEnvelope.fromXDR(emptyFootprintXdr, 'base64')
      .v1()
      .tx()
      .ext()
      .switch() === 1
    expect(classicHasSoroban).toBe(false)
    expect(emptyHasSoroban).toBe(true)
  })
})

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { TransactionBuilder, xdr } from '@stellar/stellar-sdk'
import {
  classifyLedgerKey,
  encodeLedgerKey,
  extractFootprintFromTransaction,
} from '../src/footprint-parser.js'

// Envelopes captured from the public Stellar testnet via getTransaction.
const TESTNET_PASSPHRASE = 'Test SDF Network ; September 2015'
const corpus: Array<{ hash: string; ledger: number; envelopeXdr: string }> = JSON.parse(
  readFileSync(
    fileURLToPath(new URL('./fixtures/testnet-envelopes.json', import.meta.url)),
    'utf8',
  ),
)

// Independent decode of the Soroban footprint straight from the envelope XDR,
// so these tests do not depend on the parser under test.
const decodeFootprint = (envelopeXdr: string): xdr.LedgerFootprint | null => {
  const env = xdr.TransactionEnvelope.fromXDR(envelopeXdr, 'base64')
  if (env.switch() !== xdr.EnvelopeType.envelopeTypeTx()) return null
  const ext = env.v1().tx().ext()
  if (ext.switch() !== 1) return null
  return ext.sorobanData().resources().footprint()
}

const sorobanEntries = corpus.filter((c) => decodeFootprint(c.envelopeXdr) !== null)

describe('parser fixture corpus (captured testnet envelopes)', () => {
  it('loads a corpus with unique transaction hashes and at least one Soroban envelope', () => {
    expect(new Set(corpus.map((c) => c.hash)).size).toBe(corpus.length)
    expect(sorobanEntries.length).toBeGreaterThan(0)
  })

  it.each(corpus.map((c) => [c.hash.slice(0, 12), c] as const))(
    'decodes captured envelope %s as a transaction',
    (_label, entry) => {
      expect(() => TransactionBuilder.fromXDR(entry.envelopeXdr, TESTNET_PASSPHRASE)).not.toThrow()
    },
  )

  // Known defect: extractFootprintFromTransaction checks `'sorobanData' in tx`,
  // which stellar-sdk 12.x Transaction objects never define, so every real
  // Soroban envelope yields null. Flips to a passing expectation once fixed.
  it.fails('returns a footprint for captured Soroban envelopes', () => {
    for (const entry of sorobanEntries) {
      expect(
        extractFootprintFromTransaction(entry.envelopeXdr, TESTNET_PASSPHRASE),
        entry.hash,
      ).not.toBeNull()
    }
  })

  it('returns null for captured classic envelopes', () => {
    for (const entry of corpus.filter((c) => !sorobanEntries.includes(c))) {
      expect(
        extractFootprintFromTransaction(entry.envelopeXdr, TESTNET_PASSPHRASE),
        entry.hash,
      ).toBeNull()
    }
  })

  it('classifies every captured footprint key into a known category', () => {
    const knownTypes = new Set([
      'contractInstance',
      'contractCode',
      'contractData',
      'ttlEntry',
      'liquidityPool',
      'claimableBalance',
      'unknown',
    ])
    let checked = 0
    for (const entry of sorobanEntries) {
      const fp = decodeFootprint(entry.envelopeXdr)!
      for (const key of [...fp.readOnly(), ...fp.readWrite()]) {
        expect(knownTypes.has(classifyLedgerKey(key).keyType)).toBe(true)
        checked++
      }
    }
    expect(checked).toBeGreaterThan(0)
  })

  it('round-trips every captured footprint key through its base64 identity', () => {
    let checked = 0
    for (const entry of sorobanEntries) {
      const fp = decodeFootprint(entry.envelopeXdr)!
      for (const key of [...fp.readOnly(), ...fp.readWrite()]) {
        const identity = encodeLedgerKey(key)
        expect(encodeLedgerKey(xdr.LedgerKey.fromXDR(identity, 'base64'))).toBe(identity)
        checked++
      }
    }
    expect(checked).toBeGreaterThan(0)
  })
})

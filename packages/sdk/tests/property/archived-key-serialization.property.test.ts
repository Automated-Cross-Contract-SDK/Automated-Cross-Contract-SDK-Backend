/**
 * Issue #455 — `ArchivedKey` serialization contract.
 *
 * `keyBase64` is the canonical, JSON-safe representation of an archived key.
 * `key` (an `xdr.LedgerKey`) does not survive JSON transport. These property
 * tests use real stellar-sdk XDR (no mocks) to verify that for arbitrary
 * contract-data and contract-code keys:
 *   - `keyBase64` equals `key.toXDR('base64')`
 *   - decode → re-encode is the identity
 *   - classification is preserved across a JSON round trip
 */
import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { Address, xdr } from '@stellar/stellar-sdk'
import { classifyLedgerKey, encodeLedgerKey } from '../../src/footprint-parser.js'

const contractIdBytes = fc.uint8Array({ minLength: 32, maxLength: 32 })
const symbolKey = fc.stringMatching(/^[a-zA-Z0-9_]{1,30}$/)
const durability = fc.constantFrom('persistent', 'temporary') as fc.Arbitrary<'persistent' | 'temporary'>

const contractDataKey = fc
  .tuple(contractIdBytes, symbolKey, durability)
  .map(([id, symbol, dur]) =>
    xdr.LedgerKey.contractData(
      new xdr.LedgerKeyContractData({
        contract: Address.contract(Buffer.from(id)).toScAddress(),
        key: xdr.ScVal.scvSymbol(symbol),
        durability: dur === 'persistent'
          ? xdr.ContractDataDurability.persistent()
          : xdr.ContractDataDurability.temporary(),
      }),
    ),
  )

const contractCodeKey = contractIdBytes.map(hash =>
  xdr.LedgerKey.contractCode(new xdr.LedgerKeyContractCode({ hash: Buffer.from(hash) })),
)

const archivableKey = fc.oneof(contractDataKey, contractCodeKey)

describe('ArchivedKey keyBase64 serialization contract (issue #455)', () => {
  it('keyBase64 is exactly the base64 XDR of the key', () => {
    fc.assert(
      fc.property(archivableKey, key => {
        expect(encodeLedgerKey(key)).toBe(key.toXDR('base64'))
      }),
      { numRuns: 200 },
    )
  })

  it('decode then re-encode is the identity on keyBase64', () => {
    fc.assert(
      fc.property(archivableKey, key => {
        const encoded = encodeLedgerKey(key)
        const decoded = xdr.LedgerKey.fromXDR(encoded, 'base64')
        expect(encodeLedgerKey(decoded)).toBe(encoded)
      }),
      { numRuns: 200 },
    )
  })

  it('survives a JSON transport round trip and decodes to an equal key', () => {
    fc.assert(
      fc.property(archivableKey, key => {
        const wire = JSON.stringify({ keyBase64: encodeLedgerKey(key) })
        const { keyBase64 } = JSON.parse(wire) as { keyBase64: string }
        const decoded = xdr.LedgerKey.fromXDR(keyBase64, 'base64')
        expect(decoded.toXDR('base64')).toBe(key.toXDR('base64'))
      }),
      { numRuns: 200 },
    )
  })

  it('classification is preserved when the key is rebuilt from keyBase64', () => {
    fc.assert(
      fc.property(archivableKey, key => {
        const original = classifyLedgerKey(key)
        const rebuilt = classifyLedgerKey(xdr.LedgerKey.fromXDR(encodeLedgerKey(key), 'base64'))
        expect(rebuilt.keyType).toBe(original.keyType)
        expect(rebuilt.contractId).toBe(original.contractId)
      }),
      { numRuns: 200 },
    )
  })

  it('encoding is deterministic for the same key', () => {
    fc.assert(
      fc.property(archivableKey, key => {
        expect(encodeLedgerKey(key)).toBe(encodeLedgerKey(key))
      }),
      { numRuns: 100 },
    )
  })
})

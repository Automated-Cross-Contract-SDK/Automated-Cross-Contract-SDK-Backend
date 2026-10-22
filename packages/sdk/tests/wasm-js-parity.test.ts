import { describe, it, expect } from 'vitest'
import { xdr } from '@stellar/stellar-sdk'
import { classifyLedgerKey, encodeLedgerKey } from '../src/footprint-parser.js'
import {
  initWasm,
  classifyKey,
  classifyKeysBatch,
} from '../../footprint-parser-wasm/src/index.js'

// Differential fixtures: each entry pins the expected classification by hand,
// so the TypeScript and WASM parsers are both checked against the same spec
// rather than against whatever the other one happens to return.

const contractId = Buffer.alloc(32, 7)
const address = xdr.ScAddress.scAddressTypeContract(contractId)

const contractDataKey = (key: xdr.ScVal) =>
  xdr.LedgerKey.contractData(
    new xdr.LedgerKeyContractData({
      contract: address,
      key,
      durability: xdr.ContractDataDurability.persistent(),
    }),
  )

interface Fixture {
  name: string
  key: xdr.LedgerKey
  expected: {
    keyType: string
    restorePriority: number
    sacKeyType?: string
    contractId?: string
  }
}

const fixtures: Fixture[] = [
  {
    name: 'contract instance',
    key: contractDataKey(xdr.ScVal.scvLedgerKeyContractInstance()),
    expected: {
      keyType: 'contractInstance',
      restorePriority: 0,
      contractId: contractId.toString('hex'),
    },
  },
  {
    name: 'plain contract data',
    key: contractDataKey(xdr.ScVal.scvSymbol('counter')),
    expected: {
      keyType: 'contractData',
      restorePriority: 2,
      contractId: contractId.toString('hex'),
    },
  },
  {
    name: 'contract code',
    key: xdr.LedgerKey.contractCode(
      new xdr.LedgerKeyContractCode({ hash: Buffer.alloc(32, 3) }),
    ),
    expected: {
      keyType: 'contractCode',
      restorePriority: 1,
      contractId: Buffer.alloc(32, 3).toString('hex'),
    },
  },
  {
    name: 'unsupported account entry',
    key: xdr.LedgerKey.account(
      new xdr.LedgerKeyAccount({
        accountId: xdr.PublicKey.publicKeyTypeEd25519(Buffer.alloc(32, 5)),
      }),
    ),
    expected: { keyType: 'unknown', restorePriority: 3 },
  },
]

const keysBase64 = fixtures.map(f => encodeLedgerKey(f.key))

describe('TypeScript reference parser matches differential fixtures', () => {
  for (const fixture of fixtures) {
    it(`classifies ${fixture.name}`, () => {
      const result = classifyLedgerKey(fixture.key)

      expect(result.keyType).toBe(fixture.expected.keyType)
      expect(result.restorePriority).toBe(fixture.expected.restorePriority)
      expect(result.contractId).toBe(fixture.expected.contractId)
    })
  }
})

describe('WASM parser parity with fixtures', async () => {
  const wasmReady = await initWasm()

  it.skipIf(!wasmReady)('reports WASM as ready when the pkg build exists', () => {
    expect(wasmReady).toBe(true)
  })

  for (const fixture of fixtures) {
    it.skipIf(!wasmReady)(`matches the fixture for ${fixture.name}`, async () => {
      const result = await classifyKey(encodeLedgerKey(fixture.key))

      expect(result.keyType).toBe(fixture.expected.keyType)
      expect(result.restorePriority).toBe(fixture.expected.restorePriority)
      expect(result.contractId).toBe(fixture.expected.contractId)
    })
  }

  it.skipIf(!wasmReady)('batch classification matches per-key classification', async () => {
    const batch = await classifyKeysBatch(keysBase64)
    const single = await Promise.all(keysBase64.map(k => classifyKey(k)))

    expect(batch).toEqual(single)
  })
})

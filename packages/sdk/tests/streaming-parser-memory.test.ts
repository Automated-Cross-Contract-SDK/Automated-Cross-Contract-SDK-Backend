import { describe, it, expect } from 'vitest'
import v8 from 'node:v8'
import vm from 'node:vm'
import { xdr } from '@stellar/stellar-sdk'
import {
  extractFootprintFromTransactionStreaming,
  STREAMING_PARSER_MEMORY_TARGET,
} from '../src/footprint-parser.js'

// Expose a forced GC so heap measurements are not skewed by garbage from
// earlier iterations. Works inside vitest worker threads, unlike --expose-gc.
v8.setFlagsFromString('--expose-gc')
const forceGc = vm.runInNewContext('gc') as () => void

const NETWORK_PASSPHRASE = 'Test SDF Network ; September 2015'
const FOOTPRINT_KEYS = 2_000
const ITERATIONS = 25

function buildLargeFootprintTx(keyCount: number): string {
  const readOnly = Array.from({ length: keyCount }, (_, i) => {
    const id = Buffer.alloc(32)
    id.writeUInt32BE(i, 28)
    return xdr.LedgerKey.contractData(
      new xdr.LedgerKeyContractData({
        contract: xdr.ScAddress.scAddressTypeContract(id),
        key: xdr.ScVal.scvU32(i),
        durability: xdr.ContractDataDurability.persistent(),
      }),
    )
  })

  const sorobanData = new xdr.SorobanTransactionData({
    ext: new xdr.ExtensionPoint(0),
    resources: new xdr.SorobanResources({
      footprint: new xdr.LedgerFootprint({ readOnly, readWrite: [] }),
      instructions: 0,
      readBytes: 0,
      writeBytes: 0,
    }),
    resourceFee: xdr.Int64.fromString('0'),
  })

  const envelope = xdr.TransactionEnvelope.envelopeTypeTx(
    new xdr.TransactionV1Envelope({
      tx: new xdr.Transaction({
        sourceAccount: xdr.MuxedAccount.keyTypeEd25519(Buffer.alloc(32, 9)),
        fee: 100,
        seqNum: xdr.Int64.fromString('1'),
        cond: xdr.Preconditions.precondNone(),
        memo: xdr.Memo.memoNone(),
        operations: [],
        ext: new xdr.TransactionExt(1, sorobanData),
      }),
      signatures: [],
    }),
  )

  return envelope.toXDR('base64')
}

describe('streaming parser under repeated large-footprint workloads (#534)', () => {
  const txXdr = buildLargeFootprintTx(FOOTPRINT_KEYS)

  it('returns the complete footprint on every repeated parse', () => {
    for (let i = 0; i < ITERATIONS; i++) {
      const result = extractFootprintFromTransactionStreaming(txXdr)

      expect(result).not.toBeNull()
      expect(result!.readOnly).toHaveLength(FOOTPRINT_KEYS)
      expect(result!.readWrite).toHaveLength(0)
      expect(result!.all).toHaveLength(FOOTPRINT_KEYS)
    }
  })

  it('does not retain decoded state between parses', () => {
    const first = extractFootprintFromTransactionStreaming(txXdr)!
    const firstKeys = first.all.map(k => k.toXDR('base64'))

    for (let i = 0; i < ITERATIONS; i++) {
      extractFootprintFromTransactionStreaming(txXdr)
    }

    const again = extractFootprintFromTransactionStreaming(txXdr)!
    expect(again.all.map(k => k.toXDR('base64'))).toEqual(firstKeys)
  })

  it('keeps heap growth across repeated parses under the streaming memory target', () => {
    forceGc()
    const before = process.memoryUsage().heapUsed

    for (let i = 0; i < ITERATIONS; i++) {
      extractFootprintFromTransactionStreaming(txXdr)
    }

    forceGc()
    const growth = process.memoryUsage().heapUsed - before
    expect(growth).toBeLessThan(STREAMING_PARSER_MEMORY_TARGET)
  })
})

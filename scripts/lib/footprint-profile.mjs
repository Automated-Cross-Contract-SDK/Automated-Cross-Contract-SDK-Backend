// Runtime-agnostic footprint parsing profile (#602). Uses only `performance.now()`
// so the same module runs under Node and inside a browser bundle.
import { xdr, StrKey } from '@stellar/stellar-sdk'
import { extractKeysFromFootprint, classifyLedgerKey, encodeLedgerKey } from '@soroban-resurrect/sdk'

/** Build a base64 LedgerFootprint XDR with `size` real contract-data/code/ttl keys. */
export function buildFootprintXdr(size) {
  const keys = []
  for (let i = 0; i < size; i++) {
    const id = Buffer.alloc(32)
    id.writeUInt32BE(i)
    const kind = i % 3
    if (kind === 0) {
      keys.push(
        xdr.LedgerKey.contractData(
          new xdr.LedgerKeyContractData({
            contract: xdr.ScAddress.scAddressTypeContract(StrKey.decodeContract(StrKey.encodeContract(id))),
            key: xdr.ScVal.scvVec([xdr.ScVal.scvSymbol('Balance'), xdr.ScVal.scvU32(i)]),
            durability: xdr.ContractDataDurability.persistent(),
          }),
        ),
      )
    } else if (kind === 1) {
      keys.push(xdr.LedgerKey.contractCode(new xdr.LedgerKeyContractCode({ hash: id })))
    } else {
      keys.push(xdr.LedgerKey.ttl(new xdr.LedgerKeyTtl({ keyHash: id })))
    }
  }
  const half = Math.floor(keys.length / 2)
  return new xdr.LedgerFootprint({ readOnly: keys.slice(0, half), readWrite: keys.slice(half) }).toXDR('base64')
}

/** Decode → extract → classify → re-encode; returns median timings in ms. */
export function profileFootprint(sizes = [100, 1000, 5000], runs = 5) {
  return sizes.map((size) => {
    const b64 = buildFootprintXdr(size)
    const samples = { decode: [], extract: [], classify: [], encode: [] }
    for (let r = 0; r < runs; r++) {
      let t = performance.now()
      const fp = xdr.LedgerFootprint.fromXDR(b64, 'base64')
      samples.decode.push(performance.now() - t)
      t = performance.now()
      const { all } = extractKeysFromFootprint(fp)
      samples.extract.push(performance.now() - t)
      t = performance.now()
      all.forEach(classifyLedgerKey)
      samples.classify.push(performance.now() - t)
      t = performance.now()
      all.forEach(encodeLedgerKey)
      samples.encode.push(performance.now() - t)
    }
    const median = (a) => Number(a.sort((x, y) => x - y)[Math.floor(a.length / 2)].toFixed(2))
    return {
      keys: size,
      xdrBytes: b64.length,
      ...Object.fromEntries(Object.entries(samples).map(([k, v]) => [`${k}Ms`, median(v)])),
    }
  })
}

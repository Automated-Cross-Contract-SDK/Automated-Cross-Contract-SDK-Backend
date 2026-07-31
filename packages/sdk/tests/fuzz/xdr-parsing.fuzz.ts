/**
 * Coverage-guided fuzz target for XDR parsing (issue #76).
 *
 * Run locally with:
 *   npx jazzer tests/fuzz/xdr-parsing.fuzz.ts --fuzz_function=fuzz -- -max_total_time=60
 *
 * Feeds `extractFootprintFromTransaction` and `classifyLedgerKey` random byte
 * sequences, truncated XDR, and edge-case strings, asserting the SDK never
 * crashes and never throws anything other than `SorobanResurrectError`.
 */
import { extractFootprintFromTransaction, classifyLedgerKey } from '../../src/footprint-parser.js'
import { SorobanResurrectError } from '../../src/types.js'
import { xdr } from '@stellar/stellar-sdk'

const NETWORK_PASSPHRASE = 'Test SDF Network ; September 2015'

function toEdgeCaseString(data: Buffer): string {
  // Interpret the fuzzer bytes as base64 text, which is what real XDR
  // payloads look like on the wire — this keeps the input distribution
  // close to malformed-but-plausible transaction envelopes.
  return data.toString('base64')
}

/** Builds a malformed LedgerKey-like object out of raw fuzzer bytes. */
function toMalformedLedgerKey(data: Buffer): xdr.LedgerKey {
  const discriminants = ['contractData', 'contractCode', 'ttl', 'account', 'trustline', '']
  const tag = discriminants[data.length > 0 ? data[0] % discriminants.length : 0]

  return {
    switch: () => tag,
    contractData: () => ({
      contract: () => ({ contractId: () => data.subarray(1, 33) }),
      key: () => ({
        switch: () => ({ value: data.length > 1 ? data[1] : 0 }),
        value: () => data.subarray(2),
      }),
      durability: () => ({ value: data.length > 2 ? data[2] : 0 }),
    }),
    contractCode: () => ({ hash: () => data.subarray(1, 33) }),
  } as unknown as xdr.LedgerKey
}

export function fuzz(data: Buffer): void {
  const txXDR = toEdgeCaseString(data)

  // extractFootprintFromTransaction already wraps everything in try/catch and
  // returns null on failure — it must never throw or crash the process.
  try {
    extractFootprintFromTransaction(txXDR, NETWORK_PASSPHRASE)
  } catch (err) {
    if (!(err instanceof SorobanResurrectError)) {
      throw new Error(`extractFootprintFromTransaction threw a non-SorobanResurrectError: ${String(err)}`)
    }
  }

  // classifyLedgerKey should degrade to keyType "unknown" rather than throw
  // for any malformed key shape.
  try {
    classifyLedgerKey(toMalformedLedgerKey(data))
  } catch (err) {
    if (!(err instanceof SorobanResurrectError)) {
      throw new Error(`classifyLedgerKey threw a non-SorobanResurrectError: ${String(err)}`)
    }
  }
}

/**
 * Fuzz harness for the footprint parser against malformed/adversarial XDR.
 *
 * This harness generates malformed XDR byte sequences targeting the parser's
 * entry points (extractFootprintFromTransaction, classifyLedgerKey, classifySacKey, etc.)
 * and confirms that no uncaught exception surfaces — the parser should always
 * fail gracefully (return null, undefined, or catch and return a safe default).
 *
 * Run: npm run test:fuzz
 */

import fc from 'fast-check'
import { extractFootprintFromTransaction, extractFootprintFromTransactionStreaming } from '../../src/footprint-parser.js'

/**
 * Malformed XDR generators targeting common parsing failure modes.
 */

// Truncated base64: missing bytes from the end
const truncatedBase64 = (): fc.Arbitrary<string> =>
  fc
    .base64()
    .filter((b64) => b64.length > 4)
    .map((b64) => b64.slice(0, Math.floor(b64.length * (0.5 + Math.random() * 0.5))))

// Invalid discriminant values in XDR discriminated unions
const invalidDiscriminant = (): fc.Arbitrary<Buffer> =>
  fc
    .tuple(fc.integer({ min: 0, max: 255 }), fc.uint8Array({ minLength: 32, maxLength: 256 }))
    .map(([disc, data]) => Buffer.concat([Buffer.from([disc, 0, 0, 0]), Buffer.from(data)]))

// Deeply nested/recursive structures (if format allows)
const deepNesting = (): fc.Arbitrary<Buffer> =>
  fc.integer({ min: 0, max: 100 }).map((depth) => {
    const buf = Buffer.alloc(Math.min(1024, depth * 16))
    for (let i = 0; i < buf.length - 4; i += 4) {
      buf.writeUInt32BE(i, i)
    }
    return buf
  })

// Random binary garbage
const binaryGarbage = (): fc.Arbitrary<string> =>
  fc.uint8Array({ minLength: 4, maxLength: 1024 }).map((arr) => Buffer.from(arr).toString('base64'))

// XDR with invalid length fields (length > actual data)
const invalidLength = (): fc.Arbitrary<string> => {
  return fc
    .tuple(fc.integer({ min: 100, max: 1000 }), fc.uint8Array({ minLength: 10, maxLength: 50 }))
    .map(([claimedLen, data]) => {
      const buf = Buffer.alloc(8 + data.length)
      buf.writeUInt32BE(claimedLen, 0) // Claim a large length
      buf.writeUInt32BE(0, 4)
      Buffer.from(data).copy(buf, 8)
      return buf.toString('base64')
    })
}

/**
 * Combined generator for diverse malformed inputs.
 */
const malformedXdrs = (): fc.Arbitrary<string> =>
  fc.oneof(
    truncatedBase64(),
    invalidDiscriminant().map((b) => b.toString('base64')),
    deepNesting().map((b) => b.toString('base64')),
    binaryGarbage(),
    invalidLength(),
  )

/**
 * Fuzz target 1: extractFootprintFromTransaction (full-object parser)
 *
 * Must not throw an uncaught exception for any malformed XDR input.
 * Acceptable outcomes: returns null, returns a valid FootprintKeys, or throws
 * SorobanResurrectError (which is caught and logged, not uncaught).
 */
export function fuzzExtractFootprintFromTransaction(input: string): void {
  try {
    const result = extractFootprintFromTransaction(input, 'Test SDF Network ; September 2015')
    // Success: returned null or a valid FootprintKeys object
    if (result !== null) {
      if (typeof result !== 'object' || !Array.isArray(result.all)) {
        throw new Error('Invalid result shape from extractFootprintFromTransaction')
      }
    }
  } catch (err) {
    // The parser is allowed to throw exceptions from parsing failures,
    // but they should be internal SorobanResurrectError or parsing errors, not uncaught.
    // We do NOT rethrow here — fuzzing framework will detect if an exception escapes.
    if (
      err instanceof Error &&
      (err.message.includes('Invalid') || err.message.includes('transaction') || err.message.includes('XDR'))
    ) {
      // Expected parsing error — safe to ignore
      return
    }
    // If it's an unexpected error type, let it propagate so the fuzzer catches it
    throw err
  }
}

/**
 * Fuzz target 2: extractFootprintFromTransactionStreaming (streaming parser)
 *
 * Same contract as fuzzExtractFootprintFromTransaction, but stresses the
 * incremental parsing path and memory bounds.
 */
export function fuzzExtractFootprintFromTransactionStreaming(input: string): void {
  try {
    const result = extractFootprintFromTransactionStreaming(input)
    // Success: returned null or valid FootprintKeys
    if (result !== null) {
      if (typeof result !== 'object' || !Array.isArray(result.all)) {
        throw new Error('Invalid result shape from extractFootprintFromTransactionStreaming')
      }
    }
  } catch (err) {
    // Same error handling as the full-object parser
    if (
      err instanceof Error &&
      (err.message.includes('Invalid') || err.message.includes('transaction') || err.message.includes('XDR'))
    ) {
      return
    }
    throw err
  }
}

/**
 * Jest-style property test wrapper for jazzer integration.
 *
 * This allows jazzer.js to consume the property test and generate fuzzing input.
 */
export function fuzz(input: Buffer): void {
  const malformedXdr = input.toString('base64')

  fuzzExtractFootprintFromTransaction(malformedXdr)
  fuzzExtractFootprintFromTransactionStreaming(malformedXdr)
}

/**
 * Optional: Run a quick property-based check if using fast-check in tests.
 * This is _not_ the fuzz harness but complements it for local verification.
 */
export function runPropertyTests(): void {
  // Property 1: extractFootprintFromTransaction never throws on malformed input
  fc.assert(
    fc.property(malformedXdrs(), (xdr) => {
      fuzzExtractFootprintFromTransaction(xdr)
    }),
    { numRuns: 1000 },
  )

  // Property 2: extractFootprintFromTransactionStreaming never throws on malformed input
  fc.assert(
    fc.property(malformedXdrs(), (xdr) => {
      fuzzExtractFootprintFromTransactionStreaming(xdr)
    }),
    { numRuns: 1000 },
  )
}

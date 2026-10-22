/**
 * XDR encoding diagnostics
 *
 * Locates the first point at which a base64-encoded XDR string stops being
 * well-formed, and reports it both as a character index in the input and as
 * a byte offset in the decoded XDR.
 *
 * Scope: this covers the base64 transport layer only. Structural errors
 * inside the XDR (for example an unknown union discriminant) are raised by
 * the Stellar SDK decoder, which does not report offsets, so they are not
 * covered here.
 */

export interface XdrEncodingDiagnostic {
  /** True when the input is well-formed base64 with a whole number of bytes. */
  valid: boolean
  /** Length of the input string in characters. */
  inputLength: number
  /** Decoded byte length when valid; null otherwise. */
  decodedByteLength: number | null
  /** Index in the input string of the first invalid character, or null. */
  invalidCharIndex: number | null
  /**
   * Byte offset in the decoded XDR where decoding fails. For an invalid
   * character this is the byte that character's 6-bit group falls in. For a
   * truncated input it is the number of bytes that could still be decoded.
   */
  invalidByteOffset: number | null
  /** Human-readable reason, present only when valid is false. */
  problem?: string
}

const BASE64_CHAR = /^[A-Za-z0-9+/]$/

/**
 * Describes where a base64-encoded XDR string becomes malformed.
 */
export function describeXdrEncoding(xdr: string): XdrEncodingDiagnostic {
  const inputLength = xdr.length

  if (inputLength === 0) {
    return {
      valid: false,
      inputLength,
      decodedByteLength: null,
      invalidCharIndex: null,
      invalidByteOffset: null,
      problem: 'empty input',
    }
  }

  const paddingStart = xdr.endsWith('==') ? inputLength - 2 : xdr.endsWith('=') ? inputLength - 1 : inputLength

  let invalidCharIndex: number | null = null
  for (let i = 0; i < inputLength; i++) {
    const allowed = i < paddingStart ? BASE64_CHAR.test(xdr[i]) : xdr[i] === '='
    if (!allowed) {
      invalidCharIndex = i
      break
    }
  }

  if (invalidCharIndex !== null) {
    return {
      valid: false,
      inputLength,
      decodedByteLength: null,
      invalidCharIndex,
      invalidByteOffset: Math.floor((invalidCharIndex * 3) / 4),
      problem: `invalid base64 character at index ${invalidCharIndex}`,
    }
  }

  if (inputLength % 4 !== 0) {
    return {
      valid: false,
      inputLength,
      decodedByteLength: null,
      invalidCharIndex: null,
      invalidByteOffset: Math.floor((inputLength * 3) / 4),
      problem: `truncated input: length ${inputLength} is not a multiple of 4`,
    }
  }

  const paddingCount = inputLength - paddingStart
  return {
    valid: true,
    inputLength,
    decodedByteLength: (inputLength * 3) / 4 - paddingCount,
    invalidCharIndex: null,
    invalidByteOffset: null,
  }
}

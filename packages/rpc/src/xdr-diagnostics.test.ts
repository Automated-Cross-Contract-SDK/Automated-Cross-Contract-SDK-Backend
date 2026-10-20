import { describe, it, expect } from 'vitest'
import { describeXdrEncoding } from './xdr-diagnostics'

describe('describeXdrEncoding valid input', () => {
  it('reports decoded length for unpadded and padded well-formed base64', () => {
    expect(describeXdrEncoding('AAAA')).toEqual({
      valid: true,
      inputLength: 4,
      decodedByteLength: 3,
      invalidCharIndex: null,
      invalidByteOffset: null,
    })
    expect(describeXdrEncoding('AAA=').decodedByteLength).toBe(2)
    expect(describeXdrEncoding('AA==').decodedByteLength).toBe(1)
    expect(describeXdrEncoding('AAAAAA==').decodedByteLength).toBe(4)
  })
})

describe('describeXdrEncoding invalid characters', () => {
  it('reports the character index and the decoded byte offset of the first invalid character', () => {
    const result = describeXdrEncoding('AAAAAA!A')
    expect(result.valid).toBe(false)
    expect(result.invalidCharIndex).toBe(6)
    expect(result.invalidByteOffset).toBe(4)
    expect(result.decodedByteLength).toBeNull()
  })

  it('treats padding in the middle of the input as invalid', () => {
    const result = describeXdrEncoding('AA=A')
    expect(result.invalidCharIndex).toBe(2)
    expect(result.invalidByteOffset).toBe(1)
  })

  it('reports the first invalid character when several are present', () => {
    expect(describeXdrEncoding('AA*A!!!!').invalidCharIndex).toBe(2)
  })
})

describe('describeXdrEncoding truncated and empty input', () => {
  it('reports truncation with the number of bytes still decodable', () => {
    const result = describeXdrEncoding('AAAAA')
    expect(result.valid).toBe(false)
    expect(result.invalidCharIndex).toBeNull()
    expect(result.invalidByteOffset).toBe(3)
    expect(result.problem).toContain('not a multiple of 4')
  })

  it('reports empty input as invalid with no offsets', () => {
    const result = describeXdrEncoding('')
    expect(result.valid).toBe(false)
    expect(result.invalidByteOffset).toBeNull()
    expect(result.problem).toBe('empty input')
  })
})

import { describe, it, expect } from 'vitest'
import {
  UnsupportedRpcMethodError,
  describeUnsupportedMethod,
  isUnsupportedMethodError,
} from './unsupported-method.js'

const context = { method: 'getLedgerEntries', endpointUrl: 'https://rpc.example.org', protocolVersion: 20 }

describe('isUnsupportedMethodError', () => {
  it('detects a numeric JSON-RPC method-not-found code', () => {
    expect(isUnsupportedMethodError({ code: -32601 })).toBe(true)
  })

  it('detects a method-not-found code nested in an HTTP response body', () => {
    expect(isUnsupportedMethodError({ response: { data: { error: { code: -32601 } } } })).toBe(true)
  })

  it('detects a method-not-found message on an Error', () => {
    expect(isUnsupportedMethodError(new Error('Method not found'))).toBe(true)
  })

  it('does not treat unrelated failures as unsupported methods', () => {
    expect(isUnsupportedMethodError(new Error('connection reset'))).toBe(false)
    expect(isUnsupportedMethodError({ code: -32602 })).toBe(false)
    expect(isUnsupportedMethodError(null)).toBe(false)
    expect(isUnsupportedMethodError('Method not found')).toBe(false)
  })
})

describe('describeUnsupportedMethod', () => {
  it('wraps a method-not-found error with the method and endpoint', () => {
    const raw = new Error('Method not found')
    const result = describeUnsupportedMethod(raw, context)

    expect(result).toBeInstanceOf(UnsupportedRpcMethodError)
    const err = result as UnsupportedRpcMethodError
    expect(err.code).toBe('UNSUPPORTED_RPC_METHOD')
    expect(err.method).toBe('getLedgerEntries')
    expect(err.endpointUrl).toBe('https://rpc.example.org')
    expect(err.protocolVersion).toBe(20)
    expect(err.cause).toBe(raw)
    expect(err.message).toBe(
      'RPC method getLedgerEntries is not supported by endpoint https://rpc.example.org (protocol 20)',
    )
  })

  it('omits the protocol version from the message when it is unknown', () => {
    const err = describeUnsupportedMethod({ code: -32601 }, { method: 'getVersionInfo', endpointUrl: 'https://a' })
    expect((err as Error).message).toBe('RPC method getVersionInfo is not supported by endpoint https://a')
    expect((err as UnsupportedRpcMethodError).protocolVersion).toBeUndefined()
  })

  it('returns any other error unchanged', () => {
    const other = new Error('timeout')
    expect(describeUnsupportedMethod(other, context)).toBe(other)
  })
})

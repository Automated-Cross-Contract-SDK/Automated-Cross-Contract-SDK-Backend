import { describe, it, expect } from 'vitest'
import { parseJsonRpcResponse, parseJsonRpcResult, RpcResponseError } from './json-rpc-response'

function captureError(fn: () => unknown): RpcResponseError {
  try {
    fn()
  } catch (err) {
    if (err instanceof RpcResponseError) return err
    throw err
  }
  throw new Error('expected RpcResponseError')
}

describe('parseJsonRpcResponse content type handling', () => {
  it('parses a body declared as application/json, with or without parameters', () => {
    expect(parseJsonRpcResponse('{"result":1}', 'application/json', 200)).toEqual({ result: 1 })
    expect(parseJsonRpcResponse('{"result":1}', 'application/json; charset=utf-8', 200)).toEqual({ result: 1 })
  })

  it('accepts application/json-rpc and +json media types', () => {
    expect(parseJsonRpcResponse('{"result":2}', 'application/json-rpc', 200)).toEqual({ result: 2 })
    expect(parseJsonRpcResponse('{"result":3}', 'application/problem+json', 200)).toEqual({ result: 3 })
  })

  it('rejects an HTML error page with INVALID_CONTENT_TYPE', () => {
    const err = captureError(() =>
      parseJsonRpcResponse('<html>502 Bad Gateway</html>', 'text/html', 502),
    )
    expect(err.kind).toBe('INVALID_CONTENT_TYPE')
    expect(err.status).toBe(502)
    expect(err.contentType).toBe('text/html')
  })

  it('reports INVALID_CONTENT_TYPE when no content type is present, even for valid JSON text', () => {
    const err = captureError(() => parseJsonRpcResponse('{"result":1}', null, 200))
    expect(err.kind).toBe('INVALID_CONTENT_TYPE')
    expect(err.contentType).toBeNull()
    expect(err.message).toContain('none')
  })
})

describe('parseJsonRpcResponse malformed body handling', () => {
  it('reports MALFORMED_JSON for a body declared as JSON that does not parse', () => {
    const err = captureError(() => parseJsonRpcResponse('{"result":', 'application/json', 200))
    expect(err.kind).toBe('MALFORMED_JSON')
    expect(err.status).toBe(200)
  })

  it('does not echo the response body in the error message', () => {
    const secret = 'sensitive-body-marker'
    const err = captureError(() => parseJsonRpcResponse(`{"x":"${secret}"`, 'application/json', 200))
    expect(err.message).not.toContain(secret)
  })
})

describe('parseJsonRpcResult envelope handling', () => {
  it('returns the result member of a successful envelope', () => {
    expect(parseJsonRpcResult('{"jsonrpc":"2.0","id":1,"result":{"status":"SUCCESS"}}', 'application/json', 200)).toEqual({
      status: 'SUCCESS',
    })
  })

  it('rejects an error object returned with HTTP 200', () => {
    const body = '{"jsonrpc":"2.0","id":1,"error":{"code":-32600,"message":"Invalid Request"}}'
    const err = captureError(() => parseJsonRpcResult(body, 'application/json', 200))
    expect(err.kind).toBe('JSON_RPC_ERROR')
    expect(err.rpcCode).toBe(-32600)
    expect(err.status).toBe(200)
    expect(err.message).toContain('Invalid Request')
  })

  it('treats an error object as authoritative even when result is also present', () => {
    const body = '{"result":1,"error":{"code":-32001,"message":"busy"}}'
    const err = captureError(() => parseJsonRpcResult(body, 'application/json', 200))
    expect(err.kind).toBe('JSON_RPC_ERROR')
  })

  it('reports an error without a code or message without throwing a TypeError', () => {
    const err = captureError(() => parseJsonRpcResult('{"error":{}}', 'application/json', 500))
    expect(err.kind).toBe('JSON_RPC_ERROR')
    expect(err.rpcCode).toBeUndefined()
    expect(err.message).toContain('unknown')
  })

  it('rejects an envelope with neither result nor error as MALFORMED_JSON', () => {
    const err = captureError(() => parseJsonRpcResult('{"jsonrpc":"2.0","id":1}', 'application/json', 200))
    expect(err.kind).toBe('MALFORMED_JSON')
  })

  it('rejects a non-object JSON value as MALFORMED_JSON', () => {
    expect(captureError(() => parseJsonRpcResult('[1,2]', 'application/json', 200)).kind).toBe('MALFORMED_JSON')
    expect(captureError(() => parseJsonRpcResult('null', 'application/json', 200)).kind).toBe('MALFORMED_JSON')
  })

  it('keeps content type failures ahead of envelope checks', () => {
    const err = captureError(() => parseJsonRpcResult('{"error":{"code":1}}', 'text/plain', 200))
    expect(err.kind).toBe('INVALID_CONTENT_TYPE')
  })
})

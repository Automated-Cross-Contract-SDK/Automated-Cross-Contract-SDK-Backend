import { describe, it, expect } from 'vitest'
import { parseJsonRpcResponse, RpcResponseError } from './json-rpc-response'

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

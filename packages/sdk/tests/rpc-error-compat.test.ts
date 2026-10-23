import { describe, it, expect, vi } from 'vitest'
import { SorobanResurrect } from '../src/soroban-resurrect.js'
import { FixedDelay } from '../src/retry-policy.js'
import { SorobanResurrectError } from '../src/types.js'

/**
 * Error shapes observed from real Soroban RPC providers and transports.
 * Each must be normalised into a SorobanResurrectError and retried as a
 * transient NETWORK_ERROR without leaking the raw shape to callers.
 */
const PROVIDER_ERRORS: Array<[string, () => unknown]> = [
  ['fetch TypeError (DNS / connection refused)', () => new TypeError('fetch failed')],
  ['axios timeout', () => Object.assign(new Error('timeout of 30000ms exceeded'), { code: 'ECONNABORTED', isAxiosError: true })],
  ['axios HTTP 429 rate limit', () => Object.assign(new Error('Request failed with status code 429'), { isAxiosError: true, response: { status: 429, data: 'Too Many Requests' } })],
  ['axios HTTP 503 gateway', () => Object.assign(new Error('Request failed with status code 503'), { isAxiosError: true, response: { status: 503 } })],
  ['JSON-RPC error object', () => ({ code: -32603, message: 'internal error' })],
  ['JSON-RPC method not found (old RPC version)', () => ({ code: -32601, message: 'method not found' })],
  ['plain string rejection', () => 'socket hang up'],
  ['ECONNRESET errno error', () => Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET', errno: -104 })],
  ['null rejection', () => null],
  ['undefined rejection', () => undefined],
]

function makeClient(maxRetries = 2) {
  return new SorobanResurrect({
    rpcUrl: 'https://soroban-testnet.stellar.org',
    networkPassphrase: 'Test SDF Network ; September 2015',
    retryPolicy: new FixedDelay(maxRetries, 0),
  })
}

const retry = (client: SorobanResurrect, fn: () => Promise<unknown>) =>
  (client as any).retryOnFailure(fn, 'compat-test') as Promise<unknown>

describe('RPC provider error compatibility', () => {
  describe.each(PROVIDER_ERRORS)('%s', (_name, make) => {
    it('is wrapped as a NETWORK_ERROR SorobanResurrectError', async () => {
      const raw = make()
      const err = await retry(makeClient(0), () => Promise.reject(raw)).catch(e => e)
      expect(err).toBeInstanceOf(SorobanResurrectError)
      expect(err.code).toBe('NETWORK_ERROR')
      expect(err.cause).toBe(raw)
      expect(typeof err.message).toBe('string')
    })

    it('is retried until the retry budget is exhausted', async () => {
      const fn = vi.fn(() => Promise.reject(make()))
      await expect(retry(makeClient(2), fn)).rejects.toBeInstanceOf(SorobanResurrectError)
      expect(fn).toHaveBeenCalledTimes(3)
    })

    it('recovers when the provider succeeds on a later attempt', async () => {
      const fn = vi.fn()
        .mockImplementationOnce(() => Promise.reject(make()))
        .mockResolvedValueOnce('ok')
      await expect(retry(makeClient(2), fn)).resolves.toBe('ok')
      expect(fn).toHaveBeenCalledTimes(2)
    })
  })

  it('does not retry non-transient SorobanResurrectError codes', async () => {
    const fn = vi.fn(() => Promise.reject(new SorobanResurrectError('bad xdr', 'INVALID_XDR')))
    const err = await retry(makeClient(3), fn).catch(e => e)
    expect(err.code).toBe('INVALID_XDR')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('preserves an already-normalised error instance', async () => {
    const original = new SorobanResurrectError('sim failed', 'SIMULATION_FAILED')
    const err = await retry(makeClient(0), () => Promise.reject(original)).catch(e => e)
    expect(err).toBe(original)
  })
})

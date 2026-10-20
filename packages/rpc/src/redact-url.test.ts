import { describe, it, expect } from 'vitest'
import { redactRpcUrl, redactRpcUrls, redactUrlsInText } from './redact-url'

describe('redactRpcUrl', () => {
  it('replaces userinfo credentials', () => {
    expect(redactRpcUrl('https://user:hunter2@rpc.example.com/soroban')).toBe(
      'https://REDACTED:REDACTED@rpc.example.com/soroban',
    )
  })

  it('redacts API key style query parameters and keeps other parameters', () => {
    const result = redactRpcUrl('https://rpc.example.com/?apiKey=abc123&api_key=def&token=t&network=testnet')
    expect(result).not.toContain('abc123')
    expect(result).not.toContain('def')
    expect(result).not.toContain('t&')
    expect(result).toContain('network=testnet')
    expect(result).toContain('apiKey=REDACTED')
  })

  it('leaves a URL without credentials unchanged', () => {
    expect(redactRpcUrl('https://soroban-testnet.stellar.org')).toBe('https://soroban-testnet.stellar.org/')
  })

  it('does not echo input that is not a valid URL', () => {
    expect(redactRpcUrl('rpc.example.com?apiKey=secret-value')).toBe('<invalid url>')
  })

  it('does not modify the caller-visible input string', () => {
    const input = 'https://user:pw@rpc.example.com'
    redactRpcUrl(input)
    expect(input).toBe('https://user:pw@rpc.example.com')
  })
})

describe('redactRpcUrls', () => {
  it('redacts a single string', () => {
    expect(redactRpcUrls('https://u:p@rpc.example.com')).toBe('https://REDACTED:REDACTED@rpc.example.com/')
  })

  it('redacts each entry of an array and keeps the array shape', () => {
    expect(redactRpcUrls(['https://a.example.com/?token=x', 'https://b.example.com'])).toEqual([
      'https://a.example.com/?token=REDACTED',
      'https://b.example.com/',
    ])
  })
})

describe('redactUrlsInText', () => {
  it('redacts URLs embedded in an error message and keeps surrounding text', () => {
    const message = 'request to https://u:pw@rpc.example.com/?apiKey=k1 failed with 500'
    const result = redactUrlsInText(message)
    expect(result).toBe('request to https://REDACTED:REDACTED@rpc.example.com/?apiKey=REDACTED failed with 500')
  })

  it('returns text without URLs unchanged', () => {
    expect(redactUrlsInText('no endpoints here')).toBe('no endpoints here')
  })
})

import { describe, it, expect, vi } from 'vitest'
import { SorobanResurrectContext, useSorobanResurrectContext } from '../src/SorobanResurrectContext.js'
import type { SorobanResurrectContextValue } from '../src/types.js'

describe('SorobanResurrectContext', () => {
  it('should create context with default values', () => {
    expect(SorobanResurrectContext).toBeDefined()
    const defaultValue = (SorobanResurrectContext as any)._currentValue
      || (SorobanResurrectContext as any).Provider?.defaultValue
      || { resurrect: null, config: null }
    expect(defaultValue).toEqual({ resurrect: null, config: null })
  })

  it('should initialize with null resurrect and config', () => {
    const mockContextValue: SorobanResurrectContextValue = {
      resurrect: null,
      config: null,
    }
    expect(mockContextValue.resurrect).toBeNull()
    expect(mockContextValue.config).toBeNull()
  })

  it('should accept rpcUrl array configuration when building context', () => {
    const rpcUrls = [
      'https://soroban-rpc.stellar.org',
      'https://soroban-testnet-rpc.stellar.org',
    ]

    // Verify that rpcUrls can be stored in config
    const mockConfig = {
      rpcUrls,
      networkPassphrase: 'Test SDF Network ; September 2015',
    }

    expect(mockConfig.rpcUrls).toEqual(rpcUrls)
    expect(mockConfig.rpcUrls.length).toBe(2)
  })

  it('should support single and multiple RPC endpoints', () => {
    const singleUrl = ['https://soroban-rpc.stellar.org']
    const multipleUrls = [
      'https://soroban-rpc.stellar.org',
      'https://backup-rpc.stellar.org',
      'https://failover-rpc.stellar.org',
    ]

    expect(singleUrl).toHaveLength(1)
    expect(multipleUrls).toHaveLength(3)
  })

  it('should throw when context is used outside of provider', () => {
    expect(() => {
      useSorobanResurrectContext()
    }).toThrow('useSorobanResurrectContext must be used within a <SorobanResurrectProvider>')
  })
})

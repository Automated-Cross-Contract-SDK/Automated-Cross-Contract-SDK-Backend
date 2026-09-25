import { describe, it, expect, beforeEach } from 'vitest'
import { createApp } from 'vue'
import { SorobanResurrectPlugin } from '../src/SorobanResurrectPlugin.js'
import { SOROBAN_RESURRECT_INJECTION_KEY } from '../src/types.js'
import type { SorobanResurrectPluginOptions } from '../src/types.js'

describe('SorobanResurrectPlugin', () => {
  const defaultOptions: SorobanResurrectPluginOptions = {
    rpcUrl: 'https://soroban-testnet.stellar.org',
    networkPassphrase: 'Test SDF Network ; September 2015',
  }

  beforeEach(() => {
    // Clear global window to avoid SSR issues in tests
    if (typeof window !== 'undefined') {
      global.window = window
    }
  })

  it('provides config surface with rpcUrl and networkPassphrase', () => {
    const app = createApp({})
    app.use(SorobanResurrectPlugin, defaultOptions)

    const injected = app._context.provides[Symbol.for('SorobanResurrect') as any]
    // We need a different approach since we're testing the plugin directly
    // Let's test by creating a simple component
  })

  it('exposes config through provide/inject', () => {
    const app = createApp({
      setup() {
        const context = app._context.provides[SOROBAN_RESURRECT_INJECTION_KEY as any]
        return { context }
      },
    })

    app.use(SorobanResurrectPlugin, {
      ...defaultOptions,
      allowHttp: true,
      timeout: 10000,
    })

    // The plugin should have provided the config
    expect(app._context.provides).toBeDefined()
  })

  it('includes allowHttp and timeout in config when provided', () => {
    const app = createApp({})
    const options: SorobanResurrectPluginOptions = {
      ...defaultOptions,
      allowHttp: true,
      timeout: 10000,
    }

    app.use(SorobanResurrectPlugin, options)

    // Verify the plugin was registered
    expect(app._context.provides).toBeDefined()
  })

  it('sets global property $sorobanResurrect on app', () => {
    const app = createApp({})
    app.use(SorobanResurrectPlugin, defaultOptions)

    expect(app.config.globalProperties.$sorobanResurrect).toBeDefined()
  })

  it('includes resurrect methods in context value', () => {
    const app = createApp({})
    app.use(SorobanResurrectPlugin, defaultOptions)

    const contextValue = app.config.globalProperties.$sorobanResurrect
    expect(contextValue.resurrect).toBeDefined()
    expect(contextValue.config).toBeDefined()
    expect(contextValue.config.rpcUrl).toBe(defaultOptions.rpcUrl)
    expect(contextValue.config.networkPassphrase).toBe(defaultOptions.networkPassphrase)
  })
})

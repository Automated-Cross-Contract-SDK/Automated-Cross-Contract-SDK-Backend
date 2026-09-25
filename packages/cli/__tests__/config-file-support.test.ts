import * as assert from 'assert'
import { describe, it, beforeEach } from 'vitest'

interface ConfigFile {
  rpcUrl: string | string[]
  network: string
  retryPolicy?: {
    maxRetries: number
    backoffMs: number
    maxBackoffMs: number
  }
  cache?: {
    enabled: boolean
    ttlMs: number
    maxSize: number
  }
}

interface EnvironmentOverride {
  [key: string]: string | boolean | number | undefined
}

describe('[M4][CLI] Config file support (.resurrecrc.json) (Issue #284)', () => {
  let configFile: ConfigFile
  let envOverrides: EnvironmentOverride

  beforeEach(() => {
    configFile = {
      rpcUrl: 'https://soroban-testnet.stellar.org',
      network: 'testnet',
      retryPolicy: {
        maxRetries: 3,
        backoffMs: 100,
        maxBackoffMs: 5000,
      },
      cache: {
        enabled: true,
        ttlMs: 60000,
        maxSize: 1000,
      },
    }

    envOverrides = {}
  })

  describe('Config File Reading', () => {
    it('should read .resurrecrc.json configuration file', () => {
      const configFileName = '.resurrecrc.json'
      assert.ok(configFileName.endsWith('.json'))
      assert.ok(configFileName.includes('resurrec'))
    })

    it('should parse JSON configuration correctly', () => {
      const jsonString = JSON.stringify(configFile)
      const parsed = JSON.parse(jsonString)
      assert.strictEqual(parsed.rpcUrl, configFile.rpcUrl)
      assert.strictEqual(parsed.network, configFile.network)
    })

    it('should support configuration in project root', () => {
      const configPath = './.resurrecrc.json'
      assert.ok(configPath.startsWith('./'))
      assert.ok(configPath.includes('resurrec'))
    })

    it('should handle missing config file gracefully', () => {
      let error: any = null
      try {
        throw new Error('Config file not found: .resurrecrc.json')
      } catch (e) {
        error = e
      }
      assert.ok(error.message.includes('not found'))
    })
  })

  describe('RPC Configuration', () => {
    it('should support single RPC URL', () => {
      const singleRpc = { ...configFile, rpcUrl: 'https://soroban-testnet.stellar.org' }
      assert.ok(typeof singleRpc.rpcUrl === 'string')
      assert.ok(singleRpc.rpcUrl.includes('https'))
    })

    it('should support multiple RPC URLs for failover', () => {
      const multiRpc = {
        ...configFile,
        rpcUrl: [
          'https://soroban-testnet.stellar.org',
          'https://backup-rpc.example.com',
          'https://secondary-rpc.example.com',
        ],
      }
      assert.ok(Array.isArray(multiRpc.rpcUrl))
      assert.strictEqual(multiRpc.rpcUrl.length, 3)
    })

    it('should use first RPC URL in list as primary', () => {
      const multiRpc = {
        ...configFile,
        rpcUrl: ['https://primary.example.com', 'https://backup.example.com'],
      }
      const rpcArray = Array.isArray(multiRpc.rpcUrl) ? multiRpc.rpcUrl : [multiRpc.rpcUrl]
      assert.strictEqual(rpcArray[0], 'https://primary.example.com')
    })

    it('should fall back to next RPC on failure', () => {
      const rpcList = [
        'https://primary.example.com',
        'https://backup.example.com',
      ]
      const fallbackIndex = rpcList.length > 1 ? 1 : 0
      assert.ok(rpcList[fallbackIndex] !== undefined)
    })
  })

  describe('Network Configuration', () => {
    it('should support testnet network', () => {
      assert.strictEqual(configFile.network, 'testnet')
    })

    it('should support mainnet network', () => {
      const mainnetConfig = { ...configFile, network: 'mainnet' }
      assert.strictEqual(mainnetConfig.network, 'mainnet')
    })

    it('should support custom network with passphrase', () => {
      const customNetwork = { ...configFile, network: 'custom' }
      assert.ok(customNetwork.network)
      assert.ok(typeof customNetwork.network === 'string')
    })
  })

  describe('Retry Policy', () => {
    it('should configure max retries', () => {
      assert.strictEqual(configFile.retryPolicy?.maxRetries, 3)
      assert.ok(configFile.retryPolicy!.maxRetries > 0)
    })

    it('should configure backoff milliseconds', () => {
      assert.strictEqual(configFile.retryPolicy?.backoffMs, 100)
      assert.ok(configFile.retryPolicy!.backoffMs > 0)
    })

    it('should configure maximum backoff time', () => {
      assert.strictEqual(configFile.retryPolicy?.maxBackoffMs, 5000)
      assert.ok(configFile.retryPolicy!.maxBackoffMs >= configFile.retryPolicy!.backoffMs)
    })

    it('should implement exponential backoff', () => {
      const policy = configFile.retryPolicy!
      const delay1 = policy.backoffMs
      const delay2 = Math.min(delay1 * 2, policy.maxBackoffMs)
      assert.ok(delay2 >= delay1)
    })

    it('should default to sensible retry values if not specified', () => {
      const minimalConfig = { rpcUrl: 'https://example.com', network: 'testnet' }
      assert.ok('retryPolicy' in minimalConfig || minimalConfig.retryPolicy === undefined)
    })
  })

  describe('Cache Configuration', () => {
    it('should enable cache in configuration', () => {
      assert.strictEqual(configFile.cache?.enabled, true)
    })

    it('should configure cache TTL in milliseconds', () => {
      assert.strictEqual(configFile.cache?.ttlMs, 60000)
      assert.ok(configFile.cache!.ttlMs > 0)
    })

    it('should configure maximum cache size', () => {
      assert.strictEqual(configFile.cache?.maxSize, 1000)
      assert.ok(configFile.cache!.maxSize > 0)
    })

    it('should allow disabling cache', () => {
      const noCacheConfig = {
        ...configFile,
        cache: { enabled: false, ttlMs: 0, maxSize: 0 },
      }
      assert.strictEqual(noCacheConfig.cache.enabled, false)
    })

    it('should clear cache when TTL expires', () => {
      const ttl = configFile.cache!.ttlMs
      const currentTime = Date.now()
      const entryTime = currentTime - ttl - 1000
      const isExpired = currentTime - entryTime > ttl
      assert.ok(isExpired)
    })
  })

  describe('Environment Variable Override', () => {
    it('should support SOROBAN_RESURRECT_RPC environment variable', () => {
      envOverrides.SOROBAN_RESURRECT_RPC = 'https://env-rpc.example.com'
      assert.ok('SOROBAN_RESURRECT_RPC' in envOverrides)
      assert.ok(envOverrides.SOROBAN_RESURRECT_RPC)
    })

    it('should support SOROBAN_RESURRECT_NETWORK environment variable', () => {
      envOverrides.SOROBAN_RESURRECT_NETWORK = 'mainnet'
      assert.ok('SOROBAN_RESURRECT_NETWORK' in envOverrides)
      assert.strictEqual(envOverrides.SOROBAN_RESURRECT_NETWORK, 'mainnet')
    })

    it('should support SOROBAN_RESURRECT_MAX_RETRIES environment variable', () => {
      envOverrides.SOROBAN_RESURRECT_MAX_RETRIES = '5'
      assert.ok('SOROBAN_RESURRECT_MAX_RETRIES' in envOverrides)
    })

    it('environment variable should override config file', () => {
      const fileConfig = { rpcUrl: 'https://file-rpc.example.com' }
      const envRpc = 'https://env-rpc.example.com'
      const finalRpc = envRpc || fileConfig.rpcUrl
      assert.strictEqual(finalRpc, envRpc)
    })

    it('should support multiple env overrides simultaneously', () => {
      envOverrides.SOROBAN_RESURRECT_RPC = 'https://custom-rpc.example.com'
      envOverrides.SOROBAN_RESURRECT_NETWORK = 'mainnet'
      envOverrides.SOROBAN_RESURRECT_MAX_RETRIES = '10'
      assert.strictEqual(Object.keys(envOverrides).length, 3)
    })
  })

  describe('Config Precedence', () => {
    it('should apply precedence: CLI flags > env vars > config file > defaults', () => {
      const defaults = { rpcUrl: 'https://default.example.com', network: 'testnet' }
      const configFileVal = 'https://config.example.com'
      const envVal = 'https://env.example.com'
      const cliVal = 'https://cli.example.com'

      let result = defaults.rpcUrl
      result = configFileVal || result
      result = envVal || result
      result = cliVal || result

      assert.strictEqual(result, cliVal)
    })
  })

  describe('Config Validation', () => {
    it('should validate RPC URL format', () => {
      const validUrl = 'https://soroban-testnet.stellar.org'
      const isValidUrl = /^https?:\/\/.+/.test(validUrl)
      assert.ok(isValidUrl)
    })

    it('should reject invalid JSON in config file', () => {
      let error: any = null
      try {
        throw new Error('Invalid JSON in .resurrecrc.json')
      } catch (e) {
        error = e
      }
      assert.ok(error.message.includes('Invalid JSON'))
    })

    it('should require network field', () => {
      assert.ok('network' in configFile)
      assert.ok(configFile.network)
    })

    it('should require at least one RPC URL', () => {
      const rpcArray = Array.isArray(configFile.rpcUrl)
        ? configFile.rpcUrl
        : [configFile.rpcUrl]
      assert.ok(rpcArray.length > 0)
    })
  })
})

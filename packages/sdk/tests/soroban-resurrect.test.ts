import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SorobanResurrect } from '../src/soroban-resurrect.js'
import { SorobanResurrectError } from '../src/types.js'
import { extractKeysFromFootprint, classifyLedgerKey, encodeLedgerKey } from '../src/footprint-parser.js'
import { xdr } from '@stellar/stellar-sdk'

vi.mock('@stellar/stellar-sdk', () => {
  const mockContractDataKey = vi.fn().mockImplementation(() => ({
    contract: () => ({
      contractId: () => Buffer.from('abc123', 'hex'),
    }),
    key: () => ({}),
    durability: () => ({}),
  }))

  const mockContractCodeKey = vi.fn().mockImplementation(() => ({
    hash: () => Buffer.from('def456', 'hex'),
  }))

  return {
    SorobanRpc: {
      Server: vi.fn().mockImplementation(() => ({
        simulateTransaction: vi.fn(),
        getLedgerEntries: vi.fn(),
        getAccount: vi.fn(),
        sendTransaction: vi.fn(),
        getTransaction: vi.fn(),
      })),
      Api: {
        isSimulationError: vi.fn(),
        isSimulationSuccess: vi.fn(),
        isSimulationRestore: vi.fn(),
      },
    },
    TransactionBuilder: {
      fromXDR: vi.fn(),
    },
    Transaction: vi.fn(),
    Operation: {
      restoreFootprint: vi.fn().mockReturnValue({ type: 'restoreFootprint' }),
    },
    Account: vi.fn(),
    xdr: {
      LedgerEntryType: {
        contractData: () => 'contractData',
        contractCode: () => 'contractCode',
        ttl: () => 'ttl',
      },
      LedgerKeyContractData: mockContractDataKey,
      LedgerKeyContractCode: mockContractCodeKey,
      LedgerKey: {},
    },
    BASE_FEE: '100',
    SorobanDataBuilder: vi.fn().mockImplementation(() => ({
      setFootprint: vi.fn().mockReturnThis(),
      build: vi.fn().mockReturnValue({
        toXDR: () => 'mock-soroban-data-xdr',
        footprint: () => ({
          readOnly: () => [],
          readWrite: () => [],
        }),
      }),
      getFootprint: () => ({
        readOnly: () => [],
        readWrite: () => [],
      }),
    })),
  }
})

describe('SorobanResurrect', () => {
  const defaultConfig = {
    rpcUrl: 'https://soroban-testnet.stellar.org',
    networkPassphrase: 'Test SDF Network ; September 2015',
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('constructor', () => {
    it('initializes with valid config', () => {
      const instance = new SorobanResurrect(defaultConfig)
      expect(instance).toBeInstanceOf(SorobanResurrect)
      expect(instance.getRpcServer()).toBeDefined()
    })

    it('applies default values', () => {
      const instance = new SorobanResurrect(defaultConfig)
      expect(instance).toBeDefined()
    })
  })

  describe('extractKeysFromFootprint', () => {
    it('extracts keys from footprint correctly', () => {
      const mockKey1 = {} as xdr.LedgerKey
      const mockKey2 = {} as xdr.LedgerKey
      const footprint = {
        readOnly: () => [mockKey1],
        readWrite: () => [mockKey2],
      } as unknown as xdr.LedgerFootprint

      const result = extractKeysFromFootprint(footprint)
      expect(result.readOnly).toHaveLength(1)
      expect(result.readWrite).toHaveLength(1)
      expect(result.all).toHaveLength(2)
    })

    it('handles empty footprint', () => {
      const footprint = {
        readOnly: () => [],
        readWrite: () => [],
      } as unknown as xdr.LedgerFootprint

      const result = extractKeysFromFootprint(footprint)
      expect(result.readOnly).toHaveLength(0)
      expect(result.readWrite).toHaveLength(0)
      expect(result.all).toHaveLength(0)
    })
  })

  describe('classifyLedgerKey', () => {
    it('classifies contractData keys', () => {
      const mockKey = {
        switch: () => xdr.LedgerEntryType.contractData(),
        contractData: () => ({
          contract: () => ({
            contractId: () => Buffer.from('abc123', 'hex'),
          }),
        }),
      } as unknown as xdr.LedgerKey

      const result = classifyLedgerKey(mockKey)
      expect(result.keyType).toBe('contractData')
      expect(result.contractId).toBe('abc123')
    })

    it('classifies contractCode keys', () => {
      const mockKey = {
        switch: () => xdr.LedgerEntryType.contractCode(),
        contractCode: () => ({
          hash: () => Buffer.from('def456', 'hex'),
        }),
      } as unknown as xdr.LedgerKey

      const result = classifyLedgerKey(mockKey)
      expect(result.keyType).toBe('contractCode')
    })

    it('classifies unknown keys', () => {
      const mockKey = {
        switch: () => 'something_else',
      } as unknown as xdr.LedgerKey

      const result = classifyLedgerKey(mockKey)
      expect(result.keyType).toBe('unknown')
    })
  })

  describe('SorobanResurrectError', () => {
    it('creates error with correct name', () => {
      const error = new SorobanResurrectError('test error', 'SIMULATION_FAILED')
      expect(error.name).toBe('SorobanResurrectError')
      expect(error.code).toBe('SIMULATION_FAILED')
      expect(error.message).toBe('test error')
    })

    it('preserves cause', () => {
      const cause = new Error('underlying')
      const error = new SorobanResurrectError('wrapped', 'NETWORK_ERROR', cause)
      expect(error.cause).toBe(cause)
    })
  })

  describe('simulate method', () => {
    it('throws INVALID_XDR for malformed transaction', async () => {
      const { TransactionBuilder } = await import('@stellar/stellar-sdk')
      vi.mocked(TransactionBuilder.fromXDR).mockImplementationOnce(() => {
        throw new Error('invalid XDR')
      })

      const instance = new SorobanResurrect(defaultConfig)
      await expect(instance.simulate('invalid-xdr')).rejects.toThrow(SorobanResurrectError)
    })
  })

  describe('checkAndPrepare', () => {
    it('returns no restoration needed when all keys are live', async () => {
      const instance = new SorobanResurrect(defaultConfig)
      vi.spyOn(instance, 'simulate').mockResolvedValue({
        needsRestoration: false,
        archivedKeys: [],
        totalKeysInFootprint: 3,
      })

      const result = await instance.checkAndPrepare('mock-xdr', 'GABC...')
      expect(result.needsRestoration).toBe(false)
      expect(result.restoreTransactionXDR).toBeUndefined()
    })
  })

  // ---------------------------------------------------------------------------
  // WebSocket transaction status subscription (#43)
  // ---------------------------------------------------------------------------

  describe('WebSocket transaction status subscription', () => {
    /** Build a minimal mock WebSocket that exposes the handler setters. */
    function makeMockWs() {
      const ws = {
        onopen:    null as ((e: Event) => void) | null,
        onmessage: null as ((e: MessageEvent) => void) | null,
        onerror:   null as ((e: Event) => void) | null,
        onclose:   null as ((e: CloseEvent) => void) | null,
        send:      vi.fn(),
        close:     vi.fn(),
        readyState: 1,
      }
      return ws
    }

    /** Fire onopen then deliver a transaction_status message. */
    function deliverStatus(
      ws: ReturnType<typeof makeMockWs>,
      hash: string,
      status: 'SUCCESS' | 'FAILED' | 'PENDING',
      extra?: Partial<{ error: string }>,
    ) {
      ws.onopen?.(new Event('open'))
      const msg: MessageEvent = {
        data: JSON.stringify({
          jsonrpc: '2.0',
          method: 'transaction_status',
          params: { hash, status, ...extra },
        }),
      } as unknown as MessageEvent
      ws.onmessage?.(msg)
    }

    beforeEach(() => {
      // Remove any existing global WebSocket mock between tests
      vi.stubGlobal('WebSocket', undefined)
    })

    describe('useWebSocket: false (default)', () => {
      it('defaults useWebSocket to false and uses polling', async () => {
        const instance = new SorobanResurrect(defaultConfig)
        vi.spyOn(instance, 'getRpcServer').mockReturnValue({
          getTransaction: vi.fn().mockResolvedValue({ status: 'SUCCESS' }),
        } as any)

        const result = await instance.waitForTransaction('hash-abc', 5)
        expect(result.transport).toBe('polling')
        expect(result.hash).toBe('hash-abc')
      })

      it('does not construct WebSocket when useWebSocket is false', async () => {
        const wsCtor = vi.fn()
        vi.stubGlobal('WebSocket', wsCtor)

        const instance = new SorobanResurrect(defaultConfig) // useWebSocket defaults false
        vi.spyOn(instance, 'getRpcServer').mockReturnValue({
          getTransaction: vi.fn().mockResolvedValue({ status: 'SUCCESS' }),
        } as any)

        await instance.waitForTransaction('hash-abc', 5)
        expect(wsCtor).not.toHaveBeenCalled()
      })
    })

    describe('useWebSocket: true — WebSocket path', () => {
      const wsConfig = {
        rpcUrl: 'https://soroban-testnet.stellar.org',
        networkPassphrase: 'Test SDF Network ; September 2015',
        useWebSocket: true,
      }

      it('returns transport "websocket" on SUCCESS message', async () => {
        const mockWs = makeMockWs()
        vi.stubGlobal('WebSocket', vi.fn().mockImplementation(() => {
          // Simulate probe opening then the real connection opening
          setTimeout(() => mockWs.onopen?.(new Event('open')), 0)
          return mockWs
        }))

        const instance = new SorobanResurrect(wsConfig)

        // First WebSocket call is the probe (resolves true via onopen),
        // second is the actual subscription. We deliver SUCCESS on the
        // second onopen.
        let callCount = 0
        const WsCtor = vi.fn().mockImplementation(() => {
          callCount++
          const ws = makeMockWs()
          if (callCount === 1) {
            // probe — open immediately
            setTimeout(() => ws.onopen?.(new Event('open')), 0)
          } else {
            // real subscription — open then deliver SUCCESS
            setTimeout(() => {
              ws.onopen?.(new Event('open'))
              const msg: MessageEvent = {
                data: JSON.stringify({
                  jsonrpc: '2.0',
                  method: 'transaction_status',
                  params: { hash: 'tx-hash-1', status: 'SUCCESS' },
                }),
              } as unknown as MessageEvent
              ws.onmessage?.(msg)
            }, 0)
          }
          return ws
        })
        vi.stubGlobal('WebSocket', WsCtor)

        const result = await instance.waitForTransaction('tx-hash-1', 10)
        expect(result.transport).toBe('websocket')
        expect(result.hash).toBe('tx-hash-1')
      })

      it('throws SorobanResurrectError with ORIGINAL_TX_FAILED on FAILED message', async () => {
        let callCount = 0
        const WsCtor = vi.fn().mockImplementation(() => {
          callCount++
          const ws = makeMockWs()
          setTimeout(() => {
            ws.onopen?.(new Event('open'))
            if (callCount > 1) {
              // subscription ws — deliver FAILED
              ws.onmessage?.({
                data: JSON.stringify({
                  jsonrpc: '2.0',
                  method: 'transaction_status',
                  params: { hash: 'tx-fail', status: 'FAILED', error: 'out of gas' },
                }),
              } as unknown as MessageEvent)
            }
          }, 0)
          return ws
        })
        vi.stubGlobal('WebSocket', WsCtor)

        const instance = new SorobanResurrect(wsConfig)
        await expect(instance.waitForTransaction('tx-fail', 10)).rejects.toThrow(SorobanResurrectError)
        await expect(instance.waitForTransaction('tx-fail', 10)).rejects.toMatchObject({
          code: 'ORIGINAL_TX_FAILED',
        })
      })

      it('ignores messages for a different hash', async () => {
        let callCount = 0
        const WsCtor = vi.fn().mockImplementation(() => {
          callCount++
          const ws = makeMockWs()
          setTimeout(() => {
            ws.onopen?.(new Event('open'))
            if (callCount > 1) {
              // First deliver a message for a different hash (should be ignored)
              ws.onmessage?.({
                data: JSON.stringify({
                  jsonrpc: '2.0',
                  method: 'transaction_status',
                  params: { hash: 'other-hash', status: 'SUCCESS' },
                }),
              } as unknown as MessageEvent)
              // Then deliver SUCCESS for the correct hash
              ws.onmessage?.({
                data: JSON.stringify({
                  jsonrpc: '2.0',
                  method: 'transaction_status',
                  params: { hash: 'correct-hash', status: 'SUCCESS' },
                }),
              } as unknown as MessageEvent)
            }
          }, 0)
          return ws
        })
        vi.stubGlobal('WebSocket', WsCtor)

        const instance = new SorobanResurrect(wsConfig)
        const result = await instance.waitForTransaction('correct-hash', 10)
        expect(result.transport).toBe('websocket')
      })

      it('ignores non-JSON WebSocket frames without throwing', async () => {
        let callCount = 0
        const WsCtor = vi.fn().mockImplementation(() => {
          callCount++
          const ws = makeMockWs()
          setTimeout(() => {
            ws.onopen?.(new Event('open'))
            if (callCount > 1) {
              // Send garbage, then valid SUCCESS
              ws.onmessage?.({ data: 'not-json{{' } as unknown as MessageEvent)
              ws.onmessage?.({
                data: JSON.stringify({
                  jsonrpc: '2.0',
                  method: 'transaction_status',
                  params: { hash: 'hash-json', status: 'SUCCESS' },
                }),
              } as unknown as MessageEvent)
            }
          }, 0)
          return ws
        })
        vi.stubGlobal('WebSocket', WsCtor)

        const instance = new SorobanResurrect(wsConfig)
        await expect(instance.waitForTransaction('hash-json', 10)).resolves.toMatchObject({
          transport: 'websocket',
        })
      })

      it('sends the correct JSON-RPC 2.0 subscribe message on open', async () => {
        let subscribeWs: ReturnType<typeof makeMockWs> | null = null
        let callCount = 0
        const WsCtor = vi.fn().mockImplementation(() => {
          callCount++
          const ws = makeMockWs()
          setTimeout(() => {
            ws.onopen?.(new Event('open'))
            if (callCount > 1) {
              subscribeWs = ws
              // Deliver SUCCESS so the promise resolves
              ws.onmessage?.({
                data: JSON.stringify({
                  jsonrpc: '2.0',
                  method: 'transaction_status',
                  params: { hash: 'hash-subscribe', status: 'SUCCESS' },
                }),
              } as unknown as MessageEvent)
            }
          }, 0)
          return ws
        })
        vi.stubGlobal('WebSocket', WsCtor)

        const instance = new SorobanResurrect(wsConfig)
        await instance.waitForTransaction('hash-subscribe', 10)

        expect(subscribeWs!.send).toHaveBeenCalledOnce()
        const sentMsg = JSON.parse(subscribeWs!.send.mock.calls[0][0] as string)
        expect(sentMsg).toMatchObject({
          jsonrpc: '2.0',
          method: 'subscribeTransactionStatus',
          params: { hash: 'hash-subscribe' },
        })
      })
    })

    describe('useWebSocket: true — fallback to polling', () => {
      const wsConfig = {
        rpcUrl: 'https://soroban-testnet.stellar.org',
        networkPassphrase: 'Test SDF Network ; September 2015',
        useWebSocket: true,
      }

      it('falls back to polling when WebSocket probe fails (onerror)', async () => {
        const WsCtor = vi.fn().mockImplementation(() => {
          const ws = makeMockWs()
          // Every WebSocket connection errors immediately (probe fails)
          setTimeout(() => ws.onerror?.(new Event('error')), 0)
          return ws
        })
        vi.stubGlobal('WebSocket', WsCtor)

        const instance = new SorobanResurrect(wsConfig)
        vi.spyOn(instance, 'getRpcServer').mockReturnValue({
          getTransaction: vi.fn().mockResolvedValue({ status: 'SUCCESS' }),
        } as any)

        const result = await instance.waitForTransaction('hash-fallback', 5)
        expect(result.transport).toBe('polling')
      })

      it('falls back to polling when WebSocket constructor throws', async () => {
        vi.stubGlobal('WebSocket', vi.fn().mockImplementation(() => {
          throw new Error('WebSocket not available')
        }))

        const instance = new SorobanResurrect(wsConfig)
        vi.spyOn(instance, 'getRpcServer').mockReturnValue({
          getTransaction: vi.fn().mockResolvedValue({ status: 'SUCCESS' }),
        } as any)

        const result = await instance.waitForTransaction('hash-ctor-throw', 5)
        expect(result.transport).toBe('polling')
      })

      it('falls back to polling when useWebSocket is true but rpcUrl uses http without allowHttp', async () => {
        const httpConfig = {
          rpcUrl: 'http://localhost:8000',
          networkPassphrase: 'Test SDF Network ; September 2015',
          useWebSocket: true,
          // allowHttp is false by default — so ws: URL cannot be derived
        }
        const instance = new SorobanResurrect(httpConfig)
        vi.spyOn(instance, 'getRpcServer').mockReturnValue({
          getTransaction: vi.fn().mockResolvedValue({ status: 'SUCCESS' }),
        } as any)

        const result = await instance.waitForTransaction('hash-http', 5)
        expect(result.transport).toBe('polling')
      })

      it('derives ws:// from http:// when allowHttp is true', async () => {
        const httpAllowConfig = {
          rpcUrl: 'http://localhost:8000',
          networkPassphrase: 'Test SDF Network ; September 2015',
          useWebSocket: true,
          allowHttp: true,
        }

        let capturedUrl: string | null = null
        let callCount = 0
        const WsCtor = vi.fn().mockImplementation((url: string) => {
          callCount++
          capturedUrl = url
          const ws = makeMockWs()
          setTimeout(() => {
            ws.onopen?.(new Event('open'))
            if (callCount > 1) {
              ws.onmessage?.({
                data: JSON.stringify({
                  jsonrpc: '2.0',
                  method: 'transaction_status',
                  params: { hash: 'hash-ws', status: 'SUCCESS' },
                }),
              } as unknown as MessageEvent)
            }
          }, 0)
          return ws
        })
        vi.stubGlobal('WebSocket', WsCtor)

        const instance = new SorobanResurrect(httpAllowConfig)
        await instance.waitForTransaction('hash-ws', 10)

        expect(capturedUrl).toMatch(/^ws:\/\//)
      })

      it('derives wss:// from https:// rpcUrl', async () => {
        let capturedUrl: string | null = null
        let callCount = 0
        const WsCtor = vi.fn().mockImplementation((url: string) => {
          callCount++
          capturedUrl = url
          const ws = makeMockWs()
          setTimeout(() => {
            ws.onopen?.(new Event('open'))
            if (callCount > 1) {
              ws.onmessage?.({
                data: JSON.stringify({
                  jsonrpc: '2.0',
                  method: 'transaction_status',
                  params: { hash: 'hash-wss', status: 'SUCCESS' },
                }),
              } as unknown as MessageEvent)
            }
          }, 0)
          return ws
        })
        vi.stubGlobal('WebSocket', WsCtor)

        const instance = new SorobanResurrect(wsConfig)
        await instance.waitForTransaction('hash-wss', 10)

        expect(capturedUrl).toMatch(/^wss:\/\//)
      })
    })

    describe('polling path', () => {
      it('resolves with transport "polling" on SUCCESS', async () => {
        const instance = new SorobanResurrect(defaultConfig)
        vi.spyOn(instance, 'getRpcServer').mockReturnValue({
          getTransaction: vi.fn()
            .mockResolvedValueOnce({ status: 'NOT_FOUND' })
            .mockResolvedValueOnce({ status: 'SUCCESS' }),
        } as any)

        const result = await instance.waitForTransaction('hash-poll', 5)
        expect(result.transport).toBe('polling')
        expect(result.hash).toBe('hash-poll')
      })

      it('throws ORIGINAL_TX_FAILED when polling returns FAILED status', async () => {
        const instance = new SorobanResurrect(defaultConfig)
        vi.spyOn(instance, 'getRpcServer').mockReturnValue({
          getTransaction: vi.fn().mockResolvedValue({ status: 'FAILED', result: 'out of gas' }),
        } as any)

        await expect(instance.waitForTransaction('hash-fail', 5)).rejects.toMatchObject({
          code: 'ORIGINAL_TX_FAILED',
        })
      })

      it('throws NETWORK_ERROR when max poll attempts exceeded', async () => {
        const instance = new SorobanResurrect(defaultConfig)
        vi.spyOn(instance, 'getRpcServer').mockReturnValue({
          getTransaction: vi.fn().mockResolvedValue({ status: 'NOT_FOUND' }),
        } as any)

        await expect(instance.waitForTransaction('hash-timeout', 2)).rejects.toMatchObject({
          code: 'NETWORK_ERROR',
        })
      })
    })
  })
})

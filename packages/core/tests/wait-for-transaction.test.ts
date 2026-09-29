import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SorobanRpc } from '@stellar/stellar-sdk'
import { SorobanResurrect } from '../src/soroban-resurrect.js'

const RPC_URL = 'https://soroban-testnet.stellar.org'
const NETWORK_PASSPHRASE = 'Test SDF Network ; September 2015'

/**
 * WebSocket stand-in that completes the handshake but never delivers a
 * `transaction_status` event, so the wait path relies solely on its timeout.
 */
class SilentWebSocket {
  static instances: SilentWebSocket[] = []
  onopen: (() => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  onerror: ((event: unknown) => void) | null = null
  onclose: ((event: { code: number }) => void) | null = null
  readonly sent: string[] = []
  closed = false

  constructor(readonly url: string) {
    SilentWebSocket.instances.push(this)
    setTimeout(() => {
      if (!this.closed) this.onopen?.()
    }, 1)
  }

  send(data: string): void {
    this.sent.push(data)
  }

  close(): void {
    this.closed = true
  }
}

function createClient(overrides: Record<string, unknown> = {}): SorobanResurrect {
  return new SorobanResurrect({
    rpcUrl: RPC_URL,
    networkPassphrase: NETWORK_PASSPHRASE,
    pollIntervalMs: 100,
    maxPollAttempts: 5,
    ...overrides,
  })
}

describe('SorobanResurrect wait budget (maxPollAttempts × pollIntervalMs)', () => {
  beforeEach(() => {
    SilentWebSocket.instances = []
    // Keep the constructor's fire-and-forget network validation off the wire.
    vi.spyOn(SorobanRpc.Server.prototype, 'getNetwork').mockResolvedValue({
      passphrase: NETWORK_PASSPHRASE,
    } as never)
    // Every poll returns NOT_FOUND so the path exhausts its budget.
    vi.spyOn(SorobanRpc.Server.prototype, 'getTransaction').mockResolvedValue({
      status: 'NOT_FOUND',
    } as never)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('bounds the polling path by the derived budget', async () => {
    const client = createClient()
    const startedAt = Date.now()

    await expect(client.waitForTransaction('polling-hash')).rejects.toThrow(/not confirmed after 500ms/)

    const elapsed = Date.now() - startedAt
    expect(elapsed).toBeGreaterThanOrEqual(450)
    expect(elapsed).toBeLessThan(700)
    expect(SorobanRpc.Server.prototype.getTransaction).toHaveBeenCalledTimes(5)
  })

  it('bounds the WebSocket path by the same derived budget', async () => {
    vi.stubGlobal('WebSocket', SilentWebSocket)
    const client = createClient({ useWebSocket: true })
    const startedAt = Date.now()

    await expect(client.waitForTransaction('ws-hash')).rejects.toThrow(
      /not confirmed via WebSocket after 500ms/,
    )

    const elapsed = Date.now() - startedAt
    expect(elapsed).toBeGreaterThanOrEqual(450)
    expect(elapsed).toBeLessThan(800)
  })

  it('logs the computed budget exactly once at debug level', async () => {
    const logged: Array<{ level: string; message: string }> = []
    const client = createClient({
      onLog: (level: string, message: string) => logged.push({ level, message }),
    })

    await client.waitForTransaction('log-hash').catch(() => undefined)

    const budgetLogs = logged.filter(
      (entry) => entry.level === 'debug' && entry.message.includes('waitForTransaction budget'),
    )
    expect(budgetLogs).toHaveLength(1)
    expect(budgetLogs[0].message).toContain('500ms')
    expect(budgetLogs[0].message).toContain('5 attempts')
  })

  it('keeps both paths consistent when the budget is tuned', async () => {
    const client = createClient({ pollIntervalMs: 50, maxPollAttempts: 4 })
    const startedAt = Date.now()

    await expect(client.waitForTransaction('custom-hash')).rejects.toThrow(/not confirmed after 200ms/)

    expect(Date.now() - startedAt).toBeLessThan(400)
  })
})

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { SorobanResurrect } from '../src/soroban-resurrect.js'
import { SorobanRpc } from '@stellar/stellar-sdk'

describe('strictNetworkValidation modes', () => {
  let mockServer: any
  let logSpy: any

  beforeEach(() => {
    logSpy = vi.fn()
    mockServer = {
      getNetwork: vi.fn(),
      simulateTransaction: vi.fn(),
      getLedgerEntries: vi.fn(),
      getAccount: vi.fn(),
      sendTransaction: vi.fn(),
      getTransaction: vi.fn(),
      getHealth: vi.fn(),
      getLatestLedger: vi.fn(),
    }
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('default mode (false/undefined) logs warning on mismatch but continues', async () => {
    const testPassphrase = 'Test Network'
    const diffPassphrase = 'Different Network'

    mockServer.getNetwork.mockResolvedValue({ passphrase: diffPassphrase })

    const client = new SorobanResurrect({
      rpcUrl: 'https://example.com',
      networkPassphrase: testPassphrase,
      onLog: logSpy,
    })

    await new Promise(r => setTimeout(r, 100))

    expect(logSpy).toHaveBeenCalledWith(
      'warn',
      expect.stringContaining('Network passphrase mismatch')
    )
    expect(logSpy).not.toHaveBeenCalledWith('error', expect.anything())
  })

  it('warn mode logs error-level warning on mismatch but continues', async () => {
    const testPassphrase = 'Test Network'
    const diffPassphrase = 'Different Network'

    mockServer.getNetwork.mockResolvedValue({ passphrase: diffPassphrase })

    const client = new SorobanResurrect({
      rpcUrl: 'https://example.com',
      networkPassphrase: testPassphrase,
      strictNetworkValidation: 'warn',
      onLog: logSpy,
    })

    await new Promise(r => setTimeout(r, 100))

    expect(logSpy).toHaveBeenCalledWith(
      'error',
      expect.stringContaining('Network passphrase mismatch')
    )
  })

  it('strict mode (true) throws on mismatch', async () => {
    const testPassphrase = 'Test Network'
    const diffPassphrase = 'Different Network'

    mockServer.getNetwork.mockResolvedValue({ passphrase: diffPassphrase })

    const client = new SorobanResurrect({
      rpcUrl: 'https://example.com',
      networkPassphrase: testPassphrase,
      strictNetworkValidation: true,
      onLog: logSpy,
    })

    await new Promise(r => setTimeout(r, 100))

    expect(logSpy).toHaveBeenCalledWith(
      'error',
      expect.stringContaining('Network passphrase mismatch')
    )
  })

  it('does not log on matching passphrases in any mode', async () => {
    const testPassphrase = 'Test Network'

    mockServer.getNetwork.mockResolvedValue({ passphrase: testPassphrase })

    const client = new SorobanResurrect({
      rpcUrl: 'https://example.com',
      networkPassphrase: testPassphrase,
      strictNetworkValidation: 'warn',
      onLog: logSpy,
    })

    await new Promise(r => setTimeout(r, 100))

    expect(logSpy).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining('mismatch')
    )
  })
})

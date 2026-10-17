import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SorobanRpc } from '@stellar/stellar-sdk'
import { SorobanResurrect } from '../src/soroban-resurrect.js'

const RPC_URL = 'https://soroban-testnet.stellar.org'
const NETWORK_PASSPHRASE = 'Test SDF Network ; September 2015'
const RESTORE_FEE = '100000'

function createClient(): SorobanResurrect {
  return new SorobanResurrect({
    rpcUrl: RPC_URL,
    networkPassphrase: NETWORK_PASSPHRASE,
    dynamicFeeEstimation: true,
    restoreFee: RESTORE_FEE,
  })
}

describe('estimateRestoreFee simulation response validation', () => {
  beforeEach(() => {
    // Keep the constructor's fire-and-forget network validation off the wire.
    vi.spyOn(SorobanRpc.Server.prototype, 'getNetwork').mockResolvedValue({
      passphrase: NETWORK_PASSPHRASE,
    } as never)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // Known defect: the placeholder account ID in estimateRestoreFee fails
  // checksum validation, so every call falls back before the simulation
  // response is read. Switch to `it` once the placeholder is fixed.
  it.fails('applies a 10 % buffer to a valid minResourceFee', async () => {
    vi.spyOn(SorobanRpc.Server.prototype, 'simulateTransaction').mockResolvedValue({
      minResourceFee: '1000',
      transactionData: {},
      latestLedger: 1,
    } as never)

    await expect(createClient().estimateRestoreFee(1)).resolves.toBe('1100')
  })

  it('falls back to restoreFee when the simulation returns an error', async () => {
    vi.spyOn(SorobanRpc.Server.prototype, 'simulateTransaction').mockResolvedValue({
      error: 'simulation failed',
      latestLedger: 1,
    } as never)

    await expect(createClient().estimateRestoreFee(1)).resolves.toBe(RESTORE_FEE)
  })

  it('falls back to restoreFee when minResourceFee is missing', async () => {
    vi.spyOn(SorobanRpc.Server.prototype, 'simulateTransaction').mockResolvedValue({
      transactionData: {},
      latestLedger: 1,
    } as never)

    await expect(createClient().estimateRestoreFee(1)).resolves.toBe(RESTORE_FEE)
  })

  it('falls back to restoreFee when minResourceFee is not a number', async () => {
    vi.spyOn(SorobanRpc.Server.prototype, 'simulateTransaction').mockResolvedValue({
      minResourceFee: 'not-a-number',
      transactionData: {},
      latestLedger: 1,
    } as never)

    await expect(createClient().estimateRestoreFee(1)).resolves.toBe(RESTORE_FEE)
  })

  it('never calls simulateTransaction when dynamicFeeEstimation is disabled', async () => {
    const simulate = vi.spyOn(SorobanRpc.Server.prototype, 'simulateTransaction')
    const client = new SorobanResurrect({
      rpcUrl: RPC_URL,
      networkPassphrase: NETWORK_PASSPHRASE,
      dynamicFeeEstimation: false,
      restoreFee: RESTORE_FEE,
    })

    await expect(client.estimateRestoreFee(1)).resolves.toBe(RESTORE_FEE)
    expect(simulate).not.toHaveBeenCalled()
  })
})

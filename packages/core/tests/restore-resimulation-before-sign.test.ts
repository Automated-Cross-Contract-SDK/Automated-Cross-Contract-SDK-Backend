import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  Account,
  Keypair,
  Operation,
  SorobanDataBuilder,
  SorobanRpc,
  TransactionBuilder,
} from '@stellar/stellar-sdk'
import { SorobanResurrect } from '../src/soroban-resurrect.js'

const RPC_URL = 'https://soroban-testnet.stellar.org'
const NETWORK_PASSPHRASE = 'Test SDF Network ; September 2015'

function buildRestoreXDR(): string {
  const source = new Account(Keypair.random().publicKey(), '1')
  const sorobanData = new SorobanDataBuilder().setFootprint([], []).build().toXDR('base64')
  return new TransactionBuilder(source, {
    fee: '100000',
    networkPassphrase: NETWORK_PASSPHRASE,
    sorobanData,
  })
    .addOperation(Operation.restoreFootprint({}))
    .setTimeout(0)
    .build()
    .toXDR()
}

function buildOriginalXDR(): string {
  const source = new Account(Keypair.random().publicKey(), '1')
  return new TransactionBuilder(source, { fee: '100', networkPassphrase: NETWORK_PASSPHRASE })
    .addOperation(Operation.bumpSequence({ bumpTo: '2' }))
    .setTimeout(0)
    .build()
    .toXDR()
}

describe('restore transactions are re-simulated before signing', () => {
  beforeEach(() => {
    vi.spyOn(SorobanRpc.Server.prototype, 'getNetwork').mockResolvedValue({
      passphrase: NETWORK_PASSPHRASE,
    } as never)
    vi.spyOn(SorobanRpc.Server.prototype, 'sendTransaction').mockResolvedValue({
      status: 'PENDING',
      hash: 'tx-hash',
    } as never)
    vi.spyOn(SorobanRpc.Server.prototype, 'getTransaction').mockResolvedValue({
      status: 'SUCCESS',
    } as never)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // Known gap: executeRestoreThenOriginal signs the restore XDR it was given
  // without simulating it against current ledger state first. Once a fresh
  // simulation runs before the wallet callback, switch to `it`.
  it.fails('simulates the restore transaction before the wallet is asked to sign', async () => {
    const calls: string[] = []
    vi.spyOn(SorobanRpc.Server.prototype, 'simulateTransaction').mockImplementation(async () => {
      calls.push('simulate')
      return { minResourceFee: '1000', transactionData: {}, latestLedger: 1 } as never
    })
    const restoreXDR = buildRestoreXDR()
    const originalXDR = buildOriginalXDR()
    const sign = vi.fn(async (xdr: string) => {
      calls.push('sign')
      return xdr
    })

    const client = new SorobanResurrect({ rpcUrl: RPC_URL, networkPassphrase: NETWORK_PASSPHRASE })
    await client.executeRestoreThenOriginal(restoreXDR, originalXDR, sign)

    // Preconditions: the wallet was asked to sign the restore XDR we passed in.
    expect(sign).toHaveBeenCalledWith(restoreXDR)
    expect(calls[0]).toBe('simulate')
  })
})

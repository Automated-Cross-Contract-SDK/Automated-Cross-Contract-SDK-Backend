import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Keypair, SorobanRpc, xdr } from '@stellar/stellar-sdk'
import { SorobanResurrect } from '../src/soroban-resurrect.js'
import type { ConcurrentRestoreResult } from '@soroban-resurrect/types'

const RPC_URL = 'https://soroban-testnet.stellar.org'
const NETWORK_PASSPHRASE = 'Test SDF Network ; September 2015'
const SOURCE = Keypair.random().publicKey()
const ORIGINAL_XDR = 'original-xdr'

function archivedKey(): { key: xdr.LedgerKey; keyBase64: string } {
  const key = xdr.LedgerKey.account(
    new xdr.LedgerKeyAccount({ accountId: Keypair.random().xdrPublicKey() }),
  )
  return { key, keyBase64: key.toXDR('base64') }
}

function failedConcurrentResult(): ConcurrentRestoreResult {
  return {
    success: false,
    batches: [],
    totalKeysRestored: 0,
    failedBatchCount: 1,
    failedBatchIndices: [0],
    error: '1/1 batches failed',
  }
}

describe('restore vs original confirmation flags on ExecutionResult', () => {
  beforeEach(() => {
    vi.spyOn(SorobanRpc.Server.prototype, 'getNetwork').mockResolvedValue({
      passphrase: NETWORK_PASSPHRASE,
    } as never)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('reports a failed restore as unconfirmed while the original still confirms', async () => {
    const client = new SorobanResurrect({ rpcUrl: RPC_URL, networkPassphrase: NETWORK_PASSPHRASE })
    vi.spyOn(client, 'buildRestoreTransactionBatchesConcurrent').mockResolvedValue([])
    vi.spyOn(client as any, 'executeRestoreBatchesConcurrent').mockResolvedValue(
      failedConcurrentResult(),
    )
    vi.spyOn(client as any, 'submitSignedTransaction').mockResolvedValue('original-hash')

    const result = await client.executeRestoreThenOriginalBatchesConcurrent(
      [archivedKey()],
      ORIGINAL_XDR,
      SOURCE,
      async xdrIn => xdrIn,
      { requireAllBatches: false },
    )

    expect(result.success).toBe(true)
    expect(result.restoreConfirmed).toBe(false)
    expect(result.originalConfirmed).toBe(true)
    expect(result.originalTxHash).toBe('original-hash')
  })

  it('reports both steps confirmed when every restore batch confirms', async () => {
    const client = new SorobanResurrect({ rpcUrl: RPC_URL, networkPassphrase: NETWORK_PASSPHRASE })
    vi.spyOn(client, 'buildRestoreTransactionBatchesConcurrent').mockResolvedValue([])
    vi.spyOn(client as any, 'executeRestoreBatchesConcurrent').mockResolvedValue({
      success: true,
      batches: [],
      totalKeysRestored: 1,
    })
    vi.spyOn(client as any, 'submitSignedTransaction').mockResolvedValue('original-hash')

    const result = await client.executeRestoreThenOriginalBatchesConcurrent(
      [archivedKey()],
      ORIGINAL_XDR,
      SOURCE,
      async xdrIn => xdrIn,
    )

    expect(result.restoreConfirmed).toBe(true)
    expect(result.originalConfirmed).toBe(true)
  })

  it('reports restore as unconfirmed when the policy only submits restores', async () => {
    const client = new SorobanResurrect({
      rpcUrl: RPC_URL,
      networkPassphrase: NETWORK_PASSPHRASE,
      restoreConfirmationPolicy: 'submitted',
    })
    vi.spyOn(client, 'buildRestoreTransactionBatchesConcurrent').mockResolvedValue([])
    vi.spyOn(client as any, 'executeRestoreBatchesConcurrent').mockResolvedValue({
      success: true,
      batches: [],
      totalKeysRestored: 1,
    })
    vi.spyOn(client as any, 'submitSignedTransaction').mockResolvedValue('original-hash')

    const result = await client.executeRestoreThenOriginalBatchesConcurrent(
      [archivedKey()],
      ORIGINAL_XDR,
      SOURCE,
      async xdrIn => xdrIn,
    )

    expect(result.restoreConfirmed).toBe(false)
    expect(result.originalConfirmed).toBe(true)
  })
})

import { afterEach, describe, expect, it, vi } from 'vitest'
import { SorobanResurrectError } from '@soroban-resurrect/errors'
import { Networks } from '@stellar/stellar-sdk'
import { SorobanResurrect } from '../src/soroban-resurrect.js'

function createClient(): SorobanResurrect {
  return new SorobanResurrect({
    rpcUrl: 'https://soroban-testnet.stellar.org',
    networkPassphrase: Networks.TESTNET,
  } as any)
}

function batch(index: number) {
  return { batchIndex: index, transactionXDR: `xdr-${index}`, keysRestored: 1, status: 'pending' as const }
}

describe('typed per-batch outcomes for partial restoration failures', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('reports errorCode and retryable for each failed batch in a concurrent run', async () => {
    const client = createClient()
    vi.spyOn(client as any, 'submitSignedTransaction').mockImplementation(async (xdr: string) => {
      if (xdr === 'xdr-0') return 'hash-0'
      if (xdr === 'xdr-1') throw new SorobanResurrectError('NETWORK_ERROR', 'socket reset')
      throw new Error('unclassified failure')
    })

    const result = await client.executeRestoreBatchesConcurrent(
      [batch(0), batch(1), batch(2)],
      async x => x,
      3,
    )

    expect(result.success).toBe(false)
    expect(result.failedBatchIndices).toEqual([1, 2])
    expect(result.batches[0]).toMatchObject({ status: 'success', txHash: 'hash-0' })
    expect(result.batches[0].errorCode).toBeUndefined()
    expect(result.batches[1]).toMatchObject({
      status: 'failed',
      errorCode: 'NETWORK_ERROR',
      retryable: true,
    })
    expect(result.batches[2]).toMatchObject({
      status: 'failed',
      errorCode: 'UNKNOWN',
      retryable: false,
    })
  })

  it('reports the same typed fields for a failed batch in a sequential run', async () => {
    const client = createClient()
    vi.spyOn(client as any, 'submitSignedTransaction').mockRejectedValue(
      new SorobanResurrectError('RESTORE_FAILED', 'temporary'),
    )

    const result = await client.executeRestoreBatches([batch(0)], async x => x)

    expect(result.success).toBe(false)
    expect(result.batches[0]).toMatchObject({
      status: 'failed',
      errorCode: 'RESTORE_FAILED',
      retryable: true,
    })
  })
})

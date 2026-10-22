import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SorobanResurrect } from '../src/soroban-resurrect.js'
import { SorobanResurrectError, isStaleSequenceError, type RestoreBatchResult } from '../src/types.js'

const SOURCE = 'GSOURCEACCOUNT'

function batch(batchIndex: number): RestoreBatchResult {
  return { batchIndex, transactionXDR: `xdr-${batchIndex}`, keysRestored: 1, status: 'pending' }
}

function staleError(code: 'txBadSeq' | 'txTooLate') {
  return new SorobanResurrectError(
    `Transaction submission error (rpcUrl=https://rpc, result=${code})`,
    'ORIGINAL_TX_FAILED',
  )
}

describe('stale sequence numbers during restoration (#515)', () => {
  let client: SorobanResurrect
  let submit: ReturnType<typeof vi.spyOn>
  let rebuild: ReturnType<typeof vi.spyOn>
  const sign = vi.fn(async (xdr: string) => `signed-${xdr}`)

  beforeEach(() => {
    vi.clearAllMocks()
    client = new SorobanResurrect({
      rpcUrl: 'https://soroban-testnet.stellar.org',
      networkPassphrase: 'Test SDF Network ; September 2015',
    })
    submit = vi.spyOn(client as any, 'submitSignedTransaction')
    rebuild = vi
      .spyOn(client as any, 'rebuildRestoreBatches')
      .mockImplementation(async (batches: RestoreBatchResult[]) =>
        batches.map(b => ({ ...b, transactionXDR: `fresh-${b.batchIndex}`, status: 'pending' as const })),
      )
  })

  it('recognises only rejections that did not apply', () => {
    expect(isStaleSequenceError(staleError('txBadSeq'))).toBe(true)
    expect(isStaleSequenceError(staleError('txTooLate'))).toBe(true)
    expect(
      isStaleSequenceError(
        new SorobanResurrectError('not confirmed', 'NETWORK_ERROR', undefined, { txHash: 'h' }),
      ),
    ).toBe(false)
    expect(isStaleSequenceError(new SorobanResurrectError('x', 'ORIGINAL_TX_FAILED', undefined, { rpcUrl: 'r' }))).toBe(false)
  })

  it('rebuilds the failed and remaining batches with fresh sequence numbers and retries once', async () => {
    submit
      .mockResolvedValueOnce('hash-0')
      .mockRejectedValueOnce(staleError('txBadSeq'))
      .mockResolvedValueOnce('hash-1')
      .mockResolvedValueOnce('hash-2')

    const result = await client.executeRestoreBatches([batch(0), batch(1), batch(2)], sign, SOURCE)

    expect(rebuild).toHaveBeenCalledTimes(1)
    expect(rebuild.mock.calls[0][0].map((b: RestoreBatchResult) => b.batchIndex)).toEqual([1, 2])
    expect(submit.mock.calls.map(call => call[0])).toEqual(['xdr-0', 'xdr-1', 'fresh-1', 'fresh-2'])
    expect(result.success).toBe(true)
    expect(result.totalKeysRestored).toBe(3)
  })

  it('does not refresh when the outcome is ambiguous', async () => {
    submit.mockRejectedValueOnce(
      new SorobanResurrectError('not confirmed', 'NETWORK_ERROR', undefined, { txHash: 'h' }),
    )

    const result = await client.executeRestoreBatches([batch(0)], sign, SOURCE)

    expect(rebuild).not.toHaveBeenCalled()
    expect(result.success).toBe(false)
    expect(result.ambiguous).toBe(true)
  })

  it('refreshes at most once so a persistent stale error still fails cleanly', async () => {
    submit.mockRejectedValue(staleError('txTooLate'))

    const result = await client.executeRestoreBatches([batch(0), batch(1)], sign, SOURCE)

    expect(rebuild).toHaveBeenCalledTimes(1)
    expect(result.success).toBe(false)
    expect(result.failedAtBatchIndex).toBe(0)
  })

  it('does not refresh without a source account to rebuild against', async () => {
    submit.mockRejectedValueOnce(staleError('txBadSeq'))

    const result = await client.executeRestoreBatches([batch(0)], sign)

    expect(rebuild).not.toHaveBeenCalled()
    expect(result.success).toBe(false)
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SorobanResurrect } from '../src/soroban-resurrect.js'
import { SorobanResurrectError, isAmbiguousSubmissionError, type RestoreBatchResult } from '../src/types.js'

const ORIGINAL_XDR = 'original-xdr'

function batch(batchIndex: number): RestoreBatchResult {
  return { batchIndex, transactionXDR: `restore-${batchIndex}`, keysRestored: 1, status: 'pending' }
}

describe('ambiguous restore timeouts (#514)', () => {
  let client: SorobanResurrect
  let submit: ReturnType<typeof vi.spyOn>
  const sign = vi.fn(async (xdr: string) => `signed-${xdr}`)

  beforeEach(() => {
    vi.clearAllMocks()
    client = new SorobanResurrect({
      rpcUrl: 'https://soroban-testnet.stellar.org',
      networkPassphrase: 'Test SDF Network ; September 2015',
    })
    submit = vi.spyOn(client as any, 'submitSignedTransaction')
  })

  it('classifies a confirmation timeout (has a txHash) as ambiguous', () => {
    const timeout = new SorobanResurrectError('not confirmed', 'NETWORK_ERROR', undefined, { txHash: 'h1' })
    const rejected = new SorobanResurrectError('send failed', 'NETWORK_ERROR')

    expect(isAmbiguousSubmissionError(timeout)).toBe(true)
    expect(isAmbiguousSubmissionError(rejected)).toBe(false)
    expect(isAmbiguousSubmissionError(new Error('boom'))).toBe(false)
  })

  it('never submits the original transaction after an ambiguous batch timeout', async () => {
    submit.mockRejectedValueOnce(
      new SorobanResurrectError('not confirmed', 'NETWORK_ERROR', undefined, { txHash: 'h1' }),
    )

    await expect(
      client.executeRestoreThenOriginalBatches([batch(0), batch(1)], ORIGINAL_XDR, sign, {
        requireAllBatches: false,
      }),
    ).rejects.toMatchObject({ code: 'RESTORE_FAILED' })

    expect(submit.mock.calls.map(call => call[0])).not.toContain(ORIGINAL_XDR)
    expect(submit).toHaveBeenCalledTimes(1)
  })

  it('still proceeds to the original transaction after a definite batch rejection', async () => {
    submit
      .mockRejectedValueOnce(new SorobanResurrectError('rejected', 'ORIGINAL_TX_FAILED'))
      .mockResolvedValueOnce('hash-original')

    const result = await client.executeRestoreThenOriginalBatches([batch(0)], ORIGINAL_XDR, sign, {
      requireAllBatches: false,
    })

    expect(submit.mock.calls.map(call => call[0])).toContain(ORIGINAL_XDR)
    expect(result.originalTxHash).toBe('hash-original')
    expect(result.success).toBe(false)
  })

  it('marks the batch result as ambiguous so callers can see why it stopped', async () => {
    submit.mockRejectedValueOnce(
      new SorobanResurrectError('not confirmed', 'NETWORK_ERROR', undefined, { txHash: 'h1' }),
    )

    const result = await client.executeRestoreBatches([batch(0)], sign, 'GSOURCE')

    expect(result.success).toBe(false)
    expect(result.ambiguous).toBe(true)
  })
})

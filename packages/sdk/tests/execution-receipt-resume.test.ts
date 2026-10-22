import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SorobanResurrect } from '../src/soroban-resurrect.js'
import { SorobanResurrectError, type RestoreBatchResult } from '../src/types.js'

const SOURCE = 'GSOURCEACCOUNT'

function batch(batchIndex: number, overrides: Partial<RestoreBatchResult> = {}): RestoreBatchResult {
  return {
    batchIndex,
    transactionXDR: `xdr-${batchIndex}`,
    keysRestored: batchIndex + 1,
    status: 'pending',
    ...overrides,
  }
}

describe('restore execution receipts (#512)', () => {
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

  it('resubmits only batches that never succeeded', async () => {
    submit
      .mockResolvedValueOnce('hash-0')
      .mockRejectedValueOnce(new Error('batch 1 rejected'))

    const first = await client.executeRestoreBatches(
      [batch(0), batch(1), batch(2)],
      sign,
      SOURCE,
    )
    expect(first.success).toBe(false)

    const planned = [batch(0), batch(1), batch(2)]
    const receipt = client.createExecutionReceipt(first, SOURCE, planned)
    // Batch 1 failed and batch 2 was never attempted; batch 0 must not be resent.
    submit.mockReset()
    submit.mockResolvedValue('hash-retry')

    const resumed = await client.resumeRestoreBatches(receipt, sign)

    expect(submit).toHaveBeenCalledTimes(2)
    expect(submit.mock.calls.map(call => call[0])).toEqual(['xdr-1', 'xdr-2'])
    expect(resumed.success).toBe(true)
    expect(resumed.batches.map(b => b.status)).toEqual(['success', 'success', 'success'])
    expect(resumed.batches[0].txHash).toBe('hash-0')
    expect(resumed.totalKeysRestored).toBe(1 + 2 + 3)
  })

  it('submits nothing when every batch already succeeded', async () => {
    const receipt = client.createExecutionReceipt(
      {
        success: true,
        totalKeysRestored: 3,
        batches: [batch(0, { status: 'success', txHash: 'a' }), batch(1, { status: 'success', txHash: 'b' })],
      },
      SOURCE,
      [batch(0), batch(1)],
    )

    const result = await client.resumeRestoreBatches(receipt, sign)

    expect(submit).not.toHaveBeenCalled()
    expect(result.success).toBe(true)
    expect(result.totalKeysRestored).toBe(1 + 2)
  })

  it('treats a batch with a recorded txHash as done even if status is not success', async () => {
    const receipt = client.createExecutionReceipt(
      { success: false, totalKeysRestored: 0, batches: [batch(0, { txHash: 'known' })] },
      SOURCE,
      [batch(0, { txHash: 'known' })],
    )

    await client.resumeRestoreBatches(receipt, sign)

    expect(submit).not.toHaveBeenCalled()
  })

  it('reports the failing batch and keeps earlier successes in the receipt', async () => {
    submit.mockRejectedValue(new Error('still failing'))

    const receipt = client.createExecutionReceipt(
      { success: false, totalKeysRestored: 0, batches: [batch(0, { status: 'success', txHash: 'h0' }), batch(1, { status: 'failed', error: 'x' })] },
      SOURCE,
      [batch(0), batch(1)],
    )

    const result = await client.resumeRestoreBatches(receipt, sign)

    expect(result.success).toBe(false)
    expect(result.failedAtBatchIndex).toBe(0)
    expect(result.batches[0].status).toBe('success')
    expect(result.batches[1].status).toBe('failed')
    expect(result.totalKeysRestored).toBe(1)
  })

  it('round-trips a receipt through JSON', () => {
    const receipt = client.createExecutionReceipt(
      { success: true, totalKeysRestored: 1, batches: [batch(0, { status: 'success', txHash: 'h' })] },
      SOURCE,
      [batch(0)],
    )

    const restored = client.parseExecutionReceipt(JSON.stringify(receipt))

    expect(restored).toEqual(receipt)
  })

  it.each([
    ['invalid JSON', 'not-json'],
    ['wrong version', JSON.stringify({ version: 2, sourceAccountID: SOURCE, batches: [] })],
    ['missing source account', JSON.stringify({ version: 1, batches: [] })],
    ['missing batches', JSON.stringify({ version: 1, sourceAccountID: SOURCE })],
    ['unknown batch status', JSON.stringify({ version: 1, sourceAccountID: SOURCE, batches: [{ batchIndex: 0, transactionXDR: 'x', keysRestored: 1, status: 'bogus' }] })],
  ])('rejects a receipt with %s', (_label, json) => {
    expect(() => client.parseExecutionReceipt(json)).toThrow(SorobanResurrectError)
    expect(() => client.parseExecutionReceipt(json)).toThrow(/Invalid execution receipt/)
  })
})

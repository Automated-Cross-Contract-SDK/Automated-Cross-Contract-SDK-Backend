import { describe, it, expect, vi } from 'vitest'
import { SorobanResurrect } from '../src/soroban-resurrect.js'
import { SorobanResurrectError } from '../src/types.js'

const HASH = 'a'.repeat(64)

function clientWithStatus(getTransaction: () => Promise<unknown>) {
  const client = new SorobanResurrect({ rpcUrl: 'http://localhost:8000', networkPassphrase: 'Test', allowHttp: true })
  vi.spyOn(client as any, 'getServer').mockReturnValue({ getTransaction: vi.fn(getTransaction) })
  return client as any
}

describe('ambiguous submission timeout', () => {
  it('returns the hash when the transaction actually landed', async () => {
    const client = clientWithStatus(async () => ({ status: 'SUCCESS' }))
    await expect(client.reconcileAmbiguousSubmission(HASH, new Error('timeout'))).resolves.toBe(HASH)
  })

  it('throws ORIGINAL_TX_FAILED when the transaction landed but failed', async () => {
    const client = clientWithStatus(async () => ({ status: 'FAILED' }))
    await expect(client.reconcileAmbiguousSubmission(HASH, new Error('timeout'))).rejects.toMatchObject({
      code: 'ORIGINAL_TX_FAILED',
      txHash: HASH,
    })
  })

  it.each([
    ['NOT_FOUND', async () => ({ status: 'NOT_FOUND' })],
    ['lookup failure', async () => { throw new Error('ECONNRESET') }],
  ])('throws SUBMISSION_AMBIGUOUS with txHash on %s', async (_label, impl) => {
    const client = clientWithStatus(impl)
    const err = await client.reconcileAmbiguousSubmission(HASH, new Error('timeout')).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(SorobanResurrectError)
    expect(err).toMatchObject({ code: 'SUBMISSION_AMBIGUOUS', txHash: HASH })
  })
})

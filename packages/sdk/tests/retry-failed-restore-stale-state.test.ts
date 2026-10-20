/**
 * Issue #456 — `retryFailedRestore` must not resubmit keys that were restored
 * by another actor between the original attempt and the retry.
 *
 * The stale-state filter itself is not implemented yet, so the scenarios that
 * depend on it are declared with `it.todo`. The existing no-op path is tested
 * for real: when nothing failed, retry must succeed without touching the RPC.
 */
import { describe, it, expect, vi } from 'vitest'
import { SorobanResurrect } from '../src/soroban-resurrect.js'
import type { FailedRestoreState } from '../src/types.js'

const NETWORK_PASSPHRASE = 'Test SDF Network ; September 2015'
const SOURCE = 'GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H'

function emptyFailedState(partialEntriesRestored: number): FailedRestoreState {
  return {
    sourceAccountID: SOURCE,
    failedBatches: [],
    failedKeys: [],
    failedBatchIndex: 0,
    partialEntriesRestored,
  }
}

describe('retryFailedRestore stale FailedRestoreState (issue #456)', () => {
  it('succeeds without touching the RPC when no batches failed', async () => {
    const client = new SorobanResurrect({
      rpcUrl: 'https://soroban-testnet.stellar.org',
      networkPassphrase: NETWORK_PASSPHRASE,
    })
    const getServer = vi.spyOn(client as any, 'getServer')
    const signTransaction = vi.fn()

    const result = await client.retryFailedRestore(emptyFailedState(4), signTransaction)

    expect(result.success).toBe(true)
    expect(result.entriesRestored).toBe(4)
    expect(getServer).not.toHaveBeenCalled()
    expect(signTransaction).not.toHaveBeenCalled()
  })

  it.todo('re-checks each failed key on-chain and submits only the keys still archived (3 failed, 1 restored externally -> 2 submitted)')

  it.todo('returns success with zero batches and a skipped marker when every failed key is already live')

  it.todo('logs which failed keys were skipped because they were restored externally')
})

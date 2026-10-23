import { describe, it, expect, expectTypeOf } from 'vitest'
import type {
  ExecutionResult,
  RestoreTransactionResult,
  RestoreBatchResult,
  RestoreAllBatchesResult,
  ConcurrentRestoreResult,
} from '../src/index.js'
import type { UseSorobanResurrectReturn } from '../../react/src/types.js'

// Contract tests: restoration result types are consumed by framework adapters
// (react, vue, svelte, ...). Changing these shapes is a breaking change.
describe('restoration result type contracts', () => {
  it('RestoreBatchResult status is a closed union', () => {
    expectTypeOf<RestoreBatchResult['status']>().toEqualTypeOf<'pending' | 'success' | 'failed'>()
    expectTypeOf<RestoreBatchResult>().toHaveProperty('transactionXDR').toBeString()
    expectTypeOf<RestoreBatchResult>().toHaveProperty('keysRestored').toBeNumber()
  })

  it('sequential and concurrent results share the base shape', () => {
    type Base = Pick<RestoreAllBatchesResult, 'success' | 'batches' | 'totalKeysRestored' | 'error'>
    expectTypeOf<ConcurrentRestoreResult>().toMatchTypeOf<Base>()
    expectTypeOf<ConcurrentRestoreResult['failedBatchIndices']>().toEqualTypeOf<number[]>()
  })

  it('ExecutionResult embeds batch results optionally', () => {
    expectTypeOf<ExecutionResult['batchResults']>().toEqualTypeOf<RestoreAllBatchesResult | undefined>()
    expectTypeOf<ExecutionResult['concurrentBatchResults']>().toEqualTypeOf<ConcurrentRestoreResult | undefined>()
    expectTypeOf<RestoreTransactionResult>().toEqualTypeOf<{ transactionXDR: string; keysRestored: number }>()
  })

  it('react adapter exposes the SDK ExecutionResult unchanged', () => {
    expectTypeOf<UseSorobanResurrectReturn['lastResult']>().toEqualTypeOf<ExecutionResult | null>()
  })

  it('failed results carry an error and success results do not need one', () => {
    const failed: RestoreAllBatchesResult = {
      success: false,
      batches: [{ batchIndex: 0, transactionXDR: 'AAAA', keysRestored: 1, status: 'failed', error: 'boom' }],
      totalKeysRestored: 0,
      failedAtBatchIndex: 0,
      error: 'Batch 1 failed: boom',
    }
    const ok: ExecutionResult = { success: true, entriesRestored: 0 }
    expect(failed.batches[failed.failedAtBatchIndex!].status).toBe('failed')
    expect(ok.error).toBeUndefined()
  })
})

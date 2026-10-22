/**
 * Public API type snapshot for @soroban-resurrect/sdk (tsd).
 * Runs against the built declarations (`types` in package.json), so build first.
 * A failure here means the public typings changed: update deliberately.
 */
import { expectType, expectAssignable, expectError } from 'tsd'
import {
  SorobanResurrect,
  SorobanResurrectError,
  type ArchivedKey,
  type RestorePriority,
  type SacKeyType,
  type RestoreBatchResult,
  type ConcurrentRestoreResult,
  type SimulationCheckResult,
  type SorobanResurrectConfig,
} from '../dist/index.js'

declare const client: SorobanResurrect
declare const batch: RestoreBatchResult
declare const key: ArchivedKey

// Classes
expectType<SorobanResurrect>(new SorobanResurrect({ rpcUrl: 'x', networkPassphrase: 'y' }))
expectAssignable<Error>(new SorobanResurrectError('msg'))

// Config requires the network essentials
expectError<SorobanResurrectConfig>({})

// Methods
expectType<Promise<SimulationCheckResult>>(client.checkTransaction('xdr'))
expectType<Promise<ConcurrentRestoreResult>>(
  client.executeRestoreBatchesConcurrent([batch], async (x: string) => x, 4),
)
expectError(client.executeRestoreBatchesConcurrent('not-batches', async (x: string) => x))

// Data shapes
expectType<string>(key.keyBase64)
expectType<string>(batch.transactionXDR)
expectType<number>(batch.keysRestored)
expectAssignable<RestorePriority>(0)
expectAssignable<string>('sacBalance' as SacKeyType)
expectType<ConcurrentRestoreResult['success']>(true)
expectType<ConcurrentRestoreResult['concurrencyUsed']>(1)

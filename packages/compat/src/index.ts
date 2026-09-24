/**
 * @soroban-resurrect/compat
 * 
 * This package provides backwards compatibility for migrating from
 * @soroban-resurrect/sdk v0.x to the modular v1.0 architecture.
 * 
 * @deprecated This package will be removed in v2.0.0. Migrate to the modular packages.
 * @example
 * // Instead of importing from this compat package:
 * import { SorobanResurrect } from '@soroban-resurrect/compat'
 * // Import from the specific package:
 * import { SorobanResurrect } from '@soroban-resurrect/core'
 */

import { deprecate } from '@soroban-resurrect/utils'

// Emit a warning when this compat package is imported
deprecate(
  '@soroban-resurrect/compat is a migration aid and will be removed in v2.0.0. ' +
  'Please migrate to the modular packages (@soroban-resurrect/core, @soroban-resurrect/footprint-parser, etc.)',
  'v2.0.0'
)

// Re-export all SDK functionality for backwards compatibility
export { SorobanResurrect } from '@soroban-resurrect/core'

export {
  extractKeysFromFootprint,
  classifyLedgerKey,
  classifySacKey,
  encodeLedgerKey,
  extractFootprintFromTransaction,
  extractFootprintFromTransactionStreaming,
  classifyDeferredKeys,
  STREAMING_PARSER_MEMORY_TARGET,
  STREAMING_THRESHOLD_BYTES,
} from '@soroban-resurrect/footprint-parser'
export type { FootprintKeys, DeferredArchivedKey } from '@soroban-resurrect/footprint-parser'

export {
  SorobanResurrectError,
} from '@soroban-resurrect/errors'

export type {
  ArchivedKey,
  SacKeyType,
  RestorePriority,
  SorobanResurrectConfig,
  SimulationCheckResult,
  RestoreTransactionResult,
  RestoreBatchResult,
  RestoreAllBatchesResult,
  ConcurrentRestoreResult,
  ContractKeyGroup,
  ExecutionResult,
  FailedRestoreState,
  PreFlightConfig,
  FeeBumpMetadata,
  SorobanResurrectErrorContext,
  SorobanResurrectErrorBase,
  SorobanResurrectEvents,
  WsTransactionStatusEvent,
  TransactionWaitResult,
  RetryPolicy,
  RpcEndpointHealth,
  RpcFailoverConfig,
  SimulationCacheConfig,
  FootprintCacheConfig,
  CacheStatistics,
  FootprintCacheStatistics,
} from '@soroban-resurrect/types'

export { FeatureFlags } from '@soroban-resurrect/types'

export {
  ExponentialBackoff,
  FixedDelay,
  JitterBackoff,
  CircuitBreaker,
  DEFAULT_RETRY_POLICY,
} from '@soroban-resurrect/rpc'

export {
  SimulationCache,
} from '@soroban-resurrect/rpc'

export {
  FootprintCache,
} from '@soroban-resurrect/rpc'

export { RpcFailoverManager } from '@soroban-resurrect/rpc'

export {
  batchKeysByContract,
  groupKeysByPriority,
  createBatches,
  delay,
  pollWithRetry,
  hashString,
  DEFAULT_MAX_CONCURRENCY,
  MAX_RETRIES,
  RETRY_DELAY_MS,
  DEFAULT_POLL_ATTEMPTS,
  POLL_INTERVAL_MS,
  MAX_XDR_SIZE_BYTES,
  DEFAULT_RESTORE_FEE,
} from '@soroban-resurrect/utils'

export type { BatchingOptions, PollingOptions } from '@soroban-resurrect/utils'

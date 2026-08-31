/**
 * Deprecated exports with runtime warnings
 * 
 * This module provides deprecated exports that emit runtime warnings
 * when imported. These will be removed in v1.0.0.
 */

import { deprecate } from '@soroban-resurrect/utils'

// Emit deprecation warning when this module is accessed
deprecate('Importing from @soroban-resurrect/sdk is deprecated. Import from specific packages instead (e.g., @soroban-resurrect/core, @soroban-resurrect/footprint-parser, etc.)', 'v1.0.0')

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

// Keep wallet adapters in SDK package (not split yet)
export { WalletAdapterError, loadOptionalWalletDependency, bytesToBase64 } from './wallet-adapter.js'
export type { SorobanWalletAdapter, SignTransactionOptions, WalletConnectionResult, WalletAdapterErrorCode } from './wallet-adapter.js'

export { XBullAdapter } from './xbull-adapter.js'
export { LobstrAdapter } from './lobstr-adapter.js'
export {
  WalletConnectAdapter,
  STELLAR_CAIP2_NAMESPACE,
  STELLAR_MAINNET_CHAIN_ID,
  STELLAR_TESTNET_CHAIN_ID,
  SOROBAN_WC_METHODS,
  SOROBAN_WC_EVENTS,
} from './walletconnect-adapter.js'
export type { WalletConnectAdapterConfig, WalletMetadata } from './walletconnect-adapter.js'
export { LedgerAdapter } from './ledger-adapter.js'
export type { LedgerAdapterConfig } from './ledger-adapter.js'

export { VersionNegotiator, PROTOCOL_COMPATIBILITY_MATRIX, MIN_SUPPORTED_PROTOCOL, MAX_SUPPORTED_PROTOCOL } from './version-negotiator.js'
export type { ProtocolSupport, ServerVersionInfo, XdrEncodingOptions } from './version-negotiator.js'

export { VERSION } from './version.js'

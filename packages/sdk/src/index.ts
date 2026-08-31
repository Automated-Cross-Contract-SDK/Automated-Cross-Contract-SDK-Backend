// Re-export from modular packages for backwards compatibility
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
  SimulationDiff,
  LedgerEntryDiff,
  TtlChange,
} from './types.js'

export {
  Tracer,
  Span,
  parseTraceparent,
  formatTraceparent,
  resolveParentContext,
} from './tracing.js'
export type {
  TraceContext,
  TracingConfig,
  SpanData,
  SpanExporter,
} from './tracing.js'
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

/** Lightweight dependency injection container */
export { Container, Token, BindingBuilder, ContainerError } from './container.js'

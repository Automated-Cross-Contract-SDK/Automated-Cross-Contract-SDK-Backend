export { SorobanResurrect } from './soroban-resurrect.js'
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
} from './footprint-parser.js'
export type { FootprintKeys, DeferredArchivedKey } from './footprint-parser.js'
export {
  SorobanResurrectError,
} from './types.js'
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
} from './retry-policy.js'
export type { RetryPolicy } from './retry-policy.js'
export {
  SimulationCache,
} from './simulation-cache.js'
export type { SimulationCacheConfig, CacheStatistics } from './simulation-cache.js'

export {
  FootprintCache,
} from './footprint-cache.js'
export type { FootprintCacheConfig, FootprintCacheStatistics } from './footprint-cache.js'

export { VersionNegotiator, PROTOCOL_COMPATIBILITY_MATRIX, MIN_SUPPORTED_PROTOCOL, MAX_SUPPORTED_PROTOCOL } from './version-negotiator.js'
export type { ProtocolSupport, ServerVersionInfo, XdrEncodingOptions } from './version-negotiator.js'

export { VERSION } from './version.js'

export { RpcFailoverManager } from './rpc-failover.js'
export type { RpcEndpointHealth, RpcFailoverConfig } from './rpc-failover.js'

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

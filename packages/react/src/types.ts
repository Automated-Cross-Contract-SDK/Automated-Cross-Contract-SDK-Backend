import type { SorobanResurrectConfig, ArchivedKey, ExecutionResult, PreFlightConfig } from '@soroban-resurrect/sdk'

export type RestoreStatus = 'idle' | 'checking' | 'restoring' | 'submitting' | 'done' | 'error'

export interface RestoreProgress {
  status: RestoreStatus
  currentBatch: number
  totalBatches: number
  keysRestored: number
  totalKeys: number
  estimatedTimeRemainingMs?: number
}

export interface UseSorobanResurrectOptions {
  rpcUrl: string
  networkPassphrase: string
  allowHttp?: boolean
  /**
   * Timeout in milliseconds for RPC requests.
   * Forwarded to SorobanResurrectConfig.timeout → SorobanRpc.Server.
   */
  timeout?: number
  preFlight?: PreFlightConfig
  onError?: (error: Error) => void
  /**
   * Delay in milliseconds between polling attempts while waiting for a
   * transaction to confirm. Forwarded to the underlying SorobanResurrect
   * client. Defaults to `1000`.
   */
  pollIntervalMs?: number
  /**
   * Maximum number of polling attempts before giving up on a transaction.
   * Forwarded to the underlying SorobanResurrect client. Defaults to `30`.
   */
  maxPollAttempts?: number
  /**
   * When `true`, `executeWithRestore` immediately reflects the expected
   * transaction result before restoration completes, and rolls back if it
   * fails. Exposed via `isOptimistic`.
   */
  optimisticUpdate?: boolean
}

export interface UseSorobanResurrectReturn {
  executeWithRestore: (
    txXDR: string,
    signTransaction: (xdr: string) => Promise<string>,
    options?: { forceRefresh?: boolean; signal?: AbortSignal },
  ) => Promise<ExecutionResult>
  checkTransaction: (
    txXDR: string,
    options?: { forceRefresh?: boolean },
  ) => Promise<{
    needsRestoration: boolean
    archivedKeys: ArchivedKey[]
  }>
  isChecking: boolean
  isExecuting: boolean
  lastResult: ExecutionResult | null
  error: string | null
  needsRestore: boolean
  archivedKeys: ArchivedKey[]
  reset: () => void
  /** `true` while an optimistic result is being shown, ahead of restoration completing. */
  isOptimistic: boolean
  /** Structured progress information for the in-flight `executeWithRestore` call. */
  progress: RestoreProgress
  /** Aborts the in-flight `executeWithRestore` call, if any. */
  abort: () => void
}

export interface SorobanResurrectContextValue {
  resurrect: UseSorobanResurrectReturn | null
  config: SorobanResurrectConfig | null
}

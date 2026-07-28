import type { SorobanResurrectConfig, ArchivedKey, ExecutionResult, PreFlightConfig } from '@soroban-resurrect/sdk'

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
}

export interface UseSorobanResurrectReturn {
  executeWithRestore: (
    txXDR: string,
    signTransaction: (xdr: string) => Promise<string>,
    options?: { forceRefresh?: boolean },
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
}

export interface SorobanResurrectContextValue {
  resurrect: UseSorobanResurrectReturn | null
  config: SorobanResurrectConfig | null
}

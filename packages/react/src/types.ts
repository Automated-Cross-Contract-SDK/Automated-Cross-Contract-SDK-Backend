import type { SorobanResurrectConfig, ArchivedKey, ExecutionResult, PreFlightConfig } from '@soroban-resurrect/sdk'

export interface UseSorobanResurrectOptions {
  rpcUrl: string
  networkPassphrase: string
  allowHttp?: boolean
  preFlight?: PreFlightConfig
  onError?: (error: Error) => void
}

export interface UseSorobanResurrectReturn {
  executeWithRestore: (txXDR: string, signTransaction: (xdr: string) => Promise<string>) => Promise<ExecutionResult>
  checkTransaction: (txXDR: string) => Promise<{
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

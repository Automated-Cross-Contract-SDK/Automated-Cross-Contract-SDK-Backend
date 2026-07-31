import type { SorobanResurrectConfig, ArchivedKey, ExecutionResult, PreFlightConfig } from '@soroban-resurrect/sdk'

export interface UseSorobanResurrectOptions {
  rpcUrl: string | string[]
  networkPassphrase: string
  allowHttp?: boolean
  timeout?: number
  preFlight?: PreFlightConfig
  onError?: (error: Error) => void
}

export interface UseSorobanResurrectReturn {
  executeWithRestore: (txXDR: string, signTransaction: (xdr: string) => Promise<string>) => Promise<ExecutionResult>
  checkTransaction: (txXDR: string) => Promise<{
    needsRestoration: boolean
    archivedKeys: ArchivedKey[]
  }>
  isChecking: import('vue').Ref<boolean>
  isExecuting: import('vue').Ref<boolean>
  lastResult: import('vue').Ref<ExecutionResult | null>
  error: import('vue').Ref<string | null>
  needsRestore: import('vue').Ref<boolean>
  archivedKeys: import('vue').Ref<ArchivedKey[]>
  reset: () => void
}

export interface SorobanResurrectPluginOptions extends UseSorobanResurrectOptions {}

export const SOROBAN_RESURRECT_INJECTION_KEY = Symbol('SorobanResurrect') as import('vue').InjectionKey<UseSorobanResurrectReturn>

import type { ArchivedKey, ExecutionResult, PreFlightConfig } from '@soroban-resurrect/sdk'

export interface UseSorobanResurrectOptions {
  rpcUrl: string | string[]
  networkPassphrase: string
  allowHttp?: boolean
  timeout?: number
  preFlight?: PreFlightConfig
  onError?: (error: Error) => void
}

export interface SorobanResurrectStores {
  isChecking: import('svelte/store').Readable<boolean>
  isExecuting: import('svelte/store').Readable<boolean>
  lastResult: import('svelte/store').Readable<ExecutionResult | null>
  error: import('svelte/store').Readable<string | null>
  needsRestore: import('svelte/store').Readable<boolean>
  archivedKeys: import('svelte/store').Readable<ArchivedKey[]>
  checkTransaction: (txXDR: string) => Promise<{ needsRestoration: boolean; archivedKeys: ArchivedKey[] }>
  executeWithRestore: (txXDR: string, signTransaction: (xdr: string) => Promise<string>) => Promise<ExecutionResult>
  reset: () => void
}

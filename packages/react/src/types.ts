import type { SorobanResurrectConfig, ArchivedKey, ExecutionResult, PreFlightConfig } from '@soroban-resurrect/sdk'

export interface SignOptions {
  networkPassphrase?: string
  address?: string
}

/**
 * Wallet-agnostic signer interface. Built-in implementations live in ./adapters.js
 * (FreighterAdapter, AlbedoAdapter, RabetAdapter, XBullAdapter, LobstrAdapter).
 */
export interface SorobanWalletAdapter {
  id: string
  name: string
  icon?: string
  isConnected(): boolean
  connect(): Promise<string>
  disconnect(): Promise<void>
  getNetwork(): Promise<{ networkPassphrase: string; networkUrl?: string }>
  signTransaction(xdr: string, opts?: SignOptions): Promise<string>
  isSupported(): boolean
}

/**
 * A signing strategy is either a full wallet adapter or a bare signing function,
 * so callers can inject multi-sig / hardware-wallet / custom key management flows.
 */
export type SigningStrategy = SorobanWalletAdapter | ((xdr: string, opts?: SignOptions) => Promise<string>)

export interface TransactionRecord {
  id: string
  originalTxHash?: string
  restoreTxHash?: string
  archivedKeys: ArchivedKey[]
  status: 'success' | 'failed'
  error?: string
  timestamp: number
  durationMs: number
}

export interface UseSorobanResurrectOptions<TSigner extends SigningStrategy = SigningStrategy> {
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
   * Wallet adapter or signing function used as the default signer when
   * `executeWithRestore` is called without an explicit `signTransaction` argument.
   */
  signingStrategy?: TSigner
  /**
   * Persist transaction history to localStorage under this key.
   * Pass `true` to use the default key, a string for a custom key, or omit/false to disable.
   */
  persistHistory?: boolean | string
}

export interface UseSorobanResurrectReturn<TSigner extends SigningStrategy = SigningStrategy> {
  executeWithRestore: (
    txXDR: string,
    signTransaction?: (xdr: string) => Promise<string>,
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
  /** The signing strategy passed via options, typed as-is for adapter-specific member access (e.g. `.disconnect()`). */
  signer: TSigner | undefined
  history: TransactionRecord[]
  clearHistory: () => void
}

export interface SorobanResurrectContextValue {
  resurrect: UseSorobanResurrectReturn | null
  config: SorobanResurrectConfig | null
}

/**
 * Wallet Adapter Contract
 *
 * Common interface implemented by every supported wallet integration
 * (Freighter, Albedo, Rabet, xBull, Lobstr, Ledger, ...) so callers can
 * connect and sign Soroban transactions without depending on any single
 * wallet's SDK.
 */

export type WalletConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

export interface SignTransactionOptions {
  /** Network passphrase the transaction was built for. */
  networkPassphrase?: string
  /** Public key to sign with, when a wallet exposes multiple accounts. */
  accountToSign?: string
}

export interface WalletConnectionResult {
  /** Public key (G...) of the connected account. */
  address: string
  /** Network identifier reported by the wallet, when available. */
  network?: string
}

export interface WalletNetworkChange {
  networkPassphrase?: string
  network?: string
}

export type ConnectionStatusListener = (status: WalletConnectionStatus, result?: WalletConnectionResult) => void
export type NetworkChangeListener = (change: WalletNetworkChange) => void

/** Adapter contract implemented by each supported wallet integration. */
export interface SorobanWalletAdapter {
  readonly id: string
  readonly name: string
  readonly icon?: string
  /** Whether this wallet's runtime (extension, bridge, hardware transport) is detectable in the current environment. */
  isAvailable(): Promise<boolean>
  connect(): Promise<WalletConnectionResult>
  disconnect(): Promise<void>
  /** Signs a base64-encoded transaction envelope XDR and returns the signed XDR. */
  signTransaction(xdr: string, opts?: SignTransactionOptions): Promise<string>
  /** Subscribes to connection status changes reported by this adapter. Returns an unsubscribe function. */
  onConnectionChange?(listener: ConnectionStatusListener): () => void
  /** Subscribes to network changes reported by this adapter. Returns an unsubscribe function. */
  onNetworkChange?(listener: NetworkChangeListener): () => void
  /**
   * Optional hook invoked when a pending connect() is abandoned (timeout or
   * explicit cancellation) so the adapter can release resources such as
   * iframes, popups, or bridge transports.
   */
  cancelConnect?(): void | Promise<void>
}

export type WalletAdapterErrorCode =
  | 'NOT_INSTALLED'
  | 'DEPENDENCY_NOT_INSTALLED'
  | 'CONNECTION_FAILED'
  | 'USER_REJECTED'
  | 'DEVICE_DISCONNECTED'
  | 'TIMEOUT'
  | 'CONNECTION_TIMEOUT'
  | 'INVALID_XDR'

/** Error raised by wallet adapters, with a stable `code` for programmatic handling. */
export class WalletAdapterError extends Error {
  constructor(
    message: string,
    public code: WalletAdapterErrorCode,
    public cause?: unknown,
  ) {
    super(message)
    this.name = 'WalletAdapterError'
  }
}

/**
 * Default time (ms) a wallet connect() may stay pending before WalletManager
 * rejects with a `CONNECTION_TIMEOUT` WalletAdapterError. Wallets that open an
 * iframe or modal (Rabet, WalletConnect) can otherwise hang forever when the
 * user never completes approval.
 */
export const DEFAULT_CONNECT_TIMEOUT_MS = 120_000

/**
 * Races a wallet connect() promise against a timeout. On timeout the adapter's
 * optional `cancelConnect()` hook is invoked so iframes/popups are torn down,
 * then a typed `WalletAdapterError('CONNECTION_TIMEOUT')` is thrown.
 */
export function withConnectTimeout<T>(
  promise: Promise<T>,
  adapter: Pick<SorobanWalletAdapter, 'name' | 'cancelConnect'>,
  timeoutMs: number = DEFAULT_CONNECT_TIMEOUT_MS,
): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return promise
  return new Promise<T>((resolve, reject) => {
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      try {
        void adapter.cancelConnect?.()
      } catch {
        // Cleanup failures must not mask the timeout error.
      }
      reject(
        new WalletAdapterError(
          `${adapter.name} connection timed out after ${timeoutMs}ms`,
          'CONNECTION_TIMEOUT',
        ),
      )
    }, timeoutMs)
    promise.then(
      (value) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

/** Maps a wallet SDK/extension error onto a WalletAdapterError using common rejection/not-installed phrasing. */
export function mapCommonWalletError(walletName: string, cause: unknown): WalletAdapterError {
  if (cause instanceof WalletAdapterError) return cause
  const message = cause instanceof Error ? cause.message : String(cause)
  if (/reject|denied|cancel|closed/i.test(message)) {
    return new WalletAdapterError(`User rejected the ${walletName} request`, 'USER_REJECTED', cause)
  }
  if (/not\s*installed|not\s*found|no\s*bridge|extension/i.test(message)) {
    return new WalletAdapterError(`${walletName} not detected`, 'NOT_INSTALLED', cause)
  }
  return new WalletAdapterError(`${walletName} request failed: ${message}`, 'CONNECTION_FAILED', cause)
}

/**
 * Lazily imports an optional wallet-SDK peer dependency so consumers only
 * pay for the wallets they actually use.
 */
export async function loadOptionalWalletDependency<T = unknown>(moduleName: string, adapterName: string): Promise<T> {
  try {
    return (await import(moduleName)) as T
  } catch (cause) {
    throw new WalletAdapterError(
      `${adapterName} requires the optional dependency "${moduleName}". Install it with: npm install ${moduleName}`,
      'DEPENDENCY_NOT_INSTALLED',
      cause,
    )
  }
}

/** Encodes raw bytes as base64, working in both browser (btoa) and Node (Buffer) runtimes without requiring @types/node. */
export function bytesToBase64(bytes: Uint8Array): string {
  const nodeBuffer = (globalThis as unknown as { Buffer?: { from(b: Uint8Array): { toString(enc: string): string } } }).Buffer
  if (nodeBuffer) {
    return nodeBuffer.from(bytes).toString('base64')
  }
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

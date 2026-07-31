/**
 * Wallet Adapter Contract
 *
 * Common interface implemented by every supported wallet integration
 * (xBull, Lobstr, WalletConnect, Ledger, ...) so callers can connect and
 * sign Soroban transactions without depending on any single wallet's SDK.
 */

export interface SignTransactionOptions {
  /** Network passphrase the transaction was built for. Required by adapters that must re-derive the signature base (e.g. hardware wallets). */
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

/** Adapter contract implemented by each supported wallet integration. */
export interface SorobanWalletAdapter {
  readonly id: string
  readonly name: string
  /** Whether this wallet's runtime (extension, bridge, hardware transport) is detectable in the current environment. */
  isAvailable(): Promise<boolean>
  connect(): Promise<WalletConnectionResult>
  disconnect(): Promise<void>
  /** Signs a base64-encoded transaction envelope XDR and returns the signed XDR. */
  signTransaction(xdr: string, opts?: SignTransactionOptions): Promise<string>
}

export type WalletAdapterErrorCode =
  | 'NOT_INSTALLED'
  | 'DEPENDENCY_NOT_INSTALLED'
  | 'CONNECTION_FAILED'
  | 'USER_REJECTED'
  | 'DEVICE_DISCONNECTED'
  | 'TIMEOUT'
  | 'SESSION_EXPIRED'
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
 * Lazily imports an optional wallet-SDK peer dependency. Wallet SDKs are not
 * bundled with @soroban-resurrect/sdk so consumers only pay for the wallets
 * they actually use. Throws a WalletAdapterError with an actionable install
 * hint if the package isn't installed.
 *
 * The module specifier is passed as a variable (not a string literal) so
 * bundlers and the TypeScript compiler don't try to statically resolve
 * these optional packages at build time.
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

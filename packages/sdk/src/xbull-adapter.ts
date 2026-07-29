/**
 * xBull Wallet Adapter
 *
 * Integrates xBull via the `@xbull/wallet-connect` SDK, which communicates
 * with the xBull extension/mobile app over its own postMessage bridge.
 */

import type { SorobanWalletAdapter, SignTransactionOptions, WalletConnectionResult } from './wallet-adapter.js'
import { WalletAdapterError, loadOptionalWalletDependency } from './wallet-adapter.js'

const MODULE_NAME = '@xbull/wallet-connect'

/** Minimal shape of the xBull bridge client used by this adapter. */
interface XBullClient {
  connect(): Promise<{ publicKey: string }>
  sign(xdr: string, opts?: { publicKey?: string; network?: string }): Promise<{ signedXdr: string }>
}

interface XBullModule {
  default: new () => XBullClient
}

export class XBullAdapter implements SorobanWalletAdapter {
  readonly id = 'xbull'
  readonly name = 'xBull'

  private client: XBullClient | null = null
  private connectedPublicKey: string | null = null

  async isAvailable(): Promise<boolean> {
    return typeof window !== 'undefined'
  }

  async connect(): Promise<WalletConnectionResult> {
    const client = await this.getClient()
    try {
      const { publicKey } = await client.connect()
      this.connectedPublicKey = publicKey
      return { address: publicKey }
    } catch (cause) {
      throw mapXBullError(cause)
    }
  }

  async disconnect(): Promise<void> {
    this.client = null
    this.connectedPublicKey = null
  }

  async signTransaction(xdr: string, opts?: SignTransactionOptions): Promise<string> {
    const client = await this.getClient()
    try {
      const { signedXdr } = await client.sign(xdr, {
        publicKey: opts?.accountToSign ?? this.connectedPublicKey ?? undefined,
        network: opts?.networkPassphrase,
      })
      return signedXdr
    } catch (cause) {
      throw mapXBullError(cause)
    }
  }

  private async getClient(): Promise<XBullClient> {
    if (this.client) return this.client
    const mod = await loadOptionalWalletDependency<XBullModule>(MODULE_NAME, this.name)
    this.client = new mod.default()
    return this.client
  }
}

/** Maps xBull bridge errors — including user rejections — onto WalletAdapterError. */
function mapXBullError(cause: unknown): WalletAdapterError {
  if (cause instanceof WalletAdapterError) return cause
  const message = cause instanceof Error ? cause.message : String(cause)
  if (/reject|denied|cancel/i.test(message)) {
    return new WalletAdapterError('User rejected the xBull request', 'USER_REJECTED', cause)
  }
  if (/not\s*installed|not\s*found|no\s*bridge/i.test(message)) {
    return new WalletAdapterError('xBull extension not detected', 'NOT_INSTALLED', cause)
  }
  return new WalletAdapterError(`xBull request failed: ${message}`, 'CONNECTION_FAILED', cause)
}

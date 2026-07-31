/**
 * Lobstr Wallet Adapter
 *
 * Integrates the Lobstr browser extension via `lobstr-wallet-sdk`.
 */

import type { SorobanWalletAdapter, SignTransactionOptions, WalletConnectionResult } from './wallet-adapter.js'
import { WalletAdapterError, loadOptionalWalletDependency } from './wallet-adapter.js'

const MODULE_NAME = 'lobstr-wallet-sdk'

/** Minimal shape of the Lobstr extension client used by this adapter. */
interface LobstrClient {
  getPublicKey(): Promise<string>
  signTransaction(xdr: string, opts?: { network?: string }): Promise<string>
  getNetwork?(): Promise<string>
}

interface LobstrModule {
  default: new () => LobstrClient
}

export class LobstrAdapter implements SorobanWalletAdapter {
  readonly id = 'lobstr'
  readonly name = 'Lobstr'

  private client: LobstrClient | null = null
  private connectedPublicKey: string | null = null

  async isAvailable(): Promise<boolean> {
    return typeof window !== 'undefined'
  }

  async connect(): Promise<WalletConnectionResult> {
    const client = await this.getClient()
    try {
      const publicKey = await client.getPublicKey()
      this.connectedPublicKey = publicKey
      const network = await this.detectNetwork(client)
      return { address: publicKey, network }
    } catch (cause) {
      throw mapLobstrError(cause)
    }
  }

  async disconnect(): Promise<void> {
    this.client = null
    this.connectedPublicKey = null
  }

  async signTransaction(xdr: string, opts?: SignTransactionOptions): Promise<string> {
    const client = await this.getClient()
    try {
      return await client.signTransaction(xdr, { network: opts?.networkPassphrase })
    } catch (cause) {
      throw mapLobstrError(cause)
    }
  }

  /** Detects the network the Lobstr extension is currently connected to, when the SDK exposes it. */
  private async detectNetwork(client: LobstrClient): Promise<string | undefined> {
    if (!client.getNetwork) return undefined
    try {
      return await client.getNetwork()
    } catch {
      return undefined
    }
  }

  private async getClient(): Promise<LobstrClient> {
    if (this.client) return this.client
    const mod = await loadOptionalWalletDependency<LobstrModule>(MODULE_NAME, this.name)
    this.client = new mod.default()
    return this.client
  }
}

/** Maps Lobstr extension errors — including user rejections — onto WalletAdapterError. */
function mapLobstrError(cause: unknown): WalletAdapterError {
  if (cause instanceof WalletAdapterError) return cause
  const message = cause instanceof Error ? cause.message : String(cause)
  if (/reject|denied|cancel/i.test(message)) {
    return new WalletAdapterError('User rejected the Lobstr request', 'USER_REJECTED', cause)
  }
  if (/not\s*installed|not\s*found|extension/i.test(message)) {
    return new WalletAdapterError('Lobstr extension not detected', 'NOT_INSTALLED', cause)
  }
  return new WalletAdapterError(`Lobstr request failed: ${message}`, 'CONNECTION_FAILED', cause)
}

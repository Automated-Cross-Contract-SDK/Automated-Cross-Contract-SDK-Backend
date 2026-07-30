/**
 * Lobstr Wallet Adapter
 *
 * Integrates the LOBSTR signer browser extension via its injected `window.lobstrApi` bridge.
 *
 * https://github.com/Lobstrco/lobstr-signer-extension
 */

import type { SorobanWalletAdapter, SignTransactionOptions, WalletConnectionResult } from '../types.js'
import { WalletAdapterError, mapCommonWalletError } from '../types.js'

interface LobstrApi {
  connect(): Promise<string>
  signTransaction(xdr: string, opts?: { networkPassphrase?: string }): Promise<string>
  getNetwork?(): Promise<string>
}

function getLobstr(): LobstrApi | undefined {
  return typeof window !== 'undefined' ? (window as unknown as { lobstrApi?: LobstrApi }).lobstrApi : undefined
}

export class LobstrAdapter implements SorobanWalletAdapter {
  readonly id = 'lobstr'
  readonly name = 'LOBSTR'

  private publicKey: string | null = null

  async isAvailable(): Promise<boolean> {
    return !!getLobstr()
  }

  async connect(): Promise<WalletConnectionResult> {
    const lobstr = getLobstr()
    if (!lobstr) throw new WalletAdapterError('LOBSTR signer extension not found', 'NOT_INSTALLED')
    try {
      const publicKey = await lobstr.connect()
      this.publicKey = publicKey
      const network = await this.safeGetNetwork(lobstr)
      return { address: publicKey, network }
    } catch (cause) {
      throw mapCommonWalletError(this.name, cause)
    }
  }

  async disconnect(): Promise<void> {
    this.publicKey = null
  }

  async signTransaction(xdr: string, opts?: SignTransactionOptions): Promise<string> {
    const lobstr = getLobstr()
    if (!lobstr) throw new WalletAdapterError('LOBSTR signer extension not found', 'NOT_INSTALLED')
    try {
      return await lobstr.signTransaction(xdr, { networkPassphrase: opts?.networkPassphrase })
    } catch (cause) {
      throw mapCommonWalletError(this.name, cause)
    }
  }

  private async safeGetNetwork(lobstr: LobstrApi): Promise<string | undefined> {
    if (!lobstr.getNetwork) return undefined
    try {
      return await lobstr.getNetwork()
    } catch {
      return undefined
    }
  }
}

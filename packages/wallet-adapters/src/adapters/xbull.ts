/**
 * xBull Wallet Adapter
 *
 * Integrates the xBull browser extension via its injected `window.xBullSDK` bridge.
 *
 * https://docs.xbull.app
 */

import type { SorobanWalletAdapter, SignTransactionOptions, WalletConnectionResult } from '../types.js'
import { WalletAdapterError, mapCommonWalletError } from '../types.js'

interface XBullSdk {
  connect(opts: { canRequestPublicKey: boolean; canRequestSign: boolean }): Promise<string[]>
  disconnect?(): Promise<void>
  sign(opts: { xdr: string; publicKeys?: string[]; network?: string }): Promise<string>
  getNetwork?(): Promise<{ network?: string; networkPassphrase?: string }>
}

function getXBull(): XBullSdk | undefined {
  return typeof window !== 'undefined' ? (window as unknown as { xBullSDK?: XBullSdk }).xBullSDK : undefined
}

export class XBullAdapter implements SorobanWalletAdapter {
  readonly id = 'xbull'
  readonly name = 'xBull'

  private publicKey: string | null = null

  async isAvailable(): Promise<boolean> {
    return !!getXBull()
  }

  async connect(): Promise<WalletConnectionResult> {
    const xBull = getXBull()
    if (!xBull) throw new WalletAdapterError('xBull extension not found', 'NOT_INSTALLED')
    try {
      const [publicKey] = await xBull.connect({ canRequestPublicKey: true, canRequestSign: true })
      this.publicKey = publicKey
      const network = await this.safeGetNetwork(xBull)
      return { address: publicKey, network }
    } catch (cause) {
      throw mapCommonWalletError(this.name, cause)
    }
  }

  async disconnect(): Promise<void> {
    await getXBull()
      ?.disconnect?.()
      .catch(() => undefined)
    this.publicKey = null
  }

  async signTransaction(xdr: string, opts?: SignTransactionOptions): Promise<string> {
    const xBull = getXBull()
    if (!xBull) throw new WalletAdapterError('xBull extension not found', 'NOT_INSTALLED')
    try {
      return await xBull.sign({
        xdr,
        publicKeys: this.publicKey ? [this.publicKey] : undefined,
        network: opts?.networkPassphrase,
      })
    } catch (cause) {
      throw mapCommonWalletError(this.name, cause)
    }
  }

  private async safeGetNetwork(xBull: XBullSdk): Promise<string | undefined> {
    try {
      const { network, networkPassphrase } = (await xBull.getNetwork?.()) ?? {}
      return networkPassphrase ?? network
    } catch {
      return undefined
    }
  }
}

/**
 * xBull Wallet Adapter
 *
 * Integrates the xBull browser extension via its injected `window.xBullSDK` bridge.
 * Supports both v1 API (default) and v2 API (via feature flag).
 *
 * https://docs.xbull.app
 */

import type { SorobanWalletAdapter, SignTransactionOptions, WalletConnectionResult } from '../types.js'
import { WalletAdapterError, mapCommonWalletError } from '../types.js'

/** Configuration for xBull adapter. */
export interface XBullAdapterConfig {
  /** Whether to use @xbull/wallet-sdk v2 API instead of v1. Defaults to false (v1). */
  useXBullV2?: boolean
}

// V1 API (current stable version)
interface XBullSdkV1 {
  connect(opts: { canRequestPublicKey: boolean; canRequestSign: boolean }): Promise<string[]>
  disconnect?(): Promise<void>
  sign(opts: { xdr: string; publicKeys?: string[]; network?: string }): Promise<string>
  getNetwork?(): Promise<{ network?: string; networkPassphrase?: string }>
}

// V2 API (new version - REQUIRES VERIFICATION)
// NOTE: The actual v2 API shape below is based on inferred patterns and MUST be verified
// against the real @xbull/wallet-sdk v2 documentation. The method names and signatures
// may differ from what's implemented here.
interface XBullSdkV2 {
  connect(): Promise<{ publicKey: string }>
  disconnect?(): Promise<void>
  sign(opts: { xdr: string; publicKey?: string; network?: string }): Promise<{ xdr: string }>
  getNetworkPassphrase?(): Promise<string>
}

function getXBullV1(): XBullSdkV1 | undefined {
  return typeof window !== 'undefined' ? (window as unknown as { xBullSDK?: XBullSdkV1 }).xBullSDK : undefined
}

export class XBullAdapter implements SorobanWalletAdapter {
  readonly id = 'xbull'
  readonly name = 'xBull'

  private publicKey: string | null = null
  private useV2: boolean

  constructor(config?: XBullAdapterConfig) {
    this.useV2 = config?.useXBullV2 ?? false
  }

  async isAvailable(): Promise<boolean> {
    if (this.useV2) {
      // V2 API availability check would differ - this is a placeholder
      // REQUIRES VERIFICATION: confirm how to detect v2 SDK availability
      return typeof window !== 'undefined'
    }
    return !!getXBullV1()
  }

  async connect(): Promise<WalletConnectionResult> {
    if (this.useV2) {
      return this.connectV2()
    }
    return this.connectV1()
  }

  async disconnect(): Promise<void> {
    if (this.useV2) {
      await this.disconnectV2()
    } else {
      await this.disconnectV1()
    }
    this.publicKey = null
  }

  async signTransaction(xdr: string, opts?: SignTransactionOptions): Promise<string> {
    if (this.useV2) {
      return this.signV2(xdr, opts)
    }
    return this.signV1(xdr, opts)
  }

  // ===== V1 API (stable, current default) =====

  private async connectV1(): Promise<WalletConnectionResult> {
    const xBull = getXBullV1()
    if (!xBull) throw new WalletAdapterError('xBull extension not found', 'NOT_INSTALLED')
    try {
      const [publicKey] = await xBull.connect({ canRequestPublicKey: true, canRequestSign: true })
      this.publicKey = publicKey
      const network = await this.safeGetNetworkV1(xBull)
      return { address: publicKey, network }
    } catch (cause) {
      throw mapCommonWalletError(this.name, cause)
    }
  }

  private async disconnectV1(): Promise<void> {
    await getXBullV1()
      ?.disconnect?.()
      .catch(() => undefined)
  }

  private async signV1(xdr: string, opts?: SignTransactionOptions): Promise<string> {
    const xBull = getXBullV1()
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

  private async safeGetNetworkV1(xBull: XBullSdkV1): Promise<string | undefined> {
    try {
      const { network, networkPassphrase } = (await xBull.getNetwork?.()) ?? {}
      return networkPassphrase ?? network
    } catch {
      return undefined
    }
  }

  // ===== V2 API (new version - REQUIRES REAL SDK VERIFICATION) =====
  // NOTE: The v2 implementation below is based on inferred patterns and placeholder
  // method signatures. The actual v2 SDK API must be verified against @xbull/wallet-sdk v2
  // documentation. Do not assume these method names/signatures are correct.

  private async connectV2(): Promise<WalletConnectionResult> {
    // REQUIRES VERIFICATION: How does v2 SDK handle connection?
    // This is a best-guess based on common SDK patterns.
    try {
      // Placeholder: actual v2 connection logic
      // const client = await this.getClientV2()
      // const result = await client.connect()
      // this.publicKey = result.publicKey
      throw new WalletAdapterError(
        'xBull v2 API requires verification - connect method not yet implemented',
        'CONNECTION_FAILED'
      )
    } catch (cause) {
      throw mapCommonWalletError(this.name, cause)
    }
  }

  private async disconnectV2(): Promise<void> {
    // REQUIRES VERIFICATION: Does v2 SDK have a disconnect method?
    // Placeholder implementation
    // const client = await this.getClientV2()
    // await client.disconnect?.()
  }

  private async signV2(xdr: string, opts?: SignTransactionOptions): Promise<string> {
    // REQUIRES VERIFICATION: What is v2's sign method signature?
    // Placeholder based on inferred pattern:
    // Expected: client.sign({ xdr, publicKey, network })
    // Returns: { xdr: signedXdr } or just signedXdr?
    try {
      // Placeholder: actual v2 sign logic
      // const client = await this.getClientV2()
      // const result = await client.sign({
      //   xdr,
      //   publicKey: opts?.accountToSign ?? this.publicKey ?? undefined,
      //   network: opts?.networkPassphrase,
      // })
      // return result.xdr ?? result
      throw new WalletAdapterError(
        'xBull v2 API requires verification - sign method not yet implemented',
        'CONNECTION_FAILED'
      )
    } catch (cause) {
      throw mapCommonWalletError(this.name, cause)
    }
  }

  // private async getClientV2(): Promise<XBullSdkV2> {
  //   // REQUIRES VERIFICATION: How is the v2 SDK imported/initialized?
  //   // Is it via @xbull/wallet-sdk npm package? window.xBullSDK?
  //   // What's the correct initialization pattern?
  //   throw new Error('v2 SDK client initialization not yet implemented')
  // }
}

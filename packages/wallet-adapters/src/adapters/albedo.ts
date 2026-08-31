/**
 * Albedo Wallet Adapter
 *
 * Integrates Albedo via the `albedo-wallet-sdk` npm package. Albedo has no
 * installable extension — it manages keys through a modal popup — so
 * `isAvailable()` only requires a browser environment.
 *
 * https://albedo.link/docs
 */

import type { SorobanWalletAdapter, SignTransactionOptions, WalletConnectionResult } from '../types.js'
import { mapCommonWalletError, loadOptionalWalletDependency } from '../types.js'

const MODULE_NAME = 'albedo-wallet-sdk'

interface AlbedoClient {
  publicKey(opts: { token?: string }): Promise<{ pubkey: string }>
  tx(opts: { xdr: string; pubkey?: string; network?: 'testnet' | 'public'; submit?: boolean }): Promise<{ signed_envelope_xdr: string }>
}

interface AlbedoModule {
  default: AlbedoClient
}

/** Known valid Stellar network passphrases. */
const VALID_NETWORK_PASSPHRASES = [
  'Public Global Stellar Network ; September 2015',
  'Test SDF Network ; September 2015',
]

/** Validates a network passphrase against known Stellar networks. */
function validateNetworkPassphrase(networkPassphrase: string): boolean {
  return VALID_NETWORK_PASSPHRASES.some(
    valid => valid.toLowerCase() === networkPassphrase.toLowerCase()
  )
}

/** Maps a full network passphrase onto Albedo's coarse testnet/public network selector. */
function toAlbedoNetwork(networkPassphrase?: string): 'testnet' | 'public' | undefined {
  if (!networkPassphrase) return undefined
  return /test/i.test(networkPassphrase) ? 'testnet' : 'public'
}

export class AlbedoAdapter implements SorobanWalletAdapter {
  readonly id = 'albedo'
  readonly name = 'Albedo'

  private publicKey: string | null = null
  private client: AlbedoClient | null = null

  async isAvailable(): Promise<boolean> {
    return typeof window !== 'undefined'
  }

  async connect(): Promise<WalletConnectionResult> {
    const albedo = await this.getClient()
    try {
      const { pubkey } = await albedo.publicKey({})
      this.publicKey = pubkey
      return { address: pubkey }
    } catch (cause) {
      throw mapCommonWalletError(this.name, cause)
    }
  }

  async disconnect(): Promise<void> {
    this.publicKey = null
  }

  async signTransaction(xdr: string, opts?: SignTransactionOptions): Promise<string> {
    const albedo = await this.getClient()
    try {
      // Validate networkPassphrase if provided
      if (opts?.networkPassphrase && !validateNetworkPassphrase(opts.networkPassphrase)) {
        throw new Error(`Invalid network passphrase: "${opts.networkPassphrase}"`)
      }
      const result = await albedo.tx({
        xdr,
        pubkey: opts?.accountToSign ?? this.publicKey ?? undefined,
        network: toAlbedoNetwork(opts?.networkPassphrase),
      })
      return result.signed_envelope_xdr
    } catch (cause) {
      throw mapCommonWalletError(this.name, cause)
    }
  }

  private async getClient(): Promise<AlbedoClient> {
    if (this.client) return this.client
    const mod = await loadOptionalWalletDependency<AlbedoModule>(MODULE_NAME, this.name)
    this.client = mod.default
    return this.client
  }
}

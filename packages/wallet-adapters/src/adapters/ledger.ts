/**
 * Ledger Hardware Wallet Adapter
 *
 * Integrates Ledger devices running the Stellar app via `@ledgerhq/hw-app-str`,
 * connecting over WebHID (falling back to WebUSB when unavailable).
 */

import { TransactionBuilder } from '@stellar/stellar-sdk'
import type { SorobanWalletAdapter, SignTransactionOptions, WalletConnectionResult } from '../types.js'
import { WalletAdapterError, loadOptionalWalletDependency, bytesToBase64 } from '../types.js'

const APP_MODULE_NAME = '@ledgerhq/hw-app-str'
const WEBHID_MODULE_NAME = '@ledgerhq/hw-transport-webhid'
const WEBUSB_MODULE_NAME = '@ledgerhq/hw-transport-webusb'

const DEFAULT_DERIVATION_PATH = "44'/148'/0'"

interface LedgerTransport {
  close(): Promise<void>
  on(event: 'disconnect', handler: (error: unknown) => void): void
}

interface StrApp {
  getPublicKey(path: string): Promise<{ publicKey: string }>
  signTransaction(path: string, signatureBase: Uint8Array): Promise<{ signature: Uint8Array }>
}

export interface LedgerAdapterConfig {
  /** BIP-44 derivation path for the Stellar app. Defaults to "44'/148'/0'". */
  derivationPath?: string
}

export class LedgerAdapter implements SorobanWalletAdapter {
  readonly id = 'ledger'
  readonly name = 'Ledger'

  private readonly derivationPath: string
  private transport: LedgerTransport | null = null
  private app: StrApp | null = null
  private publicKey: string | null = null
  private deviceDisconnected = false

  constructor(config: LedgerAdapterConfig = {}) {
    this.derivationPath = config.derivationPath ?? DEFAULT_DERIVATION_PATH
  }

  async isAvailable(): Promise<boolean> {
    if (typeof navigator === 'undefined') return false
    const nav = navigator as unknown as { hid?: unknown; usb?: unknown }
    return Boolean(nav.hid || nav.usb)
  }

  async connect(): Promise<WalletConnectionResult> {
    const app = await this.getApp()
    try {
      const { publicKey } = await app.getPublicKey(this.derivationPath)
      this.publicKey = publicKey
      return { address: publicKey }
    } catch (cause) {
      throw this.mapLedgerError(cause)
    }
  }

  async disconnect(): Promise<void> {
    if (this.transport) {
      await this.transport.close().catch(() => undefined)
    }
    this.transport = null
    this.app = null
    this.publicKey = null
  }

  async signTransaction(xdr: string, opts?: SignTransactionOptions): Promise<string> {
    if (!opts?.networkPassphrase) {
      throw new WalletAdapterError('Ledger signing requires opts.networkPassphrase', 'INVALID_XDR')
    }
    if (!this.publicKey) {
      throw new WalletAdapterError('Ledger not connected; call connect() first', 'CONNECTION_FAILED')
    }

    const app = await this.getApp()
    try {
      const tx = TransactionBuilder.fromXDR(xdr, opts.networkPassphrase)
      const signatureBase = tx.signatureBase() as unknown as Uint8Array
      // hw-app-str streams the signature base to the device in APDU chunks
      // and prompts the user to review + approve the transaction on-screen.
      const { signature } = await app.signTransaction(this.derivationPath, signatureBase)
      tx.addSignature(this.publicKey, bytesToBase64(signature))
      return tx.toXDR()
    } catch (cause) {
      throw this.mapLedgerError(cause)
    }
  }

  private async getApp(): Promise<StrApp> {
    if (this.app) return this.app
    const transport = await this.getTransport()
    const { default: Str } = await loadOptionalWalletDependency<{ default: new (transport: LedgerTransport) => StrApp }>(
      APP_MODULE_NAME,
      this.name,
    )
    this.app = new Str(transport)
    return this.app
  }

  private async getTransport(): Promise<LedgerTransport> {
    if (this.transport) return this.transport

    const transport = await this.openWebHidOrWebUsb()
    transport.on('disconnect', () => {
      this.deviceDisconnected = true
      this.transport = null
      this.app = null
    })
    this.transport = transport
    return transport
  }

  private async openWebHidOrWebUsb(): Promise<LedgerTransport> {
    try {
      const { default: TransportWebHID } = await loadOptionalWalletDependency<{ default: { create(): Promise<LedgerTransport> } }>(
        WEBHID_MODULE_NAME,
        this.name,
      )
      return await TransportWebHID.create()
    } catch {
      const { default: TransportWebUSB } = await loadOptionalWalletDependency<{ default: { create(): Promise<LedgerTransport> } }>(
        WEBUSB_MODULE_NAME,
        this.name,
      )
      return await TransportWebUSB.create()
    }
  }

  /** Maps Ledger transport/device errors — including disconnection and on-device rejection — onto WalletAdapterError. */
  private mapLedgerError(cause: unknown): WalletAdapterError {
    if (cause instanceof WalletAdapterError) return cause
    if (this.deviceDisconnected) {
      return new WalletAdapterError('Ledger device disconnected', 'DEVICE_DISCONNECTED', cause)
    }
    const message = cause instanceof Error ? cause.message : String(cause)
    if (/0x6985|denied|reject/i.test(message)) {
      return new WalletAdapterError('Transaction rejected on Ledger device', 'USER_REJECTED', cause)
    }
    if (/disconnect/i.test(message)) {
      return new WalletAdapterError('Ledger device disconnected', 'DEVICE_DISCONNECTED', cause)
    }
    return new WalletAdapterError(`Ledger request failed: ${message}`, 'CONNECTION_FAILED', cause)
  }
}

/**
 * Rabet Wallet Adapter
 *
 * Supports both the Rabet browser extension (`window.rabet`) and the
 * iframe-embedded wallet fallback for browsers without the extension
 * installed, communicating over `postMessage`.
 *
 * https://docs.rabet.io
 */

import type { SorobanWalletAdapter, SignTransactionOptions, WalletConnectionResult } from '../types.js'
import { WalletAdapterError, mapCommonWalletError } from '../types.js'

const IFRAME_ID = 'soroban-resurrect-rabet-iframe'
const IFRAME_SRC = 'https://app.rabet.io/iframe'

interface RabetExtension {
  connect(): Promise<{ publicKey: string; error?: string }>
  disconnect?(): Promise<void>
  sign(xdr: string, network?: string): Promise<{ xdr: string; error?: string }>
}

function getExtension(): RabetExtension | undefined {
  return typeof window !== 'undefined' ? (window as unknown as { rabet?: RabetExtension }).rabet : undefined
}

interface IframeMessage {
  requestId: string
  result?: unknown
  error?: string
}

export class RabetAdapter implements SorobanWalletAdapter {
  readonly id = 'rabet'
  readonly name = 'Rabet'

  private mode: 'extension' | 'iframe' | null = null
  private publicKey: string | null = null
  private iframe: HTMLIFrameElement | null = null
  private messageHandler: ((event: MessageEvent) => void) | null = null

  async isAvailable(): Promise<boolean> {
    return typeof window !== 'undefined'
  }

  async connect(): Promise<WalletConnectionResult> {
    if (getExtension()) return this.connectViaExtension()
    return this.connectViaIframe()
  }

  async disconnect(): Promise<void> {
    if (this.mode === 'extension') {
      await getExtension()
        ?.disconnect?.()
        .catch(() => undefined)
    } else if (this.mode === 'iframe') {
      this.teardownIframe()
    }
    this.mode = null
    this.publicKey = null
  }

  async signTransaction(xdr: string, opts?: SignTransactionOptions): Promise<string> {
    if (this.mode === 'extension') {
      const extension = getExtension()
      if (!extension) throw new WalletAdapterError('Rabet extension not found', 'NOT_INSTALLED')
      try {
        const { xdr: signedXdr, error } = await extension.sign(xdr, opts?.networkPassphrase)
        if (error) throw new Error(error)
        return signedXdr
      } catch (cause) {
        throw mapCommonWalletError(this.name, cause)
      }
    }
    if (this.mode === 'iframe') {
      try {
        const { xdr: signedXdr } = await this.postToIframe<{ xdr: string }>({
          type: 'sign',
          xdr,
          publicKey: opts?.accountToSign ?? this.publicKey,
          network: opts?.networkPassphrase,
        })
        return signedXdr
      } catch (cause) {
        throw mapCommonWalletError(this.name, cause)
      }
    }
    throw new WalletAdapterError('Rabet not connected; call connect() first', 'CONNECTION_FAILED')
  }

  private async connectViaExtension(): Promise<WalletConnectionResult> {
    const extension = getExtension()
    if (!extension) throw new WalletAdapterError('Rabet extension not found', 'NOT_INSTALLED')
    try {
      const { publicKey, error } = await extension.connect()
      if (error) throw new Error(error)
      this.mode = 'extension'
      this.publicKey = publicKey
      return { address: publicKey }
    } catch (cause) {
      throw mapCommonWalletError(this.name, cause)
    }
  }

  private async connectViaIframe(): Promise<WalletConnectionResult> {
    this.mode = 'iframe'
    try {
      const { publicKey } = await this.postToIframe<{ publicKey: string }>({ type: 'connect' })
      this.publicKey = publicKey
      return { address: publicKey }
    } catch (cause) {
      this.teardownIframe()
      this.mode = null
      throw mapCommonWalletError(this.name, cause)
    }
  }

  private getOrCreateIframe(): HTMLIFrameElement {
    if (this.iframe) return this.iframe
    let iframe = document.getElementById(IFRAME_ID) as HTMLIFrameElement | null
    if (!iframe) {
      iframe = document.createElement('iframe')
      iframe.id = IFRAME_ID
      iframe.src = IFRAME_SRC
      iframe.style.display = 'none'
      document.body.appendChild(iframe)
    }
    this.iframe = iframe
    return iframe
  }

  private postToIframe<T>(message: Record<string, unknown>): Promise<T> {
    const iframe = this.getOrCreateIframe()
    return new Promise((resolve, reject) => {
      const requestId = `rabet-${Math.random().toString(36).slice(2)}`
      const handler = (event: MessageEvent) => {
        if (event.source !== iframe.contentWindow) return
        const data = event.data as IframeMessage
        if (!data || data.requestId !== requestId) return
        window.removeEventListener('message', handler)
        if (data.error) reject(new Error(data.error))
        else resolve(data.result as T)
      }
      window.addEventListener('message', handler)
      this.messageHandler = handler
      iframe.contentWindow?.postMessage({ ...message, requestId }, '*')
    })
  }

  private teardownIframe(): void {
    if (this.messageHandler) {
      window.removeEventListener('message', this.messageHandler)
      this.messageHandler = null
    }
    if (this.iframe) {
      this.iframe.remove()
      this.iframe = null
    }
  }
}

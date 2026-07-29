/**
 * WalletConnect v2 Adapter
 *
 * Integrates WalletConnect v2 via `@walletconnect/web3wallet`, using CAIP-2
 * chain ids and CAIP-10 accounts to negotiate a session scoped to Soroban
 * transaction signing. Pairing is initiated via a URI that mobile wallets
 * scan as a QR code (rendered through the optional `@walletconnect/modal`
 * package, or handed back via `onPairingUri` for custom UI).
 */

import type { SorobanWalletAdapter, SignTransactionOptions, WalletConnectionResult } from './wallet-adapter.js'
import { WalletAdapterError, loadOptionalWalletDependency } from './wallet-adapter.js'

const WEB3WALLET_MODULE_NAME = '@walletconnect/web3wallet'
const CORE_MODULE_NAME = '@walletconnect/core'
const QR_MODAL_MODULE_NAME = '@walletconnect/modal'

/** CAIP-2 namespace and chain ids for the Stellar/Soroban networks. */
export const STELLAR_CAIP2_NAMESPACE = 'stellar'
export const STELLAR_MAINNET_CHAIN_ID = 'stellar:pubnet'
export const STELLAR_TESTNET_CHAIN_ID = 'stellar:testnet'

/** JSON-RPC methods and events exposed to the wallet for Soroban session requests. */
export const SOROBAN_WC_METHODS = ['stellar_signXDR', 'stellar_signAndSubmitXDR'] as const
export const SOROBAN_WC_EVENTS = ['accountsChanged', 'chainChanged'] as const

export interface WalletMetadata {
  name: string
  description: string
  url: string
  icons: string[]
}

export interface WalletConnectAdapterConfig {
  projectId: string
  metadata: WalletMetadata
  /** CAIP-2 chain id to request. Defaults to STELLAR_MAINNET_CHAIN_ID. */
  chainId?: string
  /** Show the official WalletConnect QR modal when pairing. Defaults to true. */
  showQrModal?: boolean
  /** Called with the pairing URI; useful for custom QR rendering when showQrModal is false. */
  onPairingUri?: (uri: string) => void
}

interface SessionProposal {
  id: number
  params: unknown
}

interface SessionNamespace {
  accounts: string[]
  methods: string[]
  events: string[]
}

interface WalletSession {
  topic: string
  namespaces: Record<string, SessionNamespace>
}

interface QrModal {
  openModal(opts: { uri: string }): Promise<void>
  closeModal(): void
}

interface Web3WalletClient {
  core: { pairing: { create(): Promise<{ uri: string; topic: string }> } }
  on(event: 'session_proposal', handler: (proposal: SessionProposal) => void): void
  approveSession(params: { id: number; namespaces: Record<string, SessionNamespace & { chains: string[] }> }): Promise<WalletSession>
  rejectSession(params: { id: number; reason: { code: number; message: string } }): Promise<void>
  disconnectSession(params: { topic: string; reason: { code: number; message: string } }): Promise<void>
  request<T>(params: { topic: string; chainId: string; request: { method: string; params: unknown } }): Promise<T>
}

/** Wallet adapter for WalletConnect v2, scoped to Soroban transaction signing. */
export class WalletConnectAdapter implements SorobanWalletAdapter {
  readonly id = 'walletconnect'
  readonly name = 'WalletConnect'

  private readonly chainId: string
  private client: Web3WalletClient | null = null
  private session: WalletSession | null = null
  private qrModal: QrModal | null = null

  constructor(private readonly config: WalletConnectAdapterConfig) {
    this.chainId = config.chainId ?? STELLAR_MAINNET_CHAIN_ID
  }

  async isAvailable(): Promise<boolean> {
    // WalletConnect works cross-platform via the relay network + QR pairing.
    return true
  }

  async connect(): Promise<WalletConnectionResult> {
    const client = await this.getClient()
    try {
      const { uri, topic } = await client.core.pairing.create()
      await this.showPairingUri(uri)

      const session = await this.awaitSessionApproval(client, topic)
      this.session = session

      const address = firstStellarAddress(session)
      return { address, network: this.chainId }
    } catch (cause) {
      throw mapWalletConnectError(cause)
    } finally {
      this.qrModal?.closeModal()
    }
  }

  async disconnect(): Promise<void> {
    if (this.client && this.session) {
      await this.client
        .disconnectSession({ topic: this.session.topic, reason: { code: 6000, message: 'User disconnected' } })
        .catch(() => undefined)
    }
    this.session = null
  }

  async signTransaction(xdr: string, opts?: SignTransactionOptions): Promise<string> {
    if (!this.client || !this.session) {
      throw new WalletAdapterError('WalletConnect session not established; call connect() first', 'CONNECTION_FAILED')
    }
    try {
      return await this.client.request<string>({
        topic: this.session.topic,
        chainId: this.chainId,
        request: { method: 'stellar_signXDR', params: { xdr, address: opts?.accountToSign } },
      })
    } catch (cause) {
      throw mapWalletConnectError(cause)
    }
  }

  private async showPairingUri(uri: string): Promise<void> {
    if (this.config.showQrModal === false) {
      this.config.onPairingUri?.(uri)
      return
    }
    try {
      const { WalletConnectModal } = await loadOptionalWalletDependency<{
        WalletConnectModal: new (opts: { projectId: string; chains: string[] }) => QrModal
      }>(QR_MODAL_MODULE_NAME, this.name)
      this.qrModal = new WalletConnectModal({ projectId: this.config.projectId, chains: [this.chainId] })
      await this.qrModal.openModal({ uri })
    } finally {
      this.config.onPairingUri?.(uri)
    }
  }

  private awaitSessionApproval(client: Web3WalletClient, _pairingTopic: string): Promise<WalletSession> {
    return new Promise((resolve, reject) => {
      client.on('session_proposal', (proposal) => {
        client
          .approveSession({
            id: proposal.id,
            namespaces: {
              [STELLAR_CAIP2_NAMESPACE]: {
                chains: [this.chainId],
                methods: [...SOROBAN_WC_METHODS],
                events: [...SOROBAN_WC_EVENTS],
                accounts: [],
              },
            },
          })
          .then(resolve)
          .catch(async (cause) => {
            await client.rejectSession({ id: proposal.id, reason: { code: 5000, message: 'User rejected' } })
            reject(cause)
          })
      })
    })
  }

  private async getClient(): Promise<Web3WalletClient> {
    if (this.client) return this.client
    const [{ Core }, { Web3Wallet }] = await Promise.all([
      loadOptionalWalletDependency<{ Core: new (opts: { projectId: string }) => unknown }>(CORE_MODULE_NAME, this.name),
      loadOptionalWalletDependency<{ Web3Wallet: { init(opts: { core: unknown; metadata: WalletMetadata }): Promise<Web3WalletClient> } }>(
        WEB3WALLET_MODULE_NAME,
        this.name,
      ),
    ])
    const core = new Core({ projectId: this.config.projectId })
    this.client = await Web3Wallet.init({ core, metadata: this.config.metadata })
    return this.client
  }
}

/** Extracts the first Stellar address from a session's CAIP-10 accounts (`stellar:pubnet:G...`). */
function firstStellarAddress(session: WalletSession): string {
  const caip10 = session.namespaces[STELLAR_CAIP2_NAMESPACE]?.accounts[0]
  if (!caip10) {
    throw new WalletAdapterError('WalletConnect session has no Stellar accounts', 'CONNECTION_FAILED')
  }
  const address = caip10.split(':')[2]
  if (!address) {
    throw new WalletAdapterError(`Malformed CAIP-10 account: ${caip10}`, 'CONNECTION_FAILED')
  }
  return address
}

/** Maps WalletConnect session/request errors — including rejections and expiry — onto WalletAdapterError. */
function mapWalletConnectError(cause: unknown): WalletAdapterError {
  if (cause instanceof WalletAdapterError) return cause
  const message = cause instanceof Error ? cause.message : String(cause)
  if (/reject|denied|declin/i.test(message)) {
    return new WalletAdapterError('User rejected the WalletConnect request', 'USER_REJECTED', cause)
  }
  if (/expire/i.test(message)) {
    return new WalletAdapterError('WalletConnect session expired', 'SESSION_EXPIRED', cause)
  }
  if (/timeout/i.test(message)) {
    return new WalletAdapterError('WalletConnect request timed out', 'TIMEOUT', cause)
  }
  return new WalletAdapterError(`WalletConnect request failed: ${message}`, 'CONNECTION_FAILED', cause)
}

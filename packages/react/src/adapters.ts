import type { SorobanWalletAdapter, SignOptions } from './types.js'

function getGlobal<T = any>(key: string): T | undefined {
  return typeof globalThis !== 'undefined' ? (globalThis as any)[key] : undefined
}

/** https://docs.freighter.app */
export class FreighterAdapter implements SorobanWalletAdapter {
  readonly id = 'freighter'
  readonly name = 'Freighter'
  readonly icon?: string

  isSupported(): boolean {
    return !!getGlobal('freighterApi')
  }

  isConnected(): boolean {
    return !!getGlobal('freighterApi')
  }

  async connect(): Promise<string> {
    const api = getGlobal<any>('freighterApi')
    if (!api) throw new Error('Freighter extension not found')
    await api.requestAccess?.()
    const { address } = await api.getAddress()
    return address
  }

  async disconnect(): Promise<void> {
    // Freighter has no explicit disconnect API; access is revoked from the extension.
  }

  async getNetwork(): Promise<{ networkPassphrase: string; networkUrl?: string }> {
    const api = getGlobal<any>('freighterApi')
    if (!api) throw new Error('Freighter extension not found')
    const details = await api.getNetworkDetails()
    return { networkPassphrase: details.networkPassphrase, networkUrl: details.networkUrl }
  }

  async signTransaction(xdr: string, opts?: SignOptions): Promise<string> {
    const api = getGlobal<any>('freighterApi')
    if (!api) throw new Error('Freighter extension not found')
    const { signedTxXdr } = await api.signTransaction(xdr, {
      networkPassphrase: opts?.networkPassphrase,
      address: opts?.address,
    })
    return signedTxXdr
  }
}

/** https://albedo.link/docs */
export class AlbedoAdapter implements SorobanWalletAdapter {
  readonly id = 'albedo'
  readonly name = 'Albedo'
  readonly icon?: string
  #publicKey: string | undefined

  isSupported(): boolean {
    return !!getGlobal('albedo')
  }

  isConnected(): boolean {
    return !!this.#publicKey
  }

  async connect(): Promise<string> {
    const albedo = getGlobal<any>('albedo')
    if (!albedo) throw new Error('Albedo is not available')
    const { pubkey } = await albedo.publicKey({})
    this.#publicKey = pubkey
    return pubkey
  }

  async disconnect(): Promise<void> {
    this.#publicKey = undefined
  }

  async getNetwork(): Promise<{ networkPassphrase: string; networkUrl?: string }> {
    throw new Error('Albedo does not expose network details; pass networkPassphrase explicitly')
  }

  async signTransaction(xdr: string, opts?: SignOptions): Promise<string> {
    const albedo = getGlobal<any>('albedo')
    if (!albedo) throw new Error('Albedo is not available')
    const { signed_envelope_xdr: signedXdr } = await albedo.tx({
      xdr,
      pubkey: opts?.address ?? this.#publicKey,
      network: opts?.networkPassphrase,
    })
    return signedXdr
  }
}

/** https://docs.rabet.io */
export class RabetAdapter implements SorobanWalletAdapter {
  readonly id = 'rabet'
  readonly name = 'Rabet'
  readonly icon?: string
  #publicKey: string | undefined

  isSupported(): boolean {
    return !!getGlobal('rabet')
  }

  isConnected(): boolean {
    return !!this.#publicKey
  }

  async connect(): Promise<string> {
    const rabet = getGlobal<any>('rabet')
    if (!rabet) throw new Error('Rabet extension not found')
    const { publicKey } = await rabet.connect()
    this.#publicKey = publicKey
    return publicKey
  }

  async disconnect(): Promise<void> {
    const rabet = getGlobal<any>('rabet')
    await rabet?.disconnect?.()
    this.#publicKey = undefined
  }

  async getNetwork(): Promise<{ networkPassphrase: string; networkUrl?: string }> {
    const rabet = getGlobal<any>('rabet')
    if (!rabet) throw new Error('Rabet extension not found')
    const { network, networkPassphrase, networkUrl } = await rabet.getNetwork()
    return { networkPassphrase: networkPassphrase ?? network, networkUrl }
  }

  async signTransaction(xdr: string, opts?: SignOptions): Promise<string> {
    const rabet = getGlobal<any>('rabet')
    if (!rabet) throw new Error('Rabet extension not found')
    const { xdr: signedXdr } = await rabet.sign(xdr, opts?.networkPassphrase)
    return signedXdr
  }
}

/** https://docs.xbull.app */
export class XBullAdapter implements SorobanWalletAdapter {
  readonly id = 'xbull'
  readonly name = 'xBull'
  readonly icon?: string
  #publicKey: string | undefined

  isSupported(): boolean {
    return !!getGlobal('xBullSDK')
  }

  isConnected(): boolean {
    return !!this.#publicKey
  }

  async connect(): Promise<string> {
    const xBull = getGlobal<any>('xBullSDK')
    if (!xBull) throw new Error('xBull extension not found')
    const [publicKey] = await xBull.connect({ canRequestPublicKey: true, canRequestSign: true })
    this.#publicKey = publicKey
    return publicKey
  }

  async disconnect(): Promise<void> {
    const xBull = getGlobal<any>('xBullSDK')
    await xBull?.disconnect?.()
    this.#publicKey = undefined
  }

  async getNetwork(): Promise<{ networkPassphrase: string; networkUrl?: string }> {
    const xBull = getGlobal<any>('xBullSDK')
    if (!xBull) throw new Error('xBull extension not found')
    const { network, networkPassphrase, networkUrl } = await xBull.getNetwork()
    return { networkPassphrase: networkPassphrase ?? network, networkUrl }
  }

  async signTransaction(xdr: string, opts?: SignOptions): Promise<string> {
    const xBull = getGlobal<any>('xBullSDK')
    if (!xBull) throw new Error('xBull extension not found')
    return xBull.sign({
      xdr,
      publicKeys: this.#publicKey ? [this.#publicKey] : undefined,
      network: opts?.networkPassphrase,
    })
  }
}

/** https://github.com/Lobstrco/lobstr-signer-extension */
export class LobstrAdapter implements SorobanWalletAdapter {
  readonly id = 'lobstr'
  readonly name = 'LOBSTR'
  readonly icon?: string
  #publicKey: string | undefined

  isSupported(): boolean {
    return !!getGlobal('lobstrApi')
  }

  isConnected(): boolean {
    return !!this.#publicKey
  }

  async connect(): Promise<string> {
    const lobstr = getGlobal<any>('lobstrApi')
    if (!lobstr) throw new Error('LOBSTR signer extension not found')
    const publicKey = await lobstr.connect()
    this.#publicKey = publicKey
    return publicKey
  }

  async disconnect(): Promise<void> {
    this.#publicKey = undefined
  }

  async getNetwork(): Promise<{ networkPassphrase: string; networkUrl?: string }> {
    throw new Error('LOBSTR does not expose network details; pass networkPassphrase explicitly')
  }

  async signTransaction(xdr: string, opts?: SignOptions): Promise<string> {
    const lobstr = getGlobal<any>('lobstrApi')
    if (!lobstr) throw new Error('LOBSTR signer extension not found')
    return lobstr.signTransaction(xdr, { networkPassphrase: opts?.networkPassphrase })
  }
}

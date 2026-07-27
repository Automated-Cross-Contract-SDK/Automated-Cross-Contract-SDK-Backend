import { SorobanRpc } from '@stellar/stellar-sdk'

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface ProtocolSupport {
  supported: boolean
  xdrVariant: 'v20' | 'v21' | 'v22' | 'unknown'
  notes?: string
}

export interface ServerVersionInfo {
  protocolVersion: number
  coreVersion?: string
  captiveCoreVersion?: string
  horizonVersion?: string
  xdrVariant: 'v20' | 'v21' | 'v22' | 'unknown'
  supported: boolean
  rawResponse?: unknown
}

export interface XdrEncodingOptions {
  useBase64?: boolean
  strictMode?: boolean
  protocolVersion: number
}

// ---------------------------------------------------------------------------
// Protocol compatibility matrix
// ---------------------------------------------------------------------------

export const PROTOCOL_COMPATIBILITY_MATRIX: Record<number, ProtocolSupport> = {
  20: { supported: true, xdrVariant: 'v20', notes: 'Initial Soroban release' },
  21: { supported: true, xdrVariant: 'v21', notes: 'Contract auth improvements' },
  22: { supported: true, xdrVariant: 'v22', notes: 'Current mainnet protocol' },
}

export const MIN_SUPPORTED_PROTOCOL = 20
export const MAX_SUPPORTED_PROTOCOL = 22

// ---------------------------------------------------------------------------
// VersionNegotiator
// ---------------------------------------------------------------------------

type LogFn = (level: 'info' | 'warn' | 'error', msg: string, data?: unknown) => void

export class VersionNegotiator {
  private cachedVersionInfo: ServerVersionInfo | null = null
  private readonly onLog: LogFn

  constructor(onLog: LogFn) {
    this.onLog = onLog
  }

  /**
   * Query the RPC server for its version information, validate the protocol
   * version against the compatibility matrix, and cache the result.
   *
   * Gracefully handles older nodes that do not expose `getVersionInfo` by
   * falling back to protocol 20.
   */
  async negotiate(server: SorobanRpc.Server): Promise<ServerVersionInfo> {
    let rawResponse: unknown
    let protocolVersion: number

    try {
      // `getVersionInfo` was introduced in a later SDK/node version; guard
      // against its absence on older nodes.
      const getVersionInfo = (server as unknown as Record<string, unknown>)['getVersionInfo']
      if (typeof getVersionInfo !== 'function') {
        this.onLog(
          'warn',
          'RPC server does not expose getVersionInfo — falling back to protocol 20',
        )
        protocolVersion = MIN_SUPPORTED_PROTOCOL
        rawResponse = undefined
      } else {
        rawResponse = await (server as any).getVersionInfo()
        protocolVersion = this.parseProtocolVersion(rawResponse)
      }
    } catch (err) {
      this.onLog(
        'warn',
        `getVersionInfo call failed — falling back to protocol 20: ${err instanceof Error ? err.message : String(err)}`,
        err,
      )
      protocolVersion = MIN_SUPPORTED_PROTOCOL
      rawResponse = undefined
    }

    // Bounds checking
    if (protocolVersion < MIN_SUPPORTED_PROTOCOL) {
      const msg = `Unsupported Soroban protocol version ${protocolVersion}. Minimum supported: ${MIN_SUPPORTED_PROTOCOL}`
      this.onLog('error', msg, { protocolVersion })
      throw Object.assign(new Error(msg), { code: 'UNSUPPORTED_PROTOCOL' })
    }

    if (protocolVersion > MAX_SUPPORTED_PROTOCOL) {
      this.onLog(
        'warn',
        `Protocol version ${protocolVersion} is newer than max tested (${MAX_SUPPORTED_PROTOCOL}). Proceeding — behavior may vary.`,
        { protocolVersion },
      )
    }

    const matrixEntry = PROTOCOL_COMPATIBILITY_MATRIX[protocolVersion]
    const xdrVariant: ServerVersionInfo['xdrVariant'] = matrixEntry?.xdrVariant ?? 'unknown'
    const supported = matrixEntry?.supported ?? false

    const versionInfo: ServerVersionInfo = {
      protocolVersion,
      xdrVariant,
      supported,
      rawResponse,
      ...this.extractCoreVersions(rawResponse),
    }

    this.onLog('info', `Negotiated RPC protocol version ${protocolVersion} (${xdrVariant})`, {
      protocolVersion,
      xdrVariant,
      supported,
    })

    this.cachedVersionInfo = versionInfo
    return versionInfo
  }

  /** Return the cached version info from the last successful `negotiate` call. */
  getVersionInfo(): ServerVersionInfo | null {
    return this.cachedVersionInfo
  }

  /**
   * Return XDR encoding hints appropriate for the given protocol variant.
   * These are stored for future use and do not currently modify live XDR calls.
   */
  adaptXdrEncoding(variant: 'v20' | 'v21' | 'v22' | 'unknown'): XdrEncodingOptions {
    switch (variant) {
      case 'v20':
        return { useBase64: true, strictMode: true, protocolVersion: 20 }
      case 'v21':
        return { useBase64: true, strictMode: true, protocolVersion: 21 }
      case 'v22':
        return { useBase64: true, strictMode: false, protocolVersion: 22 }
      default:
        // Unknown variant — conservative defaults
        return { useBase64: true, strictMode: true, protocolVersion: MIN_SUPPORTED_PROTOCOL }
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private parseProtocolVersion(raw: unknown): number {
    if (raw === null || raw === undefined) {
      return MIN_SUPPORTED_PROTOCOL
    }

    if (typeof raw === 'object') {
      const obj = raw as Record<string, unknown>

      // Stellar SDK ≥ 11 returns { protocolVersion: number, ... }
      if (typeof obj['protocolVersion'] === 'number') {
        return obj['protocolVersion']
      }
      // Some versions expose it as a string
      if (typeof obj['protocolVersion'] === 'string') {
        const parsed = parseInt(obj['protocolVersion'], 10)
        if (!isNaN(parsed)) return parsed
      }

      // Fallback: look for nested version fields used by some node builds
      if (typeof obj['version'] === 'string') {
        const parsed = parseInt(obj['version'], 10)
        if (!isNaN(parsed)) return parsed
      }
    }

    this.onLog('warn', 'Could not parse protocol version from getVersionInfo response — falling back to protocol 20', { raw })
    return MIN_SUPPORTED_PROTOCOL
  }

  private extractCoreVersions(raw: unknown): Partial<Pick<ServerVersionInfo, 'coreVersion' | 'captiveCoreVersion' | 'horizonVersion'>> {
    if (raw === null || raw === undefined || typeof raw !== 'object') {
      return {}
    }

    const obj = raw as Record<string, unknown>
    const result: Partial<Pick<ServerVersionInfo, 'coreVersion' | 'captiveCoreVersion' | 'horizonVersion'>> = {}

    if (typeof obj['coreVersion'] === 'string') {
      result.coreVersion = obj['coreVersion']
    }
    if (typeof obj['captiveCoreVersion'] === 'string') {
      result.captiveCoreVersion = obj['captiveCoreVersion']
    }
    if (typeof obj['horizonVersion'] === 'string') {
      result.horizonVersion = obj['horizonVersion']
    }

    return result
  }
}

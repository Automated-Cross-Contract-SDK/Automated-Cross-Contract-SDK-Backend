/**
 * Versioned RPC response fixtures, one set per supported protocol line.
 *
 * Each entry mirrors the shape Stellar RPC returns for `getNetwork` and
 * `getHealth` on that protocol line, so tests can replay a known response
 * for every line the SDK claims to support.
 */

export const SUPPORTED_PROTOCOL_LINES = [20, 21, 22] as const

export type SupportedProtocolLine = (typeof SUPPORTED_PROTOCOL_LINES)[number]

export interface ProtocolLineFixture {
  protocolVersion: SupportedProtocolLine
  getNetwork: {
    passphrase: string
    protocolVersion: SupportedProtocolLine
    friendbotUrl?: string
  }
  getHealth: {
    status: 'healthy'
    latestLedger: number
    oldestLedger: number
    ledgerRetentionWindow: number
  }
}

const TESTNET_PASSPHRASE = 'Test SDF Network ; September 2015'
const TESTNET_FRIENDBOT = 'https://friendbot.stellar.org/'

export const PROTOCOL_LINE_FIXTURES: Record<SupportedProtocolLine, ProtocolLineFixture> = {
  20: {
    protocolVersion: 20,
    getNetwork: { passphrase: TESTNET_PASSPHRASE, protocolVersion: 20, friendbotUrl: TESTNET_FRIENDBOT },
    getHealth: { status: 'healthy', latestLedger: 1_000_000, oldestLedger: 1, ledgerRetentionWindow: 17280 },
  },
  21: {
    protocolVersion: 21,
    getNetwork: { passphrase: TESTNET_PASSPHRASE, protocolVersion: 21, friendbotUrl: TESTNET_FRIENDBOT },
    getHealth: { status: 'healthy', latestLedger: 1_500_000, oldestLedger: 1, ledgerRetentionWindow: 17280 },
  },
  22: {
    protocolVersion: 22,
    getNetwork: { passphrase: TESTNET_PASSPHRASE, protocolVersion: 22, friendbotUrl: TESTNET_FRIENDBOT },
    getHealth: { status: 'healthy', latestLedger: 2_000_000, oldestLedger: 1, ledgerRetentionWindow: 17280 },
  },
}

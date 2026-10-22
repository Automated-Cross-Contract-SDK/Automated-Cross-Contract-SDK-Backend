import { describe, it, expect } from 'vitest'
import {
  PROTOCOL_LINE_FIXTURES,
  SUPPORTED_PROTOCOL_LINES,
  type SupportedProtocolLine,
} from '../src/protocol-fixtures.js'

describe('protocol line fixtures', () => {
  it('has exactly one fixture per supported protocol line', () => {
    expect(Object.keys(PROTOCOL_LINE_FIXTURES).map(Number).sort()).toEqual([...SUPPORTED_PROTOCOL_LINES].sort())
  })

  it.each(SUPPORTED_PROTOCOL_LINES)('protocol %i fixture is self-consistent', line => {
    const fixture = PROTOCOL_LINE_FIXTURES[line]

    expect(fixture.protocolVersion).toBe(line)
    expect(fixture.getNetwork.protocolVersion).toBe(line)
    expect(fixture.getNetwork.passphrase.length).toBeGreaterThan(0)
  })

  it.each(SUPPORTED_PROTOCOL_LINES)('protocol %i getHealth fixture reports a healthy, ordered ledger range', line => {
    const { getHealth } = PROTOCOL_LINE_FIXTURES[line]

    expect(getHealth.status).toBe('healthy')
    expect(getHealth.oldestLedger).toBeLessThanOrEqual(getHealth.latestLedger)
    expect(getHealth.ledgerRetentionWindow).toBeGreaterThan(0)
  })

  it('keeps the testnet passphrase on the current protocol line', () => {
    const line: SupportedProtocolLine = 22

    expect(PROTOCOL_LINE_FIXTURES[line].getNetwork.passphrase).toBe('Test SDF Network ; September 2015')
  })
})

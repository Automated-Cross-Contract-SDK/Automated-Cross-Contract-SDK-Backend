import { describe, expect, it } from 'vitest';
import { MockRpcServer } from '../src/mock-rpc-server.js';
import { PROTOCOL_LINE_FIXTURES, SUPPORTED_PROTOCOL_LINES } from '../src/protocol-fixtures.js';

function serverFor(line: (typeof SUPPORTED_PROTOCOL_LINES)[number]): MockRpcServer {
  const fixture = PROTOCOL_LINE_FIXTURES[line];
  return new MockRpcServer({
    protocolVersion: line,
    networkPassphrase: fixture.getNetwork.passphrase,
    currentLedgerSeq: fixture.getHealth.latestLedger,
  });
}

describe('deterministic end-to-end runs against pinned protocol fixtures', () => {
  it.each(SUPPORTED_PROTOCOL_LINES)(
    'protocol %i: getNetwork reports the pinned line',
    async (line) => {
      const network = await serverFor(line).getNetwork();
      expect(network.protocolVersion).toBe(PROTOCOL_LINE_FIXTURES[line].getNetwork.protocolVersion);
      expect(network.passphrase).toBe(PROTOCOL_LINE_FIXTURES[line].getNetwork.passphrase);
    },
  );

  it.each(SUPPORTED_PROTOCOL_LINES)(
    'protocol %i: repeated runs produce identical responses',
    async (line) => {
      const run = async () => {
        const server = serverFor(line);
        return { network: await server.getNetwork(), stats: server.getStats() };
      };
      expect(await run()).toEqual(await run());
    },
  );

  it('distinguishes protocol lines so an upgrade cannot pass silently', async () => {
    const versions = await Promise.all(
      SUPPORTED_PROTOCOL_LINES.map(async (l) => (await serverFor(l).getNetwork()).protocolVersion),
    );
    expect(new Set(versions).size).toBe(SUPPORTED_PROTOCOL_LINES.length);
  });
});

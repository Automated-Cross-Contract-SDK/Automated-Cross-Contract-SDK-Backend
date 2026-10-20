import { describe, it, expect } from 'vitest';
import { MockRpcServer } from '../src/mock-rpc-server.js';

const DEFAULT_PASSPHRASE = 'Test SDF Network ; September 2015';

describe('local-network profile pinned to a protocol version', () => {
  it('reports the default passphrase and protocol version 22 when no profile is given', async () => {
    const server = new MockRpcServer();
    const info = await server.getNetwork();
    expect(info.passphrase).toBe(DEFAULT_PASSPHRASE);
    expect(info.protocolVersion).toBe(22);
  });

  it('reports a custom passphrase so a local profile can be pinned', async () => {
    const passphrase = 'Standalone Network ; February 2017';
    const server = new MockRpcServer({ networkPassphrase: passphrase });
    const info = await server.getNetwork();
    expect(info.passphrase).toBe(passphrase);
  });

  it('keeps the same pinned profile across repeated getNetwork calls', async () => {
    const server = new MockRpcServer({ networkPassphrase: 'Standalone Network ; February 2017' });
    const first = await server.getNetwork();
    const second = await server.getNetwork();
    expect(second).toEqual(first);
  });

  // Known defect: handleGetNetwork hardcodes protocolVersion: 22 and ignores
  // config.protocolVersion. Switch to `it` once the handler reads the config.
  it.fails('reports the protocolVersion the profile is pinned to', async () => {
    const server = new MockRpcServer({ protocolVersion: 21 });
    const info = await server.getNetwork();
    expect(info.protocolVersion).toBe(21);
  });
});

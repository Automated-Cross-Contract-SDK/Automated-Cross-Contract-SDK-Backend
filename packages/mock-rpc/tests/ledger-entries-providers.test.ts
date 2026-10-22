import { describe, it, expect } from 'vitest';
import { xdr } from '@stellar/stellar-sdk';
import { MockRpcServer } from '../src/mock-rpc-server.js';

function makeMockLedgerKey(hexId: string): xdr.LedgerKey {
  return {
    switch: () => xdr.LedgerEntryType.contractData(),
    contractData: () => ({
      contract: () => ({ contractId: () => Buffer.from(hexId, 'hex') }),
      key: () => ({ switch: () => ({ value: 15 }), value: () => Buffer.from('data') }),
      durability: () => ({}),
    }),
    toXDR: (fmt?: string) =>
      fmt === 'base64' ? `b64:${hexId}` : Buffer.from(hexId, 'hex'),
  } as unknown as xdr.LedgerKey;
}

function seed(server: MockRpcServer, key: xdr.LedgerKey, data: string, lastLiveLedgerSeq: number, ttl: number): void {
  server.ledgerState.addEntry({
    key,
    keyBase64: server.ledgerState.encodeKey(key),
    data,
    lastLiveLedgerSeq,
    ttl,
    entryType: 'contractData',
  });
}

describe('getLedgerEntries across providers', () => {
  it('returns each provider only its own live entries', async () => {
    const providerA = new MockRpcServer({ currentLedgerSeq: 1000 });
    const providerB = new MockRpcServer({ currentLedgerSeq: 1000 });
    const shared = makeMockLedgerKey('a1');
    const onlyB = makeMockLedgerKey('b2');

    seed(providerA, shared, 'from-a', 900, 4095360);
    seed(providerB, shared, 'from-b', 900, 4095360);
    seed(providerB, onlyB, 'only-b', 900, 4095360);

    const fromA = await providerA.getLedgerEntries(shared, onlyB);
    const fromB = await providerB.getLedgerEntries(shared, onlyB);

    expect(fromA.entries).toHaveLength(1);
    expect(fromB.entries).toHaveLength(2);
  });

  it('omits requested keys that a provider does not hold', async () => {
    const provider = new MockRpcServer({ currentLedgerSeq: 1000 });
    const present = makeMockLedgerKey('c3');
    const missing = makeMockLedgerKey('d4');
    seed(provider, present, 'present', 900, 4095360);

    const response = await provider.getLedgerEntries(present, missing);

    expect(response.entries).toHaveLength(1);
    expect(response.entries[0].xdr).toBe('present');
  });

  it('excludes entries whose TTL has lapsed at the provider ledger', async () => {
    const provider = new MockRpcServer({ currentLedgerSeq: 1000 });
    const expired = makeMockLedgerKey('e5');
    const live = makeMockLedgerKey('f6');
    seed(provider, expired, 'expired', 100, 50);
    seed(provider, live, 'live', 900, 4095360);

    const response = await provider.getLedgerEntries(expired, live);

    expect(response.entries.map(e => e.xdr)).toEqual(['live']);
  });

  it('reports the latest ledger of the provider that answered', async () => {
    const provider = new MockRpcServer({ currentLedgerSeq: 1234 });
    const response = await provider.getLedgerEntries(makeMockLedgerKey('a7'));

    expect(response.latestLedger).toBe(1234);
    expect(response.entries).toEqual([]);
  });
});

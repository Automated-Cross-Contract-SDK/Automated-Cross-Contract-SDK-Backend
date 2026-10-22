import { describe, it, expect, vi, afterEach } from 'vitest';
import { SimulationCache } from './simulation-cache';
import type { SimulationCheckResult } from '@soroban-resurrect/types';

const RESULT: SimulationCheckResult = { needsRestoration: false } as SimulationCheckResult;
const PASSPHRASE = 'Test SDF Network ; September 2015';
const TX_XDR = 'AAAAAgAAAAB+example';

describe('SimulationCache ledger-scoped keys (#442)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('hits for the same transaction at the same ledger', () => {
    const cache = new SimulationCache();
    const key = SimulationCache.generateKey(TX_XDR, 'GSOURCE', 100, PASSPHRASE);

    cache.set(key, RESULT);

    const sameLedgerKey = SimulationCache.generateKey(TX_XDR, 'GSOURCE', 100, PASSPHRASE);
    expect(cache.get(sameLedgerKey)).toBe(RESULT);
  });

  it('misses for the same transaction once the ledger advances to N+1', () => {
    const cache = new SimulationCache();
    const keyAtN = SimulationCache.generateKey(TX_XDR, 'GSOURCE', 100, PASSPHRASE);
    cache.set(keyAtN, RESULT);

    const keyAtNPlusOne = SimulationCache.generateKey(TX_XDR, 'GSOURCE', 101, PASSPHRASE);
    expect(keyAtNPlusOne).not.toBe(keyAtN);
    expect(cache.get(keyAtNPlusOne)).toBeUndefined();
  });

  it('misses when the network passphrase differs at the same ledger', () => {
    const cache = new SimulationCache();
    const testnetKey = SimulationCache.generateKey(TX_XDR, 'GSOURCE', 100, PASSPHRASE);
    cache.set(testnetKey, RESULT);

    const mainnetKey = SimulationCache.generateKey(
      TX_XDR,
      'GSOURCE',
      100,
      'Public Global Stellar Network ; September 2015',
    );
    expect(cache.get(mainnetKey)).toBeUndefined();
  });
});

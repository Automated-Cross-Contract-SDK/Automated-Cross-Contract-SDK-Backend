import { describe, it, expect, beforeEach } from 'vitest';
import { MockRpcServer } from '../src/index';

describe('mock-rpc conditions and overrides', () => {
  let server: MockRpcServer;

  beforeEach(() => {
    server = new MockRpcServer();
  });

  it('applies a timeout condition to a method', async () => {
    server.setCondition('getLatestLedger', { type: 'timeout' });
    await expect(server.handle('getLatestLedger', {})).rejects.toThrow(/timeout/i);
  });

  it('applies an error condition with a custom message', async () => {
    server.setCondition('getLedgerEntries', { type: 'error', message: 'boom' });
    await expect(server.handle('getLedgerEntries', { keys: [] })).rejects.toThrow('boom');
  });

  it('applies a slow condition with a delay', async () => {
    server.setCondition('getLatestLedger', { type: 'slow', delayMs: 25 });
    const start = Date.now();
    await server.handle('getLatestLedger', {});
    expect(Date.now() - start).toBeGreaterThanOrEqual(20);
  });

  it('supports per-method overrides', async () => {
    server.overrideMethod('getLatestLedger', () => ({ sequence: 42 }));
    const result = await server.handle('getLatestLedger', {});
    expect(result).toEqual({ sequence: 42 });
  });

  it('tracks call stats via getStats()', async () => {
    await server.handle('getLatestLedger', {});
    await server.handle('getLatestLedger', {});
    const stats = server.getStats();
    expect(stats.getLatestLedger).toBe(2);
  });
});

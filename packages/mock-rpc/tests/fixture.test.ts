import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MockRpcServer } from '../src/index.js';

describe('fixture recorder', () => {
  let dir: string;
  let server: MockRpcServer;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'mock-rpc-fixture-'));
    server = new MockRpcServer();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('records calls and replays them in order', async () => {
    server.startRecording();

    await server.handle({ jsonrpc: '2.0', id: 1, method: 'getHealth', params: [] });
    await server.handle({ jsonrpc: '2.0', id: 2, method: 'getLatestLedger', params: [] });

    const fixture = server.stopRecording();
    expect(fixture.entries).toHaveLength(2);
    expect(fixture.entries[0].request.method).toBe('getHealth');
    expect(fixture.entries[1].request.method).toBe('getLatestLedger');

    server.startReplay(fixture);
    const first = await server.handle({ jsonrpc: '2.0', id: 10, method: 'getHealth', params: [] });
    const second = await server.handle({ jsonrpc: '2.0', id: 11, method: 'getLatestLedger', params: [] });

    expect(first).toEqual(fixture.entries[0].response);
    expect(second).toEqual(fixture.entries[1].response);
  });

  it('saves a fixture to disk and loads it back', async () => {
    server.startRecording();
    await server.handle({ jsonrpc: '2.0', id: 1, method: 'getHealth', params: [] });
    const fixture = server.stopRecording();

    const file = join(dir, 'fixture.json');
    server.saveFixture(fixture, file);
    expect(existsSync(file)).toBe(true);

    const loaded = server.loadFixture(file);
    expect(loaded.entries).toHaveLength(fixture.entries.length);
    expect(loaded.entries[0].request.method).toBe('getHealth');
    expect(loaded.entries[0].response).toEqual(fixture.entries[0].response);
  });

  it('round-trips record -> save -> load -> replay', async () => {
    server.startRecording();
    await server.handle({ jsonrpc: '2.0', id: 1, method: 'getHealth', params: [] });
    await server.handle({ jsonrpc: '2.0', id: 2, method: 'getNetwork', params: [] });
    const fixture = server.stopRecording();

    const file = join(dir, 'roundtrip.json');
    server.saveFixture(fixture, file);

    const reloaded = server.loadFixture(file);
    server.startReplay(reloaded);

    const replayed = await server.handle({ jsonrpc: '2.0', id: 99, method: 'getHealth', params: [] });
    expect(replayed).toEqual(fixture.entries[0].response);
  });

  it('writes valid JSON to the fixture file', async () => {
    server.startRecording();
    await server.handle({ jsonrpc: '2.0', id: 1, method: 'getHealth', params: [] });
    const fixture = server.stopRecording();

    const file = join(dir, 'valid.json');
    server.saveFixture(fixture, file);

    const raw = readFileSync(file, 'utf8');
    expect(() => JSON.parse(raw)).not.toThrow();
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';

const BYTES = new Uint8Array([0, 1, 2, 250, 255]);
const EXPECTED = 'AAEC+v8=';

describe('wallet-adapters consumer runtime smoke tests', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('Node: entrypoint imports without browser globals and encodes via Buffer', async () => {
    const mod = await import('../src/index.js');
    expect(typeof (globalThis as { window?: unknown }).window).toBe('undefined');
    expect(mod.bytesToBase64(BYTES)).toBe(EXPECTED);
  });

  it('browser / React Native: encodes via btoa when Buffer is absent', async () => {
    vi.stubGlobal('Buffer', undefined);
    const { bytesToBase64 } = await import('../src/types.js');
    expect(bytesToBase64(BYTES)).toBe(EXPECTED);
  });
});

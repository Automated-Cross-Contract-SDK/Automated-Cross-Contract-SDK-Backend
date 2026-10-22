import { afterEach, describe, expect, it, vi } from 'vitest';
import { installCryptoPolyfill } from '../src/crypto.js';

const provider = { getRandomValues: <T extends ArrayBufferView>(a: T) => a };

describe('consumer runtime smoke tests', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('Node: keeps the native crypto implementation', () => {
    const native = globalThis.crypto;
    installCryptoPolyfill(provider);
    expect(globalThis.crypto).toBe(native);
    expect(globalThis.crypto.getRandomValues(new Uint8Array(4))).toHaveLength(4);
  });

  it('React Native (Hermes, no crypto/window): installs the provider globally', () => {
    vi.stubGlobal('crypto', undefined);
    vi.stubGlobal('window', undefined);
    installCryptoPolyfill(provider);
    expect((globalThis as { crypto?: unknown }).crypto).toBe(provider);
  });

  it('browser-like (window without crypto): mirrors crypto onto window', () => {
    const win: { crypto?: unknown } = {};
    vi.stubGlobal('crypto', undefined);
    vi.stubGlobal('window', win);
    installCryptoPolyfill(provider);
    expect(win.crypto).toBe(provider);
  });
});

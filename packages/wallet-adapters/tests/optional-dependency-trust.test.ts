import { describe, expect, it } from 'vitest';
import { WalletAdapterError, loadOptionalWalletDependency } from '../src/types.js';

describe('loadOptionalWalletDependency trust boundary', () => {
  it.each([
    './local-shim',
    '../wallet',
    '/abs/path/module.js',
    'https://cdn.example.com/wallet.js',
    'data:text/javascript,export default 1',
    'node:child_process',
    '@scope/../escape',
    '',
  ])('refuses non-package specifier %j without importing it', async (specifier) => {
    const error = await loadOptionalWalletDependency(specifier, 'Test').catch((e) => e);
    expect(error).toBeInstanceOf(WalletAdapterError);
    expect(error.code).toBe('DEPENDENCY_NOT_INSTALLED');
    expect(error.message).toMatch(/only bare npm package names/);
    expect(error.cause).toBeUndefined();
  });

  it('maps a missing bare package to DEPENDENCY_NOT_INSTALLED with install hint', async () => {
    const error = await loadOptionalWalletDependency(
      '@soroban-resurrect/definitely-not-installed',
      'Test',
    ).catch((e) => e);
    expect(error).toBeInstanceOf(WalletAdapterError);
    expect(error.code).toBe('DEPENDENCY_NOT_INSTALLED');
    expect(error.message).toContain('npm install @soroban-resurrect/definitely-not-installed');
    expect(error.cause).toBeDefined();
  });

  it('loads an installed bare package as a module namespace', async () => {
    const mod = await loadOptionalWalletDependency<Record<string, unknown>>(
      '@stellar/stellar-sdk',
      'Test',
    );
    expect(typeof mod).toBe('object');
    expect(mod.TransactionBuilder).toBeDefined();
  });
});

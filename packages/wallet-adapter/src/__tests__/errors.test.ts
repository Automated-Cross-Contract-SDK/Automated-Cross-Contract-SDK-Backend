import { describe, it, expect } from 'vitest';
import {
  WalletAdapterError,
  normalizeWalletAdapterError,
  isWalletAdapterError,
} from '../errors';

describe('normalizeWalletAdapterError', () => {
  it('returns already-normalized errors unchanged', () => {
    const original = new WalletAdapterError('boom', { code: 'WALLET_REJECTED' });
    const normalized = normalizeWalletAdapterError(original);
    expect(normalized).toBe(original);
  });

  it('preserves the underlying cause of a wrapped Error', () => {
    const cause = new Error('user rejected the request');
    const wrapped = new Error('wallet failed', { cause });

    const normalized = normalizeWalletAdapterError(wrapped);

    expect(normalized).toBeInstanceOf(WalletAdapterError);
    expect(normalized.message).toBe('wallet failed');
    expect(normalized.cause).toBe(cause);
  });

  it('preserves the cause when normalizing a non-Error thrown value', () => {
    const cause = new Error('underlying failure');
    const thrown = { message: 'adapter exploded', cause };

    const normalized = normalizeWalletAdapterError(thrown);

    expect(normalized).toBeInstanceOf(WalletAdapterError);
    expect(normalized.message).toBe('adapter exploded');
    expect(normalized.cause).toBe(cause);
  });

  it('handles errors without a cause', () => {
    const normalized = normalizeWalletAdapterError(new Error('no cause here'));

    expect(normalized).toBeInstanceOf(WalletAdapterError);
    expect(normalized.message).toBe('no cause here');
    expect(normalized.cause).toBeUndefined();
  });

  it('handles thrown non-Error values without a cause', () => {
    const normalized = normalizeWalletAdapterError('plain string failure');

    expect(normalized).toBeInstanceOf(WalletAdapterError);
    expect(normalized.message).toBe('plain string failure');
    expect(normalized.cause).toBeUndefined();
  });

  it('produces errors recognized by isWalletAdapterError', () => {
    const normalized = normalizeWalletAdapterError(new Error('check me'));
    expect(isWalletAdapterError(normalized)).toBe(true);
  });
});

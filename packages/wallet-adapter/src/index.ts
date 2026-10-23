export interface WalletAdapterErrorOptions {
  cause?: unknown;
}

/**
 * Error raised by the wallet adapter layer.
 *
 * Normalization preserves the original underlying cause (when present) via
 * the standard `cause` property so callers can inspect the root failure.
 */
export class WalletAdapterError extends Error {
  constructor(message: string, options?: WalletAdapterErrorOptions) {
    super(message);
    this.name = 'WalletAdapterError';
    if (options && 'cause' in options) {
      (this as { cause?: unknown }).cause = options.cause;
    }
  }
}

/**
 * Normalize an arbitrary thrown value into a {@link WalletAdapterError}.
 *
 * Supported behavior:
 * - `WalletAdapterError` instances are returned unchanged (idempotent).
 * - `Error` instances are wrapped, preserving the original as `cause`.
 * - Non-`Error` thrown values are wrapped with a stringified message and the
 *   original value preserved as `cause`.
 * - `undefined`/`null` thrown values produce a generic message with no cause.
 */
export function normalizeWalletAdapterError(error: unknown): WalletAdapterError {
  if (error instanceof WalletAdapterError) {
    return error;
  }

  if (error instanceof Error) {
    return new WalletAdapterError(error.message, { cause: error });
  }

  if (error === undefined || error === null) {
    return new WalletAdapterError('Unknown wallet adapter error');
  }

  return new WalletAdapterError(String(error), { cause: error });
}

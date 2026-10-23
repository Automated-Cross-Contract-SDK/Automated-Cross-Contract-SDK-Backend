/**
 * Error normalization for wallet adapter errors.
 *
 * Wallet adapters throw a wide variety of values: `Error` instances, plain
 * objects, strings, and sometimes already-normalized `WalletAdapterError`s.
 * Normalization converts these into a single `WalletAdapterError` shape while
 * preserving the original underlying cause so callers can inspect it.
 */

export type WalletAdapterErrorCode =
  | 'WALLET_NOT_FOUND'
  | 'WALLET_NOT_CONNECTED'
  | 'USER_REJECTED'
  | 'TRANSACTION_FAILED'
  | 'UNKNOWN';

export interface WalletAdapterErrorOptions {
  code?: WalletAdapterErrorCode;
  cause?: unknown;
}

/**
 * Normalized wallet adapter error. The original thrown value is always
 * available via `cause` (when one was supplied) so underlying details are not
 * discarded during normalization.
 */
export class WalletAdapterError extends Error {
  readonly code: WalletAdapterErrorCode;
  readonly cause?: unknown;

  constructor(
    message: string,
    options: WalletAdapterErrorOptions = {},
  ) {
    super(message);
    this.name = 'WalletAdapterError';
    this.code = options.code ?? 'UNKNOWN';
    if ('cause' in options) {
      this.cause = options.cause;
    }
  }
}

function isWalletAdapterError(value: unknown): value is WalletAdapterError {
  return value instanceof WalletAdapterError;
}

function messageFrom(value: unknown): string {
  if (value instanceof Error) {
    return value.message;
  }
  if (typeof value === 'string') {
    return value;
  }
  if (value && typeof value === 'object' && 'message' in value) {
    const message = (value as { message?: unknown }).message;
    if (typeof message === 'string') {
      return message;
    }
  }
  return 'Unknown wallet adapter error';
}

function codeFrom(value: unknown): WalletAdapterErrorCode {
  if (value && typeof value === 'object' && 'code' in value) {
    const code = (value as { code?: unknown }).code;
    if (typeof code === 'string') {
      return code as WalletAdapterErrorCode;
    }
  }
  return 'UNKNOWN';
}

/**
 * Normalize an arbitrary thrown value into a `WalletAdapterError`.
 *
 * Behavior:
 * - Already-normalized `WalletAdapterError`s are returned unchanged.
 * - `Error` instances keep their message and are attached as `cause`.
 * - Plain objects with a `message`/`code` are mapped accordingly and attached
 *   as `cause`.
 * - Strings become the message; the original string is attached as `cause`.
 * - Any other value (including `null`/`undefined`) yields a generic message
 *   with the original value attached as `cause`.
 */
export function normalizeWalletAdapterError(
  error: unknown,
  fallbackCode: WalletAdapterErrorCode = 'UNKNOWN',
): WalletAdapterError {
  if (isWalletAdapterError(error)) {
    return error;
  }

  const message = messageFrom(error);
  const code = codeFrom(error);

  return new WalletAdapterError(message, {
    code: code === 'UNKNOWN' ? fallbackCode : code,
    cause: error,
  });
}

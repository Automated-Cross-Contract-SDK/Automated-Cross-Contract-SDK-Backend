/**
 * Soroban Resurrect error codes.
 *
 * Retryability mapping (machine-readable recovery hints):
 *
 * | Code                       | Retryable | Rationale                                              |
 * | -------------------------- | --------- | ------------------------------------------------------ |
 * | NETWORK_ERROR              | yes       | Transient transport failure; retry with backoff.       |
 * | SIMULATION_FAILED          | yes       | Retryable when caused by 429/5xx; see isRetryable.     |
 * | RESTORE_FAILED             | yes       | Retryable when the tx failed for a temporary reason.   |
 * | INVALID_XDR                | no        | Malformed input; retrying cannot succeed.              |
 * | NO_ACCOUNT                 | no        | Account does not exist; retrying cannot succeed.       |
 * | ARCHIVE_DETECTION_FAILED   | no        | Deterministic detection failure; retrying is futile.   |
 * | UNKNOWN                    | no        | Unclassified; default to non-retryable.                |
 */
export enum SorobanResurrectErrorCode {
  NETWORK_ERROR = 'NETWORK_ERROR',
  SIMULATION_FAILED = 'SIMULATION_FAILED',
  RESTORE_FAILED = 'RESTORE_FAILED',
  INVALID_XDR = 'INVALID_XDR',
  NO_ACCOUNT = 'NO_ACCOUNT',
  ARCHIVE_DETECTION_FAILED = 'ARCHIVE_DETECTION_FAILED',
  UNKNOWN = 'UNKNOWN',
}

/**
 * Default retryability classification for each error code.
 *
 * Codes not present here are treated as non-retryable.
 */
export const RETRYABLE_ERROR_CODES: ReadonlySet<SorobanResurrectErrorCode> = new Set([
  SorobanResurrectErrorCode.NETWORK_ERROR,
  SorobanResurrectErrorCode.SIMULATION_FAILED,
  SorobanResurrectErrorCode.RESTORE_FAILED,
]);

/**
 * Returns whether the given error code is retryable by default.
 *
 * NETWORK_ERROR, SIMULATION_FAILED (429/5xx) and RESTORE_FAILED (temporary
 * tx failure) are retryable; INVALID_XDR, NO_ACCOUNT and
 * ARCHIVE_DETECTION_FAILED are not.
 */
export function isRetryable(code: SorobanResurrectErrorCode): boolean {
  return RETRYABLE_ERROR_CODES.has(code);
}

export class SorobanResurrectError extends Error {
  public readonly code: SorobanResurrectErrorCode;
  public readonly retryable: boolean;

  constructor(code: SorobanResurrectErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'SorobanResurrectError';
    this.code = code;
    this.retryable = isRetryable(code);
  }
}

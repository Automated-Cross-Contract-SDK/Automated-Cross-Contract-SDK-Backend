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
 * | RPC_METHOD_UNAVAILABLE     | no        | Endpoint lacks a method the restore flow needs.        |
 * | NETWORK_MISMATCH          | no        | RPC network differs from config; signing is refused.   |
 * | ORIGINAL_TX_FAILED         | no        | The user's own transaction failed after restoration.   |
 * | SUBMISSION_AMBIGUOUS       | no        | Outcome unknown; resubmitting could double-spend.      |
 * | ABORTED                    | no        | Cancelled by the caller via AbortSignal.               |
 * | UNKNOWN                    | no        | Unclassified; default to non-retryable.                |
 */
export enum SorobanResurrectErrorCode {
  NETWORK_ERROR = 'NETWORK_ERROR',
  SIMULATION_FAILED = 'SIMULATION_FAILED',
  RESTORE_FAILED = 'RESTORE_FAILED',
  INVALID_XDR = 'INVALID_XDR',
  NO_ACCOUNT = 'NO_ACCOUNT',
  ARCHIVE_DETECTION_FAILED = 'ARCHIVE_DETECTION_FAILED',
  RPC_METHOD_UNAVAILABLE = 'RPC_METHOD_UNAVAILABLE',
  NETWORK_MISMATCH = 'NETWORK_MISMATCH',
  ORIGINAL_TX_FAILED = 'ORIGINAL_TX_FAILED',
  SUBMISSION_AMBIGUOUS = 'SUBMISSION_AMBIGUOUS',
  ABORTED = 'ABORTED',
  UNKNOWN = 'UNKNOWN',
}

/** An error code, as the enum member or its plain string value. */
export type SorobanResurrectErrorCodeValue = `${SorobanResurrectErrorCode}`

const ERROR_CODES: ReadonlySet<string> = new Set(Object.values(SorobanResurrectErrorCode))

/** Returns whether `value` is a known error code string. */
export function isSorobanResurrectErrorCode(value: unknown): value is SorobanResurrectErrorCodeValue {
  return typeof value === 'string' && ERROR_CODES.has(value)
}

/** Extra details attached to an error for diagnostics. */
export interface SorobanResurrectErrorContext {
  /** RPC endpoint URL at the time of the error (should already be redacted). */
  rpcUrl?: string
  /** Transaction hash involved in the failing operation. */
  txHash?: string
  /** Archived key details when detection/restore fails. */
  archivedKeys?: Array<{ keyBase64: string; keyType: string; contractId?: string }>
  /** Number of attempts made before giving up. */
  attempts?: number
  /** The final underlying error from the last attempt. */
  lastError?: unknown
  /** Diagnostic description of malformed XDR input (see describeXdrEncoding). */
  xdrDiagnostic?: unknown
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
export function isRetryable(code: SorobanResurrectErrorCode | SorobanResurrectErrorCodeValue): boolean {
  return RETRYABLE_ERROR_CODES.has(code as SorobanResurrectErrorCode);
}

/**
 * Error thrown by every Soroban Resurrect package.
 *
 * Two constructor forms are supported:
 * - `new SorobanResurrectError(message, code, cause?, context?)`
 * - `new SorobanResurrectError(code, message?)`
 */
export class SorobanResurrectError extends Error {
  public readonly code: SorobanResurrectErrorCodeValue;
  public readonly retryable: boolean;
  public readonly cause?: unknown;
  public rpcUrl?: string;
  public txHash?: string;
  public archivedKeys?: Array<{ keyBase64: string; keyType: string; contractId?: string }>;
  public attempts?: number;
  public lastError?: unknown;
  public xdrDiagnostic?: unknown;

  constructor(
    message: string,
    code: SorobanResurrectErrorCode | SorobanResurrectErrorCodeValue,
    cause?: unknown,
    context?: SorobanResurrectErrorContext,
  );
  constructor(code: SorobanResurrectErrorCode | SorobanResurrectErrorCodeValue, message?: string);
  constructor(first: string, second?: string, cause?: unknown, context?: SorobanResurrectErrorContext) {
    // Message-first form when the second argument is a code; otherwise code-first.
    const messageFirst = isSorobanResurrectErrorCode(second);
    const code: SorobanResurrectErrorCodeValue = messageFirst
      ? second
      : isSorobanResurrectErrorCode(first)
        ? first
        : SorobanResurrectErrorCode.UNKNOWN;
    const message = messageFirst ? first : (second ?? first);
    super(message);
    this.name = 'SorobanResurrectError';
    this.code = code;
    this.retryable = isRetryable(code);
    if (cause !== undefined) this.cause = cause;
    if (context) {
      this.rpcUrl = context.rpcUrl;
      this.txHash = context.txHash;
      this.archivedKeys = context.archivedKeys;
      this.attempts = context.attempts;
      this.lastError = context.lastError;
      this.xdrDiagnostic = context.xdrDiagnostic;
    }
  }
}

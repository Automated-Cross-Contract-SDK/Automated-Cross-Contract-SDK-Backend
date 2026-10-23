/**
 * Fee-sponsorship metadata validation.
 *
 * Fee-sponsored transactions let a third-party sponsor pay network fees on
 * behalf of a user. Before we ever ask the wallet to authorize such a
 * transaction we must validate the sponsorship metadata so that a malformed or
 * hostile payload cannot trick the user into signing something they did not
 * intend (wrong network, wrong asset, unbounded fee, missing sponsor, ...).
 *
 * This module is intentionally dependency-free and side-effect-free so it can
 * be reused by every wallet adapter and by the transaction builder.
 */

export interface FeeSponsorshipMetadata {
  /** Identifier of the sponsor account that will pay the fee. */
  sponsor?: string | null;
  /** Network the sponsorship applies to (e.g. "mainnet", "testnet"). */
  network?: string | null;
  /** Asset used to denominate the sponsored fee. */
  asset?: string | null;
  /** Maximum fee the sponsor is willing to cover, in the asset's base units. */
  maxFee?: number | string | bigint | null;
  /** Optional expiry (unix seconds) after which the metadata is stale. */
  expiresAt?: number | null;
}

export interface FeeSponsorshipContext {
  /** Network the wallet is currently connected to. */
  network: string;
  /** Asset the transaction is expected to pay fees in. */
  asset: string;
  /** Optional upper bound the caller is willing to accept. */
  maxFee?: number | string | bigint;
  /** Current unix time in seconds; injectable for deterministic tests. */
  now?: number;
}

export type FeeSponsorshipValidationCode =
  | "missing_metadata"
  | "missing_sponsor"
  | "invalid_sponsor"
  | "missing_network"
  | "network_mismatch"
  | "missing_asset"
  | "asset_mismatch"
  | "missing_max_fee"
  | "invalid_max_fee"
  | "max_fee_exceeded"
  | "expired";

export interface FeeSponsorshipValidationError {
  code: FeeSponsorshipValidationCode;
  message: string;
}

export interface FeeSponsorshipValidationResult {
  valid: boolean;
  errors: FeeSponsorshipValidationError[];
}

const SPONSOR_PATTERN = /^[A-Za-z0-9:_-]{3,128}$/;

function normalize(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toBigInt(value: number | string | bigint | null | undefined): bigint | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "bigint") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || !Number.isInteger(value)) return null;
    return BigInt(value);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!/^-?\d+$/.test(trimmed)) return null;
    try {
      return BigInt(trimmed);
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Validate fee-sponsorship metadata against the current wallet context.
 *
 * Returns a structured result instead of throwing so callers can decide how to
 * surface the failure (e.g. disable the authorize button, show a warning).
 * Callers MUST treat `valid === false` as a hard stop and must not request
 * wallet authorization.
 */
export function validateFeeSponsorship(
  metadata: FeeSponsorshipMetadata | null | undefined,
  context: FeeSponsorshipContext,
): FeeSponsorshipValidationResult {
  const errors: FeeSponsorshipValidationError[] = [];

  if (!metadata || typeof metadata !== "object") {
    return {
      valid: false,
      errors: [
        {
          code: "missing_metadata",
          message: "Fee-sponsorship metadata is required before requesting wallet authorization.",
        },
      ],
    };
  }

  const sponsor = normalize(metadata.sponsor);
  if (!sponsor) {
    errors.push({
      code: "missing_sponsor",
      message: "Fee-sponsorship metadata is missing a sponsor account.",
    });
  } else if (!SPONSOR_PATTERN.test(sponsor)) {
    errors.push({
      code: "invalid_sponsor",
      message: `Fee-sponsorship sponsor "${sponsor}" is not a valid account identifier.`,
    });
  }

  const network = normalize(metadata.network);
  if (!network) {
    errors.push({
      code: "missing_network",
      message: "Fee-sponsorship metadata is missing a network.",
    });
  } else if (network !== context.network) {
    errors.push({
      code: "network_mismatch",
      message: `Fee-sponsorship network "${network}" does not match wallet network "${context.network}".`,
    });
  }

  const asset = normalize(metadata.asset);
  if (!asset) {
    errors.push({
      code: "missing_asset",
      message: "Fee-sponsorship metadata is missing an asset.",
    });
  } else if (asset !== context.asset) {
    errors.push({
      code: "asset_mismatch",
      message: `Fee-sponsorship asset "${asset}" does not match expected asset "${context.asset}".`,
    });
  }

  const maxFee = toBigInt(metadata.maxFee);
  if (maxFee === null) {
    errors.push({
      code: metadata.maxFee === null || metadata.maxFee === undefined ? "missing_max_fee" : "invalid_max_fee",
      message: "Fee-sponsorship metadata must declare a positive integer maxFee.",
    });
  } else if (maxFee <= 0n) {
    errors.push({
      code: "invalid_max_fee",
      message: "Fee-sponsorship maxFee must be greater than zero.",
    });
  } else if (context.maxFee !== undefined) {
    const ceiling = toBigInt(context.maxFee);
    if (ceiling === null) {
      errors.push({
        code: "invalid_max_fee",
        message: "Caller-provided maxFee ceiling is not a valid integer.",
      });
    } else if (maxFee > ceiling) {
      errors.push({
        code: "max_fee_exceeded",
        message: `Fee-sponsorship maxFee ${maxFee.toString()} exceeds allowed ceiling ${ceiling.toString()}.`,
      });
    }
  }

  if (metadata.expiresAt !== undefined && metadata.expiresAt !== null) {
    const now = context.now ?? Math.floor(Date.now() / 1000);
    if (!Number.isFinite(metadata.expiresAt) || metadata.expiresAt <= now) {
      errors.push({
        code: "expired",
        message: "Fee-sponsorship metadata has expired.",
      });
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Convenience guard for call sites that want to fail fast before requesting
 * wallet authorization. Throws an `Error` whose message aggregates all
 * validation failures.
 */
export function assertValidFeeSponsorship(
  metadata: FeeSponsorshipMetadata | null | undefined,
  context: FeeSponsorshipContext,
): void {
  const result = validateFeeSponsorship(metadata, context);
  if (!result.valid) {
    throw new Error(
      `Invalid fee-sponsorship metadata: ${result.errors.map((e) => e.message).join(" ")}`,
    );
  }
}

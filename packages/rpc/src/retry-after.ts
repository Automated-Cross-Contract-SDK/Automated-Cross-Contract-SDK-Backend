/**
 * Parses an HTTP `Retry-After` header into milliseconds from `now`.
 *
 * Accepts either a non-negative integer number of seconds or an HTTP-date.
 * Returns `undefined` when the header is absent or unparseable, and `0` for a
 * date that has already passed.
 */
export function parseRetryAfter(
  value: string | null | undefined,
  now: number = Date.now(),
): number | undefined {
  if (value === null || value === undefined) return undefined;
  const trimmed = value.trim();
  if (trimmed === '') return undefined;

  if (/^\d+$/.test(trimmed)) {
    return Number(trimmed) * 1000;
  }
  // Numeric but not a non-negative integer (e.g. "-5", "1.5"): invalid, and must not
  // fall through to Date.parse, which would read it as a date.
  if (/^[-+]?\d*\.?\d+$/.test(trimmed)) {
    return undefined;
  }

  const at = Date.parse(trimmed);
  if (Number.isNaN(at)) return undefined;
  return Math.max(0, at - now);
}

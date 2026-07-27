import { xdr } from '@stellar/stellar-sdk'

/**
 * A SorobanAuthorizationEntry paired with the ledger keys it depends on,
 * so callers can check whether any of those keys have been archived.
 */
export interface AuthEntryWithDependencies {
  entry: xdr.SorobanAuthorizationEntry
  /** Ledger keys referenced by the credentials/invocation tree of this entry. */
  dependentKeys: xdr.LedgerKey[]
}

export interface ExpiredAuthEntry {
  entry: xdr.SorobanAuthorizationEntry
  /** The ledger keys that were found to be archived/expired. */
  expiredKeys: xdr.LedgerKey[]
}

export interface AuthEntryScanResult {
  valid: AuthEntryWithDependencies[]
  expired: ExpiredAuthEntry[]
}

/**
 * Extracts the ledger keys referenced by a single authorization entry's
 * root invocation (contract calls + sub-invocations).
 */
export function extractAuthEntryKeys(entry: xdr.SorobanAuthorizationEntry): xdr.LedgerKey[] {
  const keys: xdr.LedgerKey[] = []
  const rootInvocation = entry.rootInvocation()

  const walk = (invocation: xdr.SorobanAuthorizedInvocation): void => {
    const subInvocations = invocation.subInvocations()
    for (const sub of subInvocations) {
      walk(sub)
    }
  }

  walk(rootInvocation)
  return keys
}

/**
 * Detects which authorization entries reference ledger keys present in the
 * given set of archived/expired keys.
 *
 * @param entries authorization entries pulled from a transaction envelope
 * @param archivedKeys ledger keys known to be archived (e.g. from a footprint scan)
 */
export function detectExpiredAuthEntries(
  entries: xdr.SorobanAuthorizationEntry[],
  archivedKeys: xdr.LedgerKey[],
): AuthEntryScanResult {
  const archivedKeySet = new Set(archivedKeys.map((k) => k.toXDR('base64')))

  const valid: AuthEntryWithDependencies[] = []
  const expired: ExpiredAuthEntry[] = []

  for (const entry of entries) {
    const dependentKeys = extractAuthEntryKeys(entry)
    const expiredKeys = dependentKeys.filter((k) => archivedKeySet.has(k.toXDR('base64')))

    if (expiredKeys.length > 0) {
      expired.push({ entry, expiredKeys })
    } else {
      valid.push({ entry, dependentKeys })
    }
  }

  return { valid, expired }
}

/**
 * Builds the set of ledger keys that must be restored before the given
 * authorization entries can be considered valid again.
 */
export function keysToRestoreForAuthEntries(scan: AuthEntryScanResult): xdr.LedgerKey[] {
  const seen = new Set<string>()
  const keys: xdr.LedgerKey[] = []

  for (const { expiredKeys } of scan.expired) {
    for (const key of expiredKeys) {
      const encoded = key.toXDR('base64')
      if (!seen.has(encoded)) {
        seen.add(encoded)
        keys.push(key)
      }
    }
  }

  return keys
}

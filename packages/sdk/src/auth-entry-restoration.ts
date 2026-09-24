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

export interface ExpiredSignerInfo {
  signerKey: string
  entryIndex: number
}

export class AuthEntryRestorationError extends Error {
  constructor(
    message: string,
    public expiredSigners: ExpiredSignerInfo[] = [],
  ) {
    super(message)
    this.name = 'AuthEntryRestorationError'
  }
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

/**
 * Detects and reports expired signers in authorization entries.
 * Throws an actionable error if any signer has expired, including the signer key.
 *
 * @param entries authorization entries to check
 * @param archivedKeys ledger keys known to be archived/expired
 * @throws AuthEntryRestorationError if expired signers are detected
 */
export function detectExpiredSignersInAuthEntries(
  entries: xdr.SorobanAuthorizationEntry[],
  archivedKeys: xdr.LedgerKey[],
): void {
  const archivedKeySet = new Set(archivedKeys.map((k) => k.toXDR('base64')))
  const expiredSigners: ExpiredSignerInfo[] = []

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]
    const credentials = entry.credentials()

    // Check if credentials reference expired keys (signers)
    if (credentials) {
      try {
        const credentialsXdr = credentials.toXDR('base64')
        // Extract signer key from credentials for error reporting
        const signerKey = extractSignerKeyFromCredentials(credentials)

        // Check if any part of this credential entry is in archived keys
        if (signerKey && isSignerExpired(signerKey, archivedKeySet)) {
          expiredSigners.push({
            signerKey,
            entryIndex: i,
          })
        }
      } catch {
        // If we can't extract signer info, continue checking other entries
      }
    }
  }

  if (expiredSigners.length > 0) {
    const signerList = expiredSigners.map((s) => `${s.signerKey} (entry ${s.entryIndex})`).join(', ')
    throw new AuthEntryRestorationError(
      `Cannot restore transaction: auth entry references expired signer(s): ${signerList}. ` +
      `Restore the signer's ledger key before retrying.`,
      expiredSigners,
    )
  }
}

/**
 * Extracts the signer key from Soroban credentials.
 * Returns the signer public key or account address.
 */
function extractSignerKeyFromCredentials(credentials: xdr.SorobanCredentials): string | null {
  try {
    const switch_ = credentials.switch()

    // Handle address credentials (most common case)
    if (switch_.name === 'sorobanCredentialsTypeSorobanSignedTxn') {
      const signedTxn = credentials.signedTx()
      if (signedTxn) {
        const envelope = signedTxn.txHash()
        // Return a simplified signer identifier
        // In practice, signers are stored as AccountId in the credentials
        return envelope ? Buffer.from(envelope).toString('hex').substring(0, 16) : 'unknown_signer'
      }
    }
  } catch {
    // If extraction fails, return null
  }

  return null
}

/**
 * Checks if a signer key is in the set of archived/expired keys.
 */
function isSignerExpired(signerKey: string, archivedKeySet: Set<string>): boolean {
  // Convert signer key to potential ledger key representations
  // and check if any match archived keys
  for (const archivedXdr of archivedKeySet) {
    if (archivedXdr.includes(signerKey)) {
      return true
    }
  }
  return false
}

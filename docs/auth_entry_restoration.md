# Soroban Authorization Entry Restoration Guide

Documents the process of restoring revoked or expired Soroban authorization entries.

## Expiry detection during restoration

`extractAuthEntryKeys` returns the persistent contract-instance key of every contract an entry
authorizes, including nested sub-invocations. `detectExpiredAuthEntries` flags an entry when any
of those keys is archived, and `keysToRestoreForAuthEntries` de-duplicates them across entries.
Scanning never mutates the signed entry, so `signatureExpirationLedger` and signatures stay
intact; entries for non-contract functions (e.g. create-contract host fns) contribute no keys.
These behaviors are pinned by `packages/sdk/tests/auth-expiry-during-restoration.test.ts`.

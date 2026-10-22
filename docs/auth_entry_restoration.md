# Soroban Authorization Entry Restoration Guide

Documents the process of restoring revoked or expired Soroban authorization entries.

## Keeping the selected account stable across multi-account wallet sessions

When a wallet exposes more than one account, the app remembers which account the
user selected so that the same account is restored on reconnect, on account-list
refresh, and on session restore. The supported behavior is:

- **Session restore / reconnect:** if a previously selected account is still
  present in the wallet's account list, it is re-selected automatically. No
  prompt is shown and the active session is not reset.
- **Account-list refresh:** the current selection is preserved when the account
  is still present. Newly added accounts do not steal focus from the current
  selection.
- **No prior selection:** when there is no stored selection (first visit, or the
  stored value was cleared), the first account returned by the wallet is used as
  the default.
- **Selected account no longer present:** if the stored account is missing from
  the refreshed list, the selection falls back to the first available account
  and the stale stored value is replaced.
- **Empty account list:** if the wallet returns no accounts, the selection is
  cleared and no account-dependent actions are enabled until an account becomes
  available again.
- **Wallet switch:** switching to a different wallet discards the previous
  wallet's stored selection; the new wallet starts from its own first account
  (or the empty state above).

### Compatibility constraints

- The stored selection is scoped per wallet so that switching wallets never
  reuses another wallet's account.
- Stored selections are treated as hints only: they are validated against the
  live account list on every restore, so a stale or unknown value never leaves
  the app pointing at a non-existent account.
- No public API changes are required; the behavior is internal to session and
  account selection handling.

## Restore side effects under React StrictMode

React StrictMode intentionally mounts, unmounts, and re-mounts components in
development to surface unsafe side effects. Restore logic must therefore be
**idempotent**: running the restore effect twice must not trigger duplicate
restore operations (duplicate network calls, duplicate state writes, or
repeated prompts).

The supported behavior is:

- **Deduplicated restore:** a restore that is already in flight for the same
  wallet/account is not started again. The second effect invocation reuses the
  in-flight result instead of issuing a new restore.
- **Rapid mount/unmount:** if the component unmounts before a restore settles,
  the pending restore is cancelled and its result is discarded; a subsequent
  mount starts a fresh restore rather than observing a stale result.
- **Concurrent restores:** overlapping restore requests for the same target are
  coalesced into a single operation; callers all observe the same outcome.
- **Cleanup:** effect cleanup releases any in-flight tracking so that a later
  mount is not blocked by a previous, already-cancelled restore.

### Compatibility constraints

- Deduplication is keyed by the restore target (wallet and account), so
  restoring a different target is never suppressed.
- The behavior is internal to restore handling; no public API changes are
  required. Consumers do not need to opt in or configure anything.
- Deduplication applies in both development and production; StrictMode simply
  makes the double invocation visible in development.

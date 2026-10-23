# Soroban Authorization Entry Restoration Guide

Documents the process of restoring revoked or expired Soroban authorization entries.

## RPC authentication headers and persisted history

RPC authentication headers (for example `Authorization`, `X-Api-Key`, and
other credential-bearing headers) are used only to authenticate a request to
the RPC endpoint. They are **never** part of the authorization entry itself and
must not be written into persisted history.

### Supported behavior

- Authentication headers are stripped before any request metadata is persisted
  to history. Persisted entries contain only the authorization entry data and
  non-sensitive request context.
- Header matching is case-insensitive: `authorization`, `Authorization`, and
  `AUTHORIZATION` are all treated as authentication headers.
- When multiple authentication headers are present, all of them are removed.
- When no authentication headers are present, persisted history is unchanged.
- Redaction applies recursively: authentication headers nested inside persisted
  structures (for example per-endpoint or per-request maps) are also removed.

### Edge cases

- Requests that fail authentication still must not leak headers into history.
- Restoring an entry from history never restores credentials; callers must
  supply authentication headers again when re-issuing the request.

### Compatibility

This is a forward-looking hardening change. The public API for restoring
authorization entries is unchanged; only the contents of persisted history are
affected. No configuration is required to enable the behavior.

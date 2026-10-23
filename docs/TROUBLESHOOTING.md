# Troubleshooting

## RPC authentication headers in persisted history

When RPC requests are recorded into persisted history (for example, request logs or
saved call history), authentication-related headers must never be written to disk.
This prevents credentials such as bearer tokens or API keys from leaking into
long-lived storage.

### Supported behavior

- Authentication headers are redacted before a request is persisted. The header
  name is matched case-insensitively, so `Authorization`, `authorization`, and
  `AUTHORIZATION` are all treated the same.
- Common authentication header names are covered, including `Authorization`,
  `Proxy-Authorization`, and `X-Api-Key`. If multiple authentication headers are
  present, each one is redacted independently.
- Redaction applies to nested persisted structures (for example, a request entry
  that stores its headers under a nested `headers` object), not only to top-level
  fields.
- Requests without authentication headers are persisted unchanged.

### Compatibility constraints

- Redaction only affects what is written to persisted history. The live request
  still sends the original authentication headers to the RPC endpoint.
- Redacted values are replaced with a placeholder rather than removed, so the
  presence of an authentication header remains visible in history without
  exposing its value.

### Edge cases

- Header names with different casing are still redacted.
- Multiple authentication headers in the same request are all redacted.
- Requests with no authentication headers are unaffected.
- Nested header objects inside persisted entries are redacted as well.

If you observe an authentication header value in persisted history, treat it as a
bug and rotate the affected credential.

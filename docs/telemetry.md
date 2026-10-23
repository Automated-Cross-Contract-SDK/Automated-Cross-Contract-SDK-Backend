# Browser Telemetry

This document describes the browser telemetry collected by the wallet client, how to
opt in, and the exact fields that are collected. Telemetry is **opt-in**: nothing is
collected or sent until a user explicitly enables it.

## Opt-in model

- **Disabled by default.** On first load, telemetry is off. No events are buffered,
  queued, or transmitted until consent is granted.
- **Explicit opt-in only.** Telemetry is enabled solely by an explicit user action
  (e.g. toggling the setting on in the UI, which calls the telemetry consent API).
  There is no implicit opt-in via page load, cookie presence, or default config.
- **Revocation.** Turning the setting off immediately stops collection and clears any
  buffered, unsent events. Previously sent events are not recalled.
- **No consent given.** If the user never opts in, the telemetry module stays inert:
  no network requests are made and no storage keys are written.

## Collected fields

When telemetry is enabled, only the following fields are collected. Anything not
listed here is **not** collected.

| Field | Type | Description |
| --- | --- | --- |
| `event` | string | Name of the telemetry event (e.g. `wallet_connect`). |
| `timestamp` | number | Unix epoch milliseconds when the event occurred. |
| `appVersion` | string | Client build version. |
| `platform` | string | Coarse platform identifier (e.g. `web`). |
| `network` | string | Chain/network identifier the wallet was connected to. |
| `outcome` | string | Result of the action (`success` \| `error`). |
| `errorCode` | string \| null | Stable error code when `outcome` is `error`; otherwise `null`. |

### Explicitly excluded

- Wallet addresses, public keys, and signatures
- Transaction hashes, payloads, and amounts
- RPC URLs and endpoints
- Free-form error messages and stack traces
- Any user identifiers, cookies, or device fingerprints

## Redaction and limits

- **Redaction.** Fields that could carry sensitive data (error messages, RPC URLs)
  are never collected; only stable, enumerated codes are recorded. If a value does
  not match the expected enum, it is dropped rather than sent.
- **Size limits.** Each event is capped at a small fixed payload; oversized or
  unexpected fields are stripped before transmission.
- **Batching.** Events are batched in memory and flushed on an interval. The buffer
  is bounded; when full, the oldest events are dropped.

## Edge cases

- **No consent given:** module is inert; no requests, no storage writes.
- **Opt-in then revoked:** collection stops immediately and the unsent buffer is
  cleared. Re-enabling starts a fresh buffer.
- **Storage unavailable:** if `localStorage`/`sessionStorage` is blocked or throws
  (private mode, quota, disabled storage), the consent state cannot be persisted.
  In that case telemetry remains **disabled** for the session and no events are sent.
- **SSR / non-browser environments:** when `window`/`navigator` are unavailable, the
  telemetry module is a no-op. It never throws and never attempts network or storage
  access during server-side rendering.

## Configuration

Telemetry is controlled by the user-facing consent setting. There is no build-time
flag that enables telemetry by default; integrators must not force-enable it.

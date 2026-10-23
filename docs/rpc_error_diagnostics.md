# RPC error diagnostics

The `@soroban-resurrect/rpc` package exports helpers that classify raw RPC
responses, redact endpoint credentials, and locate malformed XDR. Use them when
you call an RPC endpoint or decode XDR yourself. `SorobanResurrect` applies the
redaction and XDR diagnostics internally.

## Classifying JSON-RPC HTTP responses

```ts
import { parseJsonRpcResult, RpcResponseError } from '@soroban-resurrect/rpc'

try {
  const result = parseJsonRpcResult(body, response.headers.get('content-type'), response.status)
} catch (err) {
  if (err instanceof RpcResponseError) {
    switch (err.kind) {
      case 'INVALID_CONTENT_TYPE': // proxy or CDN returned a non-JSON page
      case 'MALFORMED_JSON': // declared JSON that does not parse, or not an envelope
      case 'JSON_RPC_ERROR': // envelope has an `error` member; see err.rpcCode
    }
  }
}
```

| Kind                   | Cause                                                                      |
| ---------------------- | -------------------------------------------------------------------------- |
| `INVALID_CONTENT_TYPE` | Content type is missing or not `application/json`, `application/json-rpc` or `+json`. |
| `MALFORMED_JSON`       | Body does not parse, or the parsed value has neither `result` nor `error`. |
| `JSON_RPC_ERROR`       | The envelope has an `error` member. This applies even when HTTP status is 200. |

Error messages never include the response body.

`parseJsonRpcResponse` performs the content type and parse checks without
reading the envelope. Use it when you need the raw envelope.

## Sanitizing provider error payloads

Provider `error` members are untrusted. Before a provider error is surfaced to
a dApp, `@soroban-resurrect/rpc` normalizes it into a stable, safe shape so that
raw or unsafe fields never reach the dApp.

```ts
import { sanitizeProviderError } from '@soroban-resurrect/rpc'

const safe = sanitizeProviderError(rawError)
// { code: number, message: string, data?: unknown }
```

- `code` is preserved when it is a finite number; otherwise it defaults to
  `-32603` (internal error).
- `message` is preserved when it is a string; otherwise it defaults to
  `"Provider error"`. Messages are passed through `redactUrlsInText` so
  credentials embedded in URLs are removed.
- `data` is preserved only when it is a JSON-safe value (object, array, string,
  number, boolean or `null`). Functions, symbols, `undefined` and cyclic
  structures are dropped. Nested strings are redacted with `redactUrlsInText`.
- Any other top-level fields on the raw error are discarded.
- A non-object input (string, number, `null`, `undefined`) yields the default
  `{ code: -32603, message: "Provider error" }`.

`RpcResponseError` with `kind === 'JSON_RPC_ERROR'` exposes the sanitized
payload via `err.rpcError`; `err.rpcCode` and `err.message` are derived from it.
This is a compatibility constraint: consumers that previously read arbitrary
fields off the raw provider error must read them from `err.rpcError.data`
instead.

## Redacting endpoint URLs

```ts
import { redactRpcUrl, redactUrlsInText } from '@soroban-resurrect/rpc'

redactRpcUrl('https://user:pw@rpc.example.com/?apiKey=abc') // https://REDACTED:REDACTED@rpc.example.com/?apiKey=REDACTED
redactUrlsInText('failed: https://rpc.example.com/?token=x')  // failed: https://rpc.example.com/?token=REDACTED
```

- Userinfo (`user:password@`) is always replaced.
- Query parameters whose names contain `key`, `token`, `secret`, `auth`,
  `password` or `signature` (case-insensitive) have their values replaced.
- An input that does not parse as a URL becomes `<invalid url>`.
- Credentials embedded in a URL path segment are **not** detected. Use a
  query parameter. Where your provider supports it, send the key in a request
  header instead.

### Where redaction is applied

Redaction is applied everywhere an RPC endpoint can reach a log line or a
user-facing error, so credentials never leak through diagnostics:

- **Error messages and error context.** `SorobanResurrect` error messages and
  error context use redacted endpoints. The URL used to connect is not changed.
- **Logs.** Endpoint URLs written to logs (including debug and trace output)
  are redacted before they are emitted.
- **Free-form text.** Any message that embeds an endpoint is passed through
  `redactUrlsInText`, so credentials in surrounding prose are stripped too.

### Compatibility constraints

- Redaction only affects how URLs are *displayed*. The endpoint used to make
  requests is never modified, so existing configuration keeps working.
- `redactRpcUrl` and `redactUrlsInText` are pure functions with no side effects
  and no dependency on the network, so they are safe to call in your own error
  handling and logging.
- Non-URL inputs and malformed URLs are replaced with `<invalid url>` rather
  than throwing, so redaction never introduces a new failure path.
- Because path-embedded credentials are not detected, prefer query parameters
  or request headers for provider keys. This is a documented limitation, not a
  behavior change.

## Authentication headers and persisted history

RPC authentication headers are treated as transient request metadata. They are
used to sign the outgoing request but are **never** written to persisted
history (transaction records, error context, or any serialized state).

- Header names are matched case-insensitively, so `Authorization`,
  `authorization`, and `AUTHORIZATION` are all treated the same.
- Every authentication header is stripped, including multiple headers and
  comma-separated values within a single header.
- When no authentication header is present, persisted history is unchanged.
- Redaction applies recursively to nested persisted structures (for example
  request metadata embedded in error context), so a header cannot leak through
  a nested object.

This is a compatibility constraint: code that relied on reading authentication
headers back from persisted history must instead keep them in memory for the
lifetime of the request. No public API signatures change.

## Locating malformed XDR

```ts
import { describeXdrEncoding } from '@soroban-resurrect/rpc'

const diagnostic = describeXdrEncoding(txXdr)
if (!diagnostic.valid) {
  console.warn(diagnostic.problem, diagnostic.invalidByteOffset)
}
```

- `invalidCharIndex`: index in the input string of the first character that is
  not valid base64, or of misplaced padding.
- `invalidByteOffset`: the decoded byte offset at which decoding fails. For a
  truncated input it is the number of bytes that can still be decoded.
- `decodedByteLength`: set only when the input is valid.

This covers the base64 layer only. Structural errors inside a well-formed XDR
payload are raised by the Stellar SDK decoder, which does not report offsets.
When `simulate` rejects an XDR string, the `xdrDiagnostic` field of the error
context contains this diagnostic.

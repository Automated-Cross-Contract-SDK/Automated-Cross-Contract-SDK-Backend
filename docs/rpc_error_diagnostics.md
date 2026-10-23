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

SorobanResurrect error messages and error context use redacted endpoints. The
URL used to connect is not changed.

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

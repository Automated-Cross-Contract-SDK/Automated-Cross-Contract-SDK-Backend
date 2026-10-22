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

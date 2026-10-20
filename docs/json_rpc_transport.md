# JSON-RPC transport

`@soroban-resurrect/rpc` ships a small JSON-RPC 2.0 transport, `JsonRpcTransport`,
for runtimes where the global `fetch` is missing, wrapped, or unsuitable, and for
tests that need to script server responses without a network.

## Injecting a fetch implementation

```ts
import { JsonRpcTransport } from '@soroban-resurrect/rpc';

const transport = new JsonRpcTransport({
  url: 'https://soroban-testnet.example.com',
  fetch: myFetch, // optional; defaults to globalThis.fetch
});

const latest = await transport.request<{ sequence: number }>('getLatestLedger');
```

`fetch` receives `(url, { method: 'POST', headers, body })` and must resolve to an
object with `ok`, `status`, `headers.get(name)` and `text()`. A standard `Response`
satisfies this shape.

If no `fetch` is passed and `globalThis.fetch` is unavailable, the constructor throws
rather than failing on the first request.

## Errors

| Error                   | When                                                     | Key fields                                             |
| ----------------------- | -------------------------------------------------------- | ------------------------------------------------------ |
| `JsonRpcError`          | The server returned a JSON-RPC `error` member            | `code`, `message`, `data`                              |
| `JsonRpcTransportError` | The request failed before a usable response was received | `status` (undefined for network), `retryable`, `cause` |

HTTP `429` and `5xx` responses, and rejected `fetch` calls, are marked `retryable: true`.
Other non-2xx responses are not.

## Response validation

Every response is checked against the JSON-RPC 2.0 envelope before its payload is
returned:

- the body is valid JSON and a JSON object;
- `jsonrpc` is `"2.0"`;
- exactly one of `result` or `error` is present;
- `id` matches the request id (a `null` id is accepted only with an `error`, as the spec allows when the server could not read the request);
- an `error` member has an integer `code` and a string `message`.

A response that fails any of these checks throws `JsonRpcProtocolError` and is never
returned as data. `JsonRpcProtocolError` is not retryable, because a malformed
response usually means a misconfigured endpoint or proxy rather than a transient fault.

## Retries and `Retry-After`

`withRetry(operation, { policy, deadlineMs })` retries retryable `JsonRpcTransportError`s.
`JsonRpcError` and non-retryable transport errors are thrown immediately.

- `policy` supplies `maxRetries` and the backoff, such as `ExponentialBackoff`.
- When a `429` or `5xx` response carries a `Retry-After` header, that wait replaces the
  backoff for that attempt. The header may be a number of seconds or an HTTP-date.
- `deadlineMs` bounds the total time measured from the first attempt. If the next wait
  would run past it, no sleep happens and the last error is thrown.

```ts
import { withRetry, ExponentialBackoff } from '@soroban-resurrect/rpc';

const latest = await withRetry(() => transport.request('getLatestLedger'), {
  policy: new ExponentialBackoff(3, 500),
  deadlineMs: 10_000,
});
```

## Bounding in-flight requests

`maxInFlight` caps how many requests one transport instance has outstanding at a time.
The cap is shared by every caller of that instance, so concurrent client operations
cannot exceed it together. Requests beyond the cap wait in FIFO order and start as slots
free up. A failed request frees its slot like a successful one.

```ts
const transport = new JsonRpcTransport({
  url: 'https://soroban-testnet.example.com',
  maxInFlight: 4,
});
```

Retries made through `withRetry` pass through the same limiter on every attempt, so a
request waiting out a backoff does not hold a slot. The default is unlimited, and a value
below 1 throws a `RangeError` at construction. `createConcurrencyLimiter` is exported for
bounding other async work with the same semantics.

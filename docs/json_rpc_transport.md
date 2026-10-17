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

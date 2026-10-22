# Soroban RPC Version Negotiation Refactor

Adds protocol-version handshake during RPC client initialization to handle multiple node versions.

## Unsupported RPC methods

When an endpoint does not implement a method, it answers with a JSON-RPC
`-32601` ("Method not found") error. `describeUnsupportedMethod` in
`@soroban-resurrect/rpc` converts that error into an `UnsupportedRpcMethodError`
with `code: 'UNSUPPORTED_RPC_METHOD'`. The error carries the method name, the
endpoint URL, and the protocol version when it is known. Other errors pass
through unchanged.

```ts
try {
  return await server.getLedgerEntries(keys)
} catch (err) {
  throw describeUnsupportedMethod(err, {
    method: 'getLedgerEntries',
    endpointUrl,
    protocolVersion,
  })
}
```

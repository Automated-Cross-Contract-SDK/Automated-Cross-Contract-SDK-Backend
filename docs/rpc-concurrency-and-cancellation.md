# RPC Concurrency Limits, Cancellation and XDR Input Bounds

## Endpoint concurrency limits

`createConcurrencyLimiter(maxConcurrent)` from `@soroban-resurrect/rpc` queues
calls FIFO so that at most `maxConcurrent` are in flight.

- Set `maxConcurrent` at or below the provider's in-flight limit. The limiter
  then never triggers the provider's 429 / "too many requests" response.
- If `maxConcurrent` is above the provider limit, the excess calls are rejected
  by the provider and the rejection is returned to the caller unchanged. The
  limiter does not retry; wrap the task in `withRetry` if needed.
- A rejected call releases its slot, so queued calls keep running.

## Cancelling signing, submission and confirmation

Pass an `AbortSignal` as `signal` in the `SorobanResurrect` config:

```ts
const controller = new AbortController()
const client = new SorobanResurrect({ rpcUrl, networkPassphrase, signal: controller.signal })
```

The signal is checked at each stage boundary. When aborted, the call rejects
with an error whose `name` is `AbortError`, `cause` is `signal.reason`, and:

| Aborted                                 | `stage`        | `txHash` | Effect                                   |
| --------------------------------------- | -------------- | -------- | ---------------------------------------- |
| Before signing                          | `signing`      | unset    | Wallet is not called.                    |
| While the wallet is signing             | `submission`   | unset    | Signed transaction is not sent.          |
| After `sendTransaction`, before polling | `confirmation` | set      | Transaction was sent and may still apply |
| Between confirmation polls              | `confirmation` | set      | Polling stops; transaction may still apply |

A receipt returned by the poll that was already in flight wins over an abort
that happens during that poll. The signal does not interrupt an in-flight
`signTransaction` callback or RPC request; it takes effect at the next check.

## XDR decoder input bounds

`packages/footprint-parser/tests/xdr-fuzz.test.ts` fuzzes footprint and ledger
key decoding with a seeded PRNG. The supported behavior is:

- Truncated input, trailing bytes and oversized length prefixes are rejected
  with an `Error`; nothing is allocated for the claimed length.
- Large well-formed footprints (2000 keys) decode and parse.
- Deeply nested `ScVal` keys either decode or are rejected with an `Error` by
  the Stellar SDK's depth limit.
- Random byte mutations never throw a non-`Error` value, and any footprint
  that still decodes can be passed to `extractKeysFromFootprint`.

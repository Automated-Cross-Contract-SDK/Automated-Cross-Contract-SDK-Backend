# Testing & Benchmarks

## Documentation snippets (#589)

Every ` ```ts `, ` ```tsx `, ` ```js ` fence in `README.md`, `packages/sdk/README.md`
and `docs/*.md` is transpiled with the TypeScript compiler as part of CI
(`npm run test:docs -w packages/sdk`). A snippet with a syntax error fails the build.

To opt a fence out (e.g. intentionally partial pseudo-code), add `no-compile`
to its info string:

````md
```ts no-compile
client.execute(/* ... */
```
````

## RPC provider error compatibility (#590)

`tests/rpc-error-compat.test.ts` covers error shapes seen from real providers:
fetch `TypeError`s, axios timeouts and HTTP 429/503 responses, JSON-RPC error
objects (`-32603`, `-32601`), `ECONNRESET`, plain strings and `null`/`undefined`
rejections. Supported behaviour:

- Any non-`SorobanResurrectError` rejection is wrapped as `SorobanResurrectError`
  with code `NETWORK_ERROR`; the raw value is available on `error.cause`.
- Wrapped errors are retried per the configured `retryPolicy`.
- Non-transient SDK codes (e.g. `INVALID_XDR`) are not retried, and existing
  `SorobanResurrectError` instances are rethrown unchanged.

No public API changes.

## Footprint parser throughput & memory (#591)

`tests/benchmarks/footprint-parser.perf.test.ts` decodes, classifies and
encodes footprints of 10, 100, 1,000 and 5,000 keys and prints keys/sec,
ms/run and peak heap delta. It asserts a throughput floor, a 256 MB heap
ceiling and no super-linear scaling. For accurate heap numbers run:

```bash
node --expose-gc node_modules/vitest/vitest.mjs run tests/benchmarks
```

## Restoration latency by stage (#592)

`tests/benchmarks/restoration-latency.perf.test.ts` injects fixed RPC and
wallet latencies and attributes elapsed time to the **simulation**,
**signing** and **submission** stages, asserting SDK overhead stays under
50 ms, stages run sequentially, and a failure in one stage prevents the
later stages from running.

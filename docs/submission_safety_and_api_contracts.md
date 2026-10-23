# Submission Safety, Result Contracts & API Baseline

## Ambiguous submission timeouts (#585)

If `sendTransaction` times out or fails at the network level after all retries,
the transaction **may still have reached the network**. The SDK never re-signs
in that case. Instead it computes the transaction hash locally and checks it
with `getTransaction`:

| Lookup result      | Behavior                                                        |
| ------------------ | --------------------------------------------------------------- |
| `SUCCESS`          | Treated as submitted; the hash is returned.                     |
| `FAILED`           | Throws `ORIGINAL_TX_FAILED` with `txHash`.                      |
| `NOT_FOUND` / error | Throws the new code `SUBMISSION_AMBIGUOUS` with `txHash`.      |

On `SUBMISSION_AMBIGUOUS`, check `error.txHash` again later (or wait for the
transaction's time bounds to expire) **before** building a replacement
transaction, otherwise the operation could execute twice.

**API change:** `SorobanResurrectError['code']` gains `'SUBMISSION_AMBIGUOUS'`.
Exhaustive `switch` statements over `code` need a new branch.

## Restoration result type contracts (#586)

`RestoreBatchResult`, `RestoreAllBatchesResult` and `ConcurrentRestoreResult`
are now defined in `@soroban-resurrect/sdk` (they were exported but missing).
`tests/restoration-result-contract.test.ts` pins their shapes and checks that
the React adapter exposes `ExecutionResult` unchanged. Changing these shapes is
a breaking change for every framework adapter.

## Mock-RPC reproduction fixtures (#587)

Integration tests wrap the RPC server with `recordRpc`
(`packages/sdk/tests/helpers/mock-rpc-recorder.ts`). When a test fails, every
RPC call and response is written to `packages/sdk/tests/fixtures/repro/<test>.json`
(override with `SOROBAN_REPRO_DIR`). Replay offline with:

```ts
import { createReplayServer } from './helpers/mock-rpc-recorder.js'
const server = createReplayServer(JSON.parse(readFileSync(file, 'utf8')))
vi.spyOn(client as any, 'getServer').mockReturnValue(server)
```

The repro directory is git-ignored; commit a fixture deliberately when turning
it into a regression test.

## Public export baseline (#588)

`api-baseline/<package>.json` lists every runtime and type export of each
package entry point. `packages/sdk/tests/public-exports.test.ts` fails when the
real exports drift from the baseline, so every public API change is visible in
review. After an intentional change, update the JSON in the same PR.

# 🔬 Performance Benchmarks

Benchmarks are run on every PR to detect performance regressions.  
If a PR causes a slowdown beyond the per-benchmark threshold below, CI will fail.

## Running locally

```bash
cd packages/sdk
npx tsx scripts/benchmark.ts
```

This writes `benchmark-results.json` in the current directory. The file is a
local artifact only — it is **not** committed to the repository.

## Benchmarks measured

1. **extractKeysFromFootprint** — parse 1000 keys
2. **classifyLedgerKey** — classify 540 keys
3. **classifyDeferredKeys** — classify 540 deferred keys (Task 1 optimization)
4. **extractFootprintFromTransactionStreaming** — parse of a 5MB XDR envelope (see note below)
5. **detectArchivedKeys** — detect archived from mixed live/archived set

## Note on `extractFootprintFromTransactionStreaming`

Despite the name, this function is **not** a true incremental/streaming parser. It
currently decodes the full `TransactionEnvelope` via `xdr.TransactionEnvelope.fromXDR(buffer)`
and then extracts the Soroban footprint from the decoded envelope. The memory
characteristics are therefore the same as a full envelope parse — the only saving
versus the non-streaming path is that the `Transaction` object is not built.

The benchmark below measures wall-clock time and peak memory for parsing a 5MB
synthetic XDR envelope. The recorded memory reflects the full-envelope decode, not
a 50MB streaming target. If/when a hand-rolled XDR cursor is implemented, this
benchmark should be updated to assert the reduced memory profile.

## Regression thresholds

| Metric | Threshold |
|--------|-----------|
| extractKeysFromFootprint | >20% slower |
| classifyLedgerKey | >30% slower |
| classifyDeferredKeys | >20% slower |
| envelope parse (5MB XDR) | >30% slower |
| detectArchivedKeys | >20% slower |

## Output

Results are stored in `benchmark-results.json` and compared against the base branch.
A PR comment is posted with the diff. The 5MB XDR benchmark records both elapsed
time and peak heap usage so the actual memory profile of the envelope parse is
tracked over time.

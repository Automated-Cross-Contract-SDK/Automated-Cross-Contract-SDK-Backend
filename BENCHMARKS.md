# 🔬 Performance Benchmarks

Benchmarks are run on every PR to detect performance regressions.  
If a PR causes >20% slowdown in any benchmark, CI will fail.

## Running locally

```bash
cd packages/sdk
npx tsx scripts/benchmark.ts
```

## Benchmarks measured

1. **extractKeysFromFootprint** — parse 1000 keys
2. **classifyLedgerKey** — classify 540 keys
3. **classifyDeferredKeys** — classify 540 deferred keys (Task 1 optimization)
4. **extractFootprintFromTransactionStreaming** — streaming parse of 5MB XDR
5. **detectArchivedKeys** — detect archived from mixed live/archived set

## Regression thresholds

| Metric | Threshold |
|--------|-----------|
| extractKeysFromFootprint | >20% slower |
| classifyLedgerKey | >30% slower |
| classifyDeferredKeys | >20% slower |
| streaming parse | >30% slower |
| detectArchivedKeys | >20% slower |

## Output

Results are stored in `benchmark-results.json` and compared against the base branch.
A PR comment is posted with the diff.

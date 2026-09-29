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

## How the PR comparison works

1. On every pull request, `.github/workflows/benchmark.yml` runs the benchmark
   suite on the PR head and uploads `benchmark-results.json` as a workflow
   artifact.
2. The baseline is the most recent `benchmark-results.json` artifact produced
   by a run on `main`. It is stored as a workflow artifact (not a committed
   JSON file) so baselines never cause merge conflicts.
3. The workflow downloads the baseline artifact, computes the per-benchmark
   percentage delta against the thresholds table above, and fails the job when
   any benchmark exceeds its threshold.
4. The comparison result is posted (and updated in place on subsequent pushes)
   as a PR comment.

If no baseline artifact exists yet (e.g. the first run on a fresh fork), the
comparison step is skipped and the PR is not failed on regression grounds.

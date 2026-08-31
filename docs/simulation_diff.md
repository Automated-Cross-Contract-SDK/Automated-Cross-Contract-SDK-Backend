# Transaction Simulation Diff Report

`SorobanResurrect.simulateDiff()` returns a before/after view of every ledger
entry in a transaction's footprint: which entries are live, which are archived,
the on-chain data that would be restored, the total bytes involved and the
projected TTL change for each restored entry.

It is a **read-only** debugging aid — no transaction is ever submitted.

## Usage

```ts
const diff = await sdk.simulateDiff(txXDR)

console.log(`${diff.entries.length} entries in footprint`)
console.log(`needs restoration: ${diff.needsRestoration}`)
console.log(`bytes to restore: ${diff.totalBytesRestored}`)

for (const e of diff.entries) {
  console.log(`${e.status.padEnd(9)} ${e.keyBase64}`)
}

for (const t of diff.ttlChanges) {
  console.log(`${t.key}: TTL ${t.oldTTL} -> ${t.newTTL}`)
}
```

## Shape

```ts
interface SimulationDiff {
  entries: Array<{
    key: ArchivedKey            // classified ledger key
    keyBase64: string           // stable identifier
    before?: string             // current LedgerEntryData XDR (base64), if still readable
    after?: string              // expected LedgerEntryData XDR (base64) after restore
    status: 'live' | 'archived' | 'restored'
  }>
  totalBytesRestored: number    // Σ byte size of entries that would be restored
  ttlChanges: Array<{ key: string; oldTTL: number; newTTL: number }>
  latestLedger?: number         // ledger the RPC evaluated against
  needsRestoration: boolean
}
```

### `status`

| value | meaning |
|-------|---------|
| `live` | Entry present and not expired — no restore needed. `before` == `after`. |
| `archived` | Entry archived and **not** part of the restore plan (rare — only when classification excludes it). |
| `restored` | Entry archived and included in the restore plan. `before`/`after` hold its data when the RPC still returns it; restoration changes only the TTL, not the data. |

### `oldTTL` / `newTTL`

`oldTTL` is the entry's current `liveUntilLedgerSeq` (`0` when the RPC no longer
returns the entry). `newTTL` is a **projection**: `latestLedger +
minimumPersistentEntryLifetime`. The lifetime defaults to `4096` ledgers
(`RESTORED_ENTRY_TTL_LEDGERS`) and is network-dependent — override it per call:

```ts
await sdk.simulateDiff(txXDR, source, { restoredTtlLedgers: 120_960 })
```

## Notes

- The footprint is read from the transaction's own Soroban data when present;
  otherwise the SDK runs one `simulateTransaction` RPC call to obtain it.
- `before` is omitted when the RPC no longer returns the archived entry (fully
  evicted persistent entries, expired temporary entries). `totalBytesRestored`
  then falls back to the ledger key size for that entry.
- With `tracing` enabled, the RPC calls made by `simulateDiff` are traced like
  any other (`getLedgerEntries(diff)`, `simulateTransaction(diff)`).

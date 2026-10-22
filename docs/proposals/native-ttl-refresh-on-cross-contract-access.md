# Proposal: Native TTL Refresh on Cross-Contract Entry Access

- **Status:** Draft
- **Author:** Soroban-Resurrect maintainers (`Automated-Cross-Contract-SDK`)
- **Target venue:** Stellar Developer Mailing List / Soroban Protocol Discussion Forum
- **Related work:** CAP-0046 (Soroban runtime), CAP-0053 (state archival), CAP-0062 / CAP-0066 (state archival interface), [`@soroban-resurrect/sdk`](../../packages/sdk)
- **Created:** 2026-08-28

---

## Abstract

This proposal asks the Soroban protocol to **automatically bump the live-until ledger (TTL) of persistent and instance storage entries when they are read or written during a cross-contract call**, using the same auto-bump semantics the host already applies to entries touched directly by the top-level invocation.

Today, only the entries in a transaction's *declared footprint* are considered for TTL treatment, and TTL extension for entries reached transitively through `invoke_contract` is neither automatic nor guaranteed to be predictable at submission time. As a result, a contract that is called frequently *through other contracts* — but rarely as the direct invocation target — can have its state silently archived even though it is, in practice, hot. Downstream, this forces every dApp and SDK (including this project) to run a simulate → detect-archived → build-restore → re-simulate loop before nearly every transaction.

We propose making transitive read/write access a first-class TTL-refresh trigger, bounded by explicit, gas-metered limits, and gated behind a network setting so the change is observable and reversible.

## Motivation

### 1. Gas / fee costs

The current workaround requires, in the worst case:

1. A simulation of the original transaction.
2. Parsing the resulting `RestorePreamble` / footprint to identify archived keys.
3. Construction and submission of one or more `RestoreFootprintOp` transactions (each with its own base fee, Soroban resource fee, and rent fee).
4. A second simulation of the original transaction against the now-restored state.
5. Submission of the original transaction.

Steps 1–4 are pure overhead that exists only because the protocol will not refresh an entry it *just read* inside a nested call. For a multi-entry restore this is several transactions and several rent payments where the user conceptually performed one action.

### 2. User experience

Wallets and dApps must expose a multi-step "your data expired, approve these restore transactions first" flow. Users routinely abandon transactions at this point because the restore step looks like an unexpected, unexplained fee. Native refresh collapses this back to a single signature.

### 3. Security and correctness

The detect-and-restore pattern has sharp edges that a protocol-level solution removes:

- **TOCTOU windows.** State can be archived between the pre-flight simulation and final submission, so the "safe" transaction still fails. Native refresh happens atomically inside the same host invocation.
- **Footprint under-declaration.** Clients must predict every transitively-touched key to build a correct restore set. Mispredictions cause either failed transactions or over-broad footprints. The host already knows the real access set — it should act on it.
- **Griefing via archival.** An adversary can let a rarely-top-level-but-frequently-nested contract's storage archive, then front-run legitimate users who now must pay to restore shared state. Auto-refresh on access removes the incentive.

### 4. Ecosystem consistency

Every serious Soroban integration re-implements some flavor of this workaround. Standardizing the behavior in the host removes an entire class of SDK code, test surface, and divergent behavior between clients.

## Specification

> Notation follows the Soroban host / `soroban-env-host` conventions. Ledger numbers are `u32`. "Auto-bump" refers to the existing mechanism that raises an entry's `liveUntilLedgerSeq` toward a target derived from network settings when the entry is accessed.

### 1. Access-triggered TTL refresh

Extend the host storage layer so that **any successful `get`, `has`, `update`, or `put` on a `PERSISTENT` or `INSTANCE` storage entry** performed by *any* frame on the invocation stack (not only the root frame) marks that entry's `LedgerKey` as *TTL-touched* for the transaction.

At the end of a successful transaction, for every TTL-touched key whose entry is still live:

```
new_live_until = max(
    current_live_until,
    current_ledger + StateArchivalSettings.min_persistent_ttl        // for PERSISTENT
    // or .min_temporary_ttl-equivalent target for INSTANCE
)
new_live_until = min(new_live_until, current_ledger + StateArchivalSettings.max_entry_ttl)
```

This is exactly the target already used for entries in the declared footprint; the only change is *which* accesses qualify a key.

### 2. Archived-entry access inside a nested call

When a nested `invoke_contract` frame accesses a key that is **archived but restorable** (persistent entry past `liveUntilLedgerSeq`, within the restorable window):

- **Default (setting `autoRestoreOnAccess = false`):** behavior is unchanged — the host traps with `ExceededLimit` / archival error, as today.
- **Opt-in (setting `autoRestoreOnAccess = true`):** the host restores the entry in place, charges the rent fee for the restoration to the transaction's Soroban resource fee, records the key in the transaction meta (`autoRestoredKeys`), and continues execution. If the transaction's declared `refundableFee` / resource fee is insufficient to cover the restoration, the host traps (no partial restore).

### 3. New / modified network settings

Add to `StateArchivalSettings` (via a `ConfigSettingEntry` bump):

| Field | Type | Meaning |
|---|---|---|
| `ttlRefreshOnNestedAccess` | `bool` | Master switch for §1. Default `true` on new networks; introduced as `false` then flipped by validator vote on existing networks. |
| `autoRestoreOnAccess` | `bool` | Enables §2 opt-in restore. Default `false`. |
| `maxTtlTouchedKeysPerTx` | `u32` | Upper bound on the number of distinct keys that may be TTL-touched by §1 in one transaction. Excess accesses still succeed for execution purposes but do not extend TTL, and set a `ttlRefreshTruncated` flag in tx meta. |
| `maxAutoRestoreKeysPerTx` | `u32` | Upper bound on §2 auto-restores per transaction. Exceeding it traps. |

### 4. Metering and fees

- TTL-touching a key costs a fixed, cheap `CpuInsn` + `MemByte` amount per key (proposed: reuse the `ExtendTtl` charge model, scaled down since no ledger entry is written until commit). This is added to the metered Soroban resource usage and must fit within declared limits.
- §2 auto-restore charges the full rent fee for the restored entry, identical to an explicit `RestoreFootprintOp` for the same key, drawn from the transaction's refundable resource fee.
- TTL bumps from §1 that only *raise* `liveUntilLedgerSeq` on an already-live entry incur the standard rent bump fee, as today for footprint entries.

### 5. Transaction meta

Add to `SorobanTransactionMeta`:

```
struct SorobanTransactionMetaExtV2 {
    LedgerKey  ttlTouchedKeys<>;      // keys whose TTL was refreshed via §1
    LedgerKey  autoRestoredKeys<>;    // keys restored via §2
    bool       ttlRefreshTruncated;   // maxTtlTouchedKeysPerTx hit
};
```

This gives indexers, wallets, and SDKs a precise, post-hoc account of what the host did, replacing today's client-side inference.

### 6. Simulation

`simulateTransaction` in Soroban RPC must apply §1 and (when enabled) §2, and surface the resulting `ttlTouchedKeys` / `autoRestoredKeys` and their fee impact in the response, so clients can show accurate fees before signing. When `autoRestoreOnAccess` is enabled, the `RestorePreamble` returned by simulation becomes advisory (informational) rather than a required pre-step.

## Rationale

### Why refresh on access rather than require complete footprints?

Complete transitive footprints are knowable only by executing the transaction. Pushing that requirement onto clients is what created the current workaround. The host already computes the true access set during execution; §1 simply lets it act on that knowledge.

### Why gate behind settings instead of changing behavior unconditionally?

State archival economics (rent income, ledger growth rate) are load-bearing for validators. A silent change to *which* entries get TTL bumps changes rent revenue and archival throughput. Settings + validator vote make the rollout observable and reversible.

### Why make auto-restore (§2) opt-in and separate from §1?

§1 is low-risk: it only affects live entries and mirrors existing semantics. §2 changes failure into success and moves fee liability, which is a larger behavioral and economic change. Splitting them lets the network adopt the cheap win first.

### Why per-transaction caps?

Without `maxTtlTouchedKeysPerTx`, a transaction that fans out across many contracts could cheaply pin large numbers of entries live, undermining archival. The cap bounds the blast radius while covering the overwhelming majority of real transactions (which touch a handful of entries).

### Trade-offs

- **Ledger growth:** More entries stay live longer. Mitigated by caps and by the fact that these entries are, by definition, actively accessed.
- **Rent revenue timing:** Shifts some rent payment from explicit restore ops to inline bumps; net neutral to slightly positive (fewer transactions abandoned).
- **Host complexity:** Storage layer must track a per-transaction touched-key set across frames. This structure largely exists already for footprint enforcement.

## Backwards compatibility

- **Contracts:** No source changes required. No ABI or interface change. Contracts that today call `env.storage().persistent().extend_ttl(...)` defensively continue to work; those calls become redundant but not harmful.
- **Existing transactions:** With `ttlRefreshOnNestedAccess = false` at activation, behavior is byte-for-byte identical to today. Flipping it to `true` can only *extend* TTLs that would otherwise have expired — it never shortens a TTL and never changes execution results (§1). No transaction that succeeds today fails after the change.
- **`autoRestoreOnAccess`:** Off by default. When on, some transactions that currently trap will instead succeed and cost more (bounded, disclosed in simulation). Nothing that succeeds today changes outcome.
- **XDR:** Additive only — new optional `ConfigSettingEntry` fields and a new `SorobanTransactionMetaExt` arm. Old clients ignore the new meta; they lose visibility into auto-refresh but not correctness.
- **SDKs / this project:** `@soroban-resurrect/sdk` continues to function unchanged. On networks with §1 enabled its detect-and-restore path becomes a rarely-taken fallback; with §2 enabled it degrades to a no-op advisory layer. We would ship a release that treats `ttlTouchedKeys` / `autoRestoredKeys` from simulation as authoritative and skips the manual restore build.

## Reference implementation

- **SDK-level emulation of the target behavior** (what this proposal would make native): [`packages/sdk/src/soroban-resurrect.ts`](../../packages/sdk/src/soroban-resurrect.ts) — `simulate()` detects archived keys reached through cross-contract calls, `buildRestoreTransaction()` / `executeRestoreThenOriginal()` perform the restore-then-run flow, and `AuthEntryRestoration` ([`packages/sdk/src/auth-entry-restoration.ts`](../../packages/sdk/src/auth-entry-restoration.ts)) handles the transitive-key case.
- **Footprint extraction / transitive key discovery:** [`packages/footprint-parser-wasm`](../../packages/footprint-parser-wasm) and [`docs/auth_entry_restoration.md`](../auth_entry_restoration.md).
- **Batching + fee estimation** for multi-entry restores (models §4 costs): restore-batch logic in `soroban-resurrect.ts` and [`BENCHMARKS.md`](../../BENCHMARKS.md).
- A host prototype for §1 would live as a patch to `soroban-env-host`'s storage module (`Storage::get` / `Storage::put`) plus a `StateArchivalSettings` field; we are willing to co-author it with the Soroban core team.

## Open questions

1. Should `INSTANCE` storage (contract instance + Wasm) be in scope for §1, or only `PERSISTENT` data entries? Instance archival already has distinct handling.
2. Should §1 also cover the *read* of a contract's Wasm code entry during nested `invoke_contract`, so actively-called contracts don't have their code archived?
3. Is `maxTtlTouchedKeysPerTx` better expressed as a resource-fee dimension (pay for more) rather than a hard cap?
4. For §2, should the fee come from a dedicated `restoreFee` field rather than the shared refundable resource fee, for clearer accounting?

## Changelog

- 2026-08-28: Initial draft.

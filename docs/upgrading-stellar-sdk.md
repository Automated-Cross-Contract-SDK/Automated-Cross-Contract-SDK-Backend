# Upgrading `@stellar/stellar-sdk`

Dependabot groups `@stellar/stellar-sdk` into its own update PR. Those PRs are **not**
auto-merged. They get the `integration` label and wait for a maintainer to run the
testnet integration suite. Unit tests mock the RPC, so they cannot catch changes in
how the real Soroban RPC responds.

## Checklist

1. Read the upstream release notes for every version between the current pin and the
   target. Pay attention to Soroban RPC method changes and Protocol 20/21/22 changes.
2. Confirm each RPC call site in `packages/rpc/src/stellar-sdk-adapter.ts` still matches
   the installed SDK's types and return shapes:
   - `simulateTransaction`: the result shape (`restorePreamble`, `footprint`,
     `minResourceFee`) that archived-key detection depends on.
   - `getTransaction`: status values and the `resultMetaXdr` fields read after a send.
   - `getLedgerEntries`: the entry shape and the `liveUntilLedgerSeq` TTL field.
   - `sendTransaction`: the `status` values (`PENDING`, `DUPLICATE`, `TRY_AGAIN_LATER`,
     `ERROR`) and how each one is mapped to errors.
3. Check the restore transaction builder in `packages/core` still produces a valid
   `RestoreFootprint` operation for the new `TransactionBuilder` API.
4. Run the unit suite: `npm run test`.
5. Run the testnet integration suite. Add the `safe-to-test` label to the PR so the
   `integration-tests` job runs, or wait for the nightly run (#291).
6. Check the bundle size, since the SDK version can change it: `npm run size`.
7. Merge only after integration passes. Dependabot will not merge this PR for you.

## Rollback

If integration fails after merge, revert the bump commit and re-open the upgrade as
a new issue. Record the RPC behavior that changed in that issue.

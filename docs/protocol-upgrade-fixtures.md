# Refreshing Protocol-Upgrade Fixtures

Protocol-upgrade fixtures are JSON files that describe how the SDK should
behave across a Soroban protocol upgrade. Maintainers refresh them with
`scripts/refresh-protocol-fixtures.mjs`.

## Fixture format

Each `.json` file must be an object with:

- `protocolVersion`: integer protocol version the fixture describes.
- `name`: non-empty string.

Other fields are copied as-is. Keys are written in sorted order so diffs stay
readable.

## Refreshing

```sh
node scripts/refresh-protocol-fixtures.mjs --from <upstream-dir>
```

This validates every fixture in `<upstream-dir>` and writes the changed ones to
`packages/sdk/tests/fixtures/protocol-upgrade/`. Use `--out <dir>` to choose a
different destination.

## Checking in CI

```sh
node scripts/refresh-protocol-fixtures.mjs --from <upstream-dir> --check
```

`--check` writes nothing. It exits with status 1 when the committed fixtures
differ from upstream, and with status 2 when a fixture is invalid.

## Deterministic end-to-end runs

`MockRpcServer` now honours its `protocolVersion` option in `getNetwork` and `getLatestLedger`
(previously hard-coded to 22). `packages/mock-rpc/tests/pinned-protocol-e2e.test.ts` boots one
server per entry in `PROTOCOL_LINE_FIXTURES` and asserts the pinned line is reported, repeated
runs are identical, and each line is distinguishable.

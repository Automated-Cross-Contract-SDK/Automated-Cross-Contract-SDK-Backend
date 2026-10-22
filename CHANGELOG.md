# Changelog

All notable changes to this project are documented here.

Releases from `0.1.0` onward are generated automatically by
[semantic-release](https://semantic-release.gitbook.io/) from
[Conventional Commits](https://www.conventionalcommits.org/). **Do not edit the
entries below `## [Unreleased]` by hand** — they are managed by the release
pipeline (`.github/workflows/release.yml`). The `0.1.0` section below is retained
as the historical baseline.

## [0.1.0] — 2026-07-13

### Added

- **Core SDK** (`@soroban-resurrect/sdk`): `SorobanResurrect` class wrapping Soroban RPC
  - `simulate()` — intercepts `simulateTransaction`, parses footprint, detects archived keys via `getLedgerEntries`
  - `buildRestoreTransaction()` — generates `RestoreFootprintOp` XDR with auto-batching for large key sets
  - `executeRestoreThenOriginal()` — sequential execution: restore tx → poll → original tx
  - `checkAndPrepare()` — single-call detect + build pipeline
  - Automatic retry with exponential backoff (3 attempts)
  - XDR size batching (splits keys exceeding 100KB limit)
  - `footprint-parser.ts` — extract, classify and encode ledger keys from transaction footprints

- **React Integration** (`@soroban-resurrect/react`):
  - `useSorobanResurrect()` hook — `executeWithRestore()`, `checkTransaction()`, reactive state, callbacks
  - `SorobanResurrectProvider` — context provider for app-wide configuration
  - `useSorobanResurrectContext()` — consumer hook for accessing resurrect methods
  - Freighter wallet integration support

- **Testing & Benchmarks**:
  - 21 SDK unit/integration tests (footprint parser, error handling, full flow)
  - 21 React hook tests (all states, error paths, context provider)
  - Large-footprint performance benchmarks (540 keys across 12 contracts):
    - Key classification under 100ms
    - Footprint parsing under 5ms
    - Archived key detection under 50ms
    - Full pipeline under 500ms
  - Soroban testnet integration tests (gated behind `RUN_INTEGRATION_TESTS=true`)

- **Infrastructure**:
  - Monorepo with npm workspaces
  - GitHub Actions CI (Node 18/20/22, test, build, typecheck)
  - Automated npm publishing and GitHub releases via semantic-release
  - `vitest` with per-package configuration
  - `@testing-library/react` with jsdom for React tests
  - Example dApp with Vite + React + Freighter wallet

### Fixed

- Placeholder repository URLs in all package.json files corrected to actual GitHub URL
- Dynamic `import()` calls in React hook replaced with static top-level imports
- Unsafe `require()` calls replaced with synchronous static imports

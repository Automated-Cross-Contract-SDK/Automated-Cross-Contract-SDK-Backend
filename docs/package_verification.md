# Package Verification & Performance Tracking

Tooling under `scripts/` that checks what consumers actually receive from `npm pack`,
how much each import costs, and how footprint parsing scales. Build first: `npm run build`.

Packages without a `dist/` folder are skipped with a warning. Third-party peers
(`@stellar/stellar-sdk`, `react`, …) are linked from the workspace `node_modules`,
so the checks run offline.

## Export maps from a clean packed consumer — `npm run verify:exports`

For every publishable package it:

1. Runs `npm pack` and extracts the tarball into a throwaway consumer project
   (no workspace symlinks — only files listed in `files` are present).
2. Confirms every file referenced by every export condition exists in the tarball.
3. Loads each entry in Node with `import()` and, when a `require` condition exists, `require()`.
4. Bundles each entry with esbuild for `platform: browser` and `platform: node`
   (adding the `react-native` condition for React Native entries).

Exits non-zero on any failure. React Native-only entries are bundler-checked but not
loaded in Node.

## Import startup & bundle cost — `npm run bench:bundle`

From the same packed consumer it reports, per export entry, minified and gzipped
browser bundle size (peers external) and median cold `import()` time in Node
(`IMPORT_RUNS`, default 5). Limits live in `scripts/bundle-budgets.json`
(`gzipBytes`, `importMs`); exceeding one fails the run. Use `--json` for raw output.
Raise a budget deliberately in the same PR that grows a package.

## Large-footprint parsing profile — `npm run profile:footprint`

Builds real `LedgerFootprint` XDR (contract data, code and TTL keys) and times
decode → `extractKeysFromFootprint` → `classifyLedgerKey` → `encodeLedgerKey`.

- **Server (Node):** `npm run profile:footprint`
- **Browser:** `npm run profile:footprint -- --browser` writes
  `scripts/.out/footprint-profile.html`; open it in any browser and results print
  to the page and console.

Sizes are set with `FOOTPRINT_SIZES` (default `100,1000,5000`). Correctness and a
coarse time bound for 5000-key footprints, plus empty and malformed input, are
covered by `packages/sdk/tests/footprint-parser.large.test.ts`.

No public API changes.

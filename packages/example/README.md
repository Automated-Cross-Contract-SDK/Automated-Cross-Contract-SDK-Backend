# @soroban-resurrect/example

Example dApp showcasing Soroban-Resurrect with Freighter wallet integration.

## Quick Start

```bash
npm install
npm run dev
```

## Panels

- **Restoration Lifecycle** (`src/RestorationFlowVisualizer.tsx`) — animated,
  framer-motion-driven flow diagram of the six restoration phases (input →
  simulate → detect archived → build restore → execute restore → execute
  original), with per-step timing, pulsing archived/queued entries, per-batch
  checkmarks, and a confetti burst on success.
- **Restoration History** (`src/RestorationHistoryViewer.tsx`) — table of past
  restoration operations (timestamp, status, entries restored, duration, tx
  hash), expandable rows with the archived-key breakdown, StellarExpert links,
  status filtering, CSV/JSON export, and a clear-history action. Backed by
  `useSorobanResurrect({ persistHistory: true })`, which persists to
  `localStorage`.


# @soroban-resurrect/example

Example dApp showcasing Soroban-Resurrect with Freighter wallet integration.

## Quick Start

```bash
npm install
npm run dev
```

## Features

- **Pre-flight check & execute** — paste raw XDR, detect archived entries, restore & submit.
- **Transaction Builder** — step-by-step wizard to construct Soroban invoke-contract
  transactions (contract dropdown, method, type-aware args, network selector, fee
  override, XDR output, check & execute) without hand-editing XDR.
- **Multi-contract scenarios** — reference gallery of cross-contract restoration cases
  (`src/scenarios.ts`): call graph, explanation, example XDR, expected archived keys,
  and restoration outcome.
- **Theming** — design tokens (`src/theme.ts`), light/dark toggle, toast notifications,
  and accessible components (`src/components.tsx`).


# Packages

This monorepo ships the `@soroban-resurrect/*` packages. The core SDK is now a
compatibility façade over a set of modular packages, so you can depend on the
whole SDK or only the pieces you need.

## Core & shared

| Package | Description | Status |
|---------|-------------|--------|
| `@soroban-resurrect/sdk` | Compatibility façade that re-exports the modular packages as a single entry point. | Stable |
| `@soroban-resurrect/core` | Core resurrection logic and orchestration. | Stable |
| `@soroban-resurrect/types` | Shared TypeScript types used across the packages. | Stable |
| `@soroban-resurrect/errors` | Shared error classes and error codes. | Stable |
| `@soroban-resurrect/utils` | Common utilities shared across the packages. | Stable |
| `@soroban-resurrect/rpc` | Typed Soroban RPC client. | Stable |
| `@soroban-resurrect/footprint-parser` | Parses Soroban ledger footprints. | Stable |
| `@soroban-resurrect/footprint-parser-wasm` | WebAssembly build of the footprint parser. | Experimental |
| `@soroban-resurrect/compat` | Migration path from the legacy single-package SDK to the modular packages. | Stable |
| `@soroban-resurrect/mock-rpc` | In-memory mock RPC server for tests and local development. | Stable |
| `@soroban-resurrect/wallet-adapters` | Adapters for common Stellar wallets. | Stable |

## Framework bindings

| Package | Description | Status |
|---------|-------------|--------|
| `@soroban-resurrect/react` | React hooks and components. | Stable |
| `@soroban-resurrect/next` | Next.js integration and helpers. | Stable |
| `@soroban-resurrect/react-native` | React Native bindings. | Experimental |
| `@soroban-resurrect/angular` | Angular services and providers. | Stable |
| `@soroban-resurrect/vue` | Vue composables and plugins. | Stable |
| `@soroban-resurrect/svelte` | Svelte stores and components. | Stable |

## Tooling & examples

| Package | Description | Status |
|---------|-------------|--------|
| `@soroban-resurrect/cli` | Command-line tooling for the SDK. | Stable |
| `@soroban-resurrect/devtools-extension` | Browser devtools extension for inspecting resurrection activity. | Experimental |
| `@soroban-resurrect/vscode-extension` | VS Code extension for the SDK. | Experimental |
| `@soroban-resurrect/example` | Example application demonstrating the packages. | Experimental |

## Migrating from the legacy SDK

If you currently depend on `@soroban-resurrect/sdk` as a single entry point, it
continues to work as a compatibility façade. To adopt the modular packages,
use `@soroban-resurrect/compat` to bridge the legacy API while you migrate
individual imports to `@soroban-resurrect/core`, the framework bindings, and
the other packages above.

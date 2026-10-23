# Wallet Adapters

Adds a `SorobanWalletAdapter` interface and four implementations — `XBullAdapter`, `LobstrAdapter`, `WalletConnectAdapter`, and `LedgerAdapter` — so callers can connect wallets and sign Soroban transactions without depending on any single wallet's SDK directly. Wallet SDKs (`@xbull/wallet-connect`, `lobstr-wallet-sdk`, `@walletconnect/web3wallet`, `@ledgerhq/hw-app-str`, ...) are optional peer dependencies, lazily imported only when the corresponding adapter is used.

`WalletConnectAdapter` additionally exposes `signAndSubmit()`, which signs and broadcasts in a single wallet round-trip via the `stellar_signAndSubmitXDR` request method. The wallet submits through its own RPC and returns the transaction hash, so dApps behind restrictive firewalls only need the WalletConnect relay connection they already hold and never require direct Soroban RPC access.

## Optional SDK loading and trust boundary

Wallet SDKs (`albedo-wallet-sdk`, `@ledgerhq/*`) are optional peer dependencies loaded lazily via
`loadOptionalWalletDependency`. The loader only accepts **bare npm package names** resolved from
the consumer's own dependency tree; relative/absolute paths, URLs, `data:` and `node:` specifiers
are refused with `DEPENDENCY_NOT_INSTALLED` before any import is attempted. A missing package
also yields `DEPENDENCY_NOT_INSTALLED` with an install hint, and a resolved value that is not a
module object is rejected. Pin and audit these peer dependencies like any other runtime code.

## Supported runtimes

Entrypoints are smoke-tested for Node (uses `Buffer`), browsers and React Native (fall back to
`btoa` when `Buffer` is absent). On React Native install the crypto polyfill from
`@soroban-resurrect/react-native` before loading the SDK.

# Wallet Adapters

Adds a `SorobanWalletAdapter` interface and four implementations — `XBullAdapter`, `LobstrAdapter`, `WalletConnectAdapter`, and `LedgerAdapter` — so callers can connect wallets and sign Soroban transactions without depending on any single wallet's SDK directly. Wallet SDKs (`@xbull/wallet-connect`, `lobstr-wallet-sdk`, `@walletconnect/web3wallet`, `@ledgerhq/hw-app-str`, ...) are optional peer dependencies, lazily imported only when the corresponding adapter is used.

`WalletConnectAdapter` additionally exposes `signAndSubmit()`, which signs and broadcasts in a single wallet round-trip via the `stellar_signAndSubmitXDR` request method. The wallet submits through its own RPC and returns the transaction hash, so dApps behind restrictive firewalls only need the WalletConnect relay connection they already hold and never require direct Soroban RPC access.

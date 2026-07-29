# Wallet Adapters

Adds a `SorobanWalletAdapter` interface and four implementations — `XBullAdapter`, `LobstrAdapter`, `WalletConnectAdapter`, and `LedgerAdapter` — so callers can connect wallets and sign Soroban transactions without depending on any single wallet's SDK directly. Wallet SDKs (`@xbull/wallet-connect`, `lobstr-wallet-sdk`, `@walletconnect/web3wallet`, `@ledgerhq/hw-app-str`, ...) are optional peer dependencies, lazily imported only when the corresponding adapter is used.

# @soroban-resurrect/wallet-adapters

Framework-agnostic Soroban wallet adapters implementing a common `SorobanWalletAdapter`
interface, plus a `WalletManager` for auto-detection, prioritization, and connection/network
change events.

## Supported wallets

- **Freighter** (`adapters/freighter`) — deep integration: account/network change listeners,
  graceful disconnect handling, and persisted sessions across page reloads.
- **Albedo** (`adapters/albedo`) — via the `albedo-wallet-sdk` optional peer dependency.
- **Rabet** (`adapters/rabet`) — browser extension, with an iframe-based fallback when the
  extension isn't installed.
- **xBull** (`adapters/xbull`)
- **Lobstr** (`adapters/lobstr`)
- **Ledger** (`adapters/ledger`) — hardware wallet via WebHID/WebUSB and `@ledgerhq/hw-app-str`.

## Usage

```ts
import { WalletManager, FreighterAdapter, AlbedoAdapter, RabetAdapter, XBullAdapter, LobstrAdapter } from '@soroban-resurrect/wallet-adapters'

const manager = new WalletManager({
  adapters: [new FreighterAdapter(), new AlbedoAdapter(), new RabetAdapter(), new XBullAdapter(), new LobstrAdapter()],
  priority: ['freighter', 'xbull'],
})

const available = await manager.detectAvailable()
manager.onConnectionChange((status, result) => console.log(status, result))
manager.onNetworkChange((change) => console.log('network changed', change))

const { address } = await manager.connect('freighter')
const signedXdr = await manager.activeAdapter!.signTransaction(xdr, { networkPassphrase })
```

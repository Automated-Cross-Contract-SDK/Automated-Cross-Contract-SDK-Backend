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
  // Optional app-level override: these ids are offered first, in this order.
  priority: ['freighter', 'xbull'],
})

const available = await manager.getAvailableWallets()
manager.onConnectionChange((status, result) => console.log(status, result))
manager.onNetworkChange((change) => console.log('network changed', change))

const { address } = await manager.connect('freighter')
const signedXdr = await manager.activeAdapter!.signTransaction(xdr, { networkPassphrase })
```

## Deterministic detection ordering (issue #441)

Multiple browser wallets can be installed at once and several of them inject globals
under the same names, so "detection order" must not be left to the order adapters
happen to be passed in. `WalletManager` resolves a single, documented ordering:

1. **App-level override** — ids listed in `priority` are offered first, in exactly
   the order given.
2. **Declared priority** — every other adapter is ordered by its `priority` field
   (lower first), falling back to `DEFAULT_ADAPTER_PRIORITY`.
3. **Registration order** — ties are broken by the order the adapters were
   registered, which is also the order availability probes fire in.

This makes two runs in the same environment produce the same list. Both
`getAvailableWallets()` (probes availability) and `getWalletDescriptors()` (static)
return `WalletDescriptor[]` in this order.

### Capability probing

Each descriptor advertises the features its adapter supports so a dApp can filter
before prompting the user:

```ts
const wallets = await manager.getAvailableWallets()
const sorobanWallets = wallets.filter((w) => w.capabilities.supportsSoroban)
```

Built-in adapters declare `{ supportsSoroban: true, supportsSignedTxNote: false }`.
Custom adapters that omit `capabilities` fall back to
`DEFAULT_WALLET_CAPABILITIES`, which is intentionally conservative
(`supportsSoroban: false`) so an adapter never claims a capability it hasn't opted
into.


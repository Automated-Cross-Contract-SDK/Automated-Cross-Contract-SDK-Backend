# @soroban-resurrect/sdk

Core SDK for automated Soroban state restoration.

## Install

```bash
npm install @soroban-resurrect/sdk
```

## Usage

```typescript
import { SorobanResurrect } from '@soroban-resurrect/sdk'

const client = new SorobanResurrect({
  rpcUrl: 'https://soroban-testnet.stellar.org',
  networkPassphrase: 'Test SDF Network ; September 2015',
})

const { needsRestoration, restoreTransactionXDR } =
  await client.checkAndPrepare(txXDR, sourceAccount)
```

## Stellar Asset Contract (SAC) Support

Stellar Asset Contracts (SACs) are system contracts for classic Stellar assets
(e.g. native XLM and issued tokens). Their ledger entries have key structures
that differ from ordinary WASM contracts. This SDK handles them transparently.

### SAC ledger entry types

Each SAC stores multiple `ContractData` entries per user, keyed by `ScVal`:

| Entry | Key shape | `sacKeyType` |
|-------|-----------|--------------|
| Token balance | `scvVec([scvSymbol("Balance"), scvAddress(account)])` | `sacBalance` |
| Spend allowance | `scvVec([scvSymbol("Allowance"), scvMap([from, spender])])` | `sacAllowance` |
| Administrator | `scvSymbol("Admin")` | `sacAdmin` |
| Replay nonce | `scvLedgerKeyNonce(...)` | `sacNonce` |
| Token metadata | `scvSymbol("Name"\|"Symbol"\|"Decimals")` | `sacMetadata` |
| Contract instance | `scvLedgerKeyContractInstance()` — `keyType: "contractInstance"` | – |

All of these are restored with the same `RestoreFootprint` operation as any
other Soroban ledger entry.

### Inspecting SAC archived keys

After calling `checkAndPrepare` or `simulate`, inspect `archivedKeys` to see
SAC-specific metadata:

```typescript
const { archivedKeys } = await client.simulate(txXDR)

for (const key of archivedKeys) {
  if (key.keyType === 'contractInstance') {
    console.log(`Contract instance archived for ${key.contractId}`)
  }
  if (key.keyType === 'contractData' && key.sacKeyType) {
    console.log(`SAC entry archived: ${key.sacKeyType} (contract ${key.contractId})`)
    // sacKeyType is one of: sacBalance, sacAllowance, sacAdmin, sacNonce, sacMetadata
  }
}
```

### Restoration order — ContractInstance must come first

When a contract's *instance* entry is archived, all of its `ContractData`
entries become inaccessible.  The SDK automatically sorts archived keys by
`restorePriority` before building the restore transaction:

| `keyType` | `restorePriority` | Restored |
|-----------|-------------------|---------|
| `contractInstance` | **0** | first |
| `contractCode` | 1 | second |
| `contractData` (incl. SAC) | 2 | third |
| `ttlEntry` / `unknown` | 3 | last |

You can read the priority from the `ArchivedKey` object:

```typescript
const sorted = archivedKeys.sort((a, b) => a.restorePriority - b.restorePriority)
```

### Detecting whether a SAC key is a custom type

The `classifySacKey` helper is exported for advanced use cases where you want
to inspect a raw `ScVal` key outside of the normal `simulate` flow:

```typescript
import { classifySacKey } from '@soroban-resurrect/sdk'

const sacType = classifySacKey(scVal) // 'sacBalance' | 'sacAllowance' | ... | undefined
```

Returns `undefined` when the `ScVal` does not match any known SAC pattern.

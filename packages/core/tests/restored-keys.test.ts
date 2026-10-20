import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Keypair, SorobanRpc, xdr } from '@stellar/stellar-sdk'
import { SorobanResurrect } from '../src/soroban-resurrect.js'

const RPC_URL = 'https://soroban-testnet.stellar.org'
const NETWORK_PASSPHRASE = 'Test SDF Network ; September 2015'
const SOURCE = Keypair.random().publicKey()

function archivedKey(): { key: xdr.LedgerKey; keyBase64: string } {
  const key = xdr.LedgerKey.account(
    new xdr.LedgerKeyAccount({ accountId: Keypair.random().xdrPublicKey() }),
  )
  return { key, keyBase64: key.toXDR('base64') }
}

describe('restored ledger-key identities on batch results', () => {
  beforeEach(() => {
    vi.spyOn(SorobanRpc.Server.prototype, 'getNetwork').mockResolvedValue({
      passphrase: NETWORK_PASSPHRASE,
    } as never)
    vi.spyOn(SorobanRpc.Server.prototype, 'getAccount').mockResolvedValue({
      sequenceNumber: () => '100',
    } as never)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('lists the base64 key of every restored entry in the batch', async () => {
    const client = new SorobanResurrect({ rpcUrl: RPC_URL, networkPassphrase: NETWORK_PASSPHRASE })
    vi.spyOn(client, 'estimateRestoreFee').mockResolvedValue('100')
    const keys = [archivedKey(), archivedKey(), archivedKey()]

    const batches = await client.buildRestoreTransactionBatches(keys, SOURCE)

    expect(batches).toHaveLength(1)
    expect(batches[0].restoredKeys).toEqual(keys.map(k => k.keyBase64))
    expect(batches[0].restoredKeys).toHaveLength(batches[0].keysRestored)
  })

  it('splits keys across batches and keeps each batch’s identities separate', async () => {
    const client = new SorobanResurrect({ rpcUrl: RPC_URL, networkPassphrase: NETWORK_PASSPHRASE })
    vi.spyOn(client, 'estimateRestoreFee').mockResolvedValue('100')
    const keys = [archivedKey(), archivedKey()]
    // Force one key per batch by making each key's size exceed the XDR budget
    // headroom when combined with another key.
    const oversized = keys.map(k => ({ ...k, keyBase64: 'A'.repeat(60_000) }))

    const batches = await client.buildRestoreTransactionBatches(oversized, SOURCE)

    expect(batches).toHaveLength(2)
    expect(batches.map(b => b.restoredKeys)).toEqual([
      [oversized[0].keyBase64],
      [oversized[1].keyBase64],
    ])
  })

  it('includes restoredKeys on concurrent batch results too', async () => {
    const client = new SorobanResurrect({ rpcUrl: RPC_URL, networkPassphrase: NETWORK_PASSPHRASE })
    vi.spyOn(client, 'estimateRestoreFee').mockResolvedValue('100')
    const keys = [archivedKey(), archivedKey()]

    const batches = await client.buildRestoreTransactionBatchesConcurrent(keys, SOURCE)

    const allRestored = batches.flatMap(b => b.restoredKeys).sort()
    expect(allRestored).toEqual(keys.map(k => k.keyBase64).sort())
  })
})

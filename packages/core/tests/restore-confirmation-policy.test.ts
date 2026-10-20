import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Account, Keypair, SorobanRpc, xdr } from '@stellar/stellar-sdk'
import { SorobanResurrect } from '../src/soroban-resurrect.js'
import type { RestoreConfirmationPolicy } from '@soroban-resurrect/types'

const RPC_URL = 'https://soroban-testnet.stellar.org'
const NETWORK_PASSPHRASE = 'Test SDF Network ; September 2015'
const SOURCE = Keypair.random().publicKey()
const SUBMITTED_HASH = 'pending-restore-hash'

function archivedKey(): { key: xdr.LedgerKey; keyBase64: string } {
  const key = xdr.LedgerKey.account(
    new xdr.LedgerKeyAccount({ accountId: Keypair.random().xdrPublicKey() }),
  )
  return { key, keyBase64: key.toXDR('base64') }
}

function createClient(policy?: RestoreConfirmationPolicy): SorobanResurrect {
  return new SorobanResurrect({
    rpcUrl: RPC_URL,
    networkPassphrase: NETWORK_PASSPHRASE,
    pollIntervalMs: 10,
    maxPollAttempts: 3,
    ...(policy ? { restoreConfirmationPolicy: policy } : {}),
  })
}

describe('restoreConfirmationPolicy', () => {
  beforeEach(() => {
    vi.spyOn(SorobanRpc.Server.prototype, 'getNetwork').mockResolvedValue({
      passphrase: NETWORK_PASSPHRASE,
    } as never)
    vi.spyOn(SorobanRpc.Server.prototype, 'getAccount').mockResolvedValue(
      new Account(SOURCE, '100') as never,
    )
    vi.spyOn(SorobanRpc.Server.prototype, 'sendTransaction').mockResolvedValue({
      status: 'PENDING',
      hash: SUBMITTED_HASH,
    } as never)
    vi.spyOn(SorobanRpc.Server.prototype, 'getTransaction').mockResolvedValue({
      status: 'SUCCESS',
    } as never)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  async function executeOneBatch(client: SorobanResurrect) {
    vi.spyOn(client, 'estimateRestoreFee').mockResolvedValue('100')
    const batches = await client.buildRestoreTransactionBatches([archivedKey()], SOURCE)
    return client.executeRestoreBatches(batches, async xdrIn => xdrIn)
  }

  it('waits for on-chain confirmation by default', async () => {
    const client = createClient()

    const result = await executeOneBatch(client)

    expect(result.success).toBe(true)
    expect(SorobanRpc.Server.prototype.getTransaction).toHaveBeenCalledWith(SUBMITTED_HASH)
  })

  it('waits for confirmation when the policy is explicitly "confirmed"', async () => {
    const client = createClient('confirmed')

    await executeOneBatch(client)

    expect(SorobanRpc.Server.prototype.getTransaction).toHaveBeenCalledWith(SUBMITTED_HASH)
  })

  it('returns once the RPC accepts the restore when the policy is "submitted"', async () => {
    const client = createClient('submitted')

    const result = await executeOneBatch(client)

    expect(result.success).toBe(true)
    expect(result.batches[0].txHash).toBe(SUBMITTED_HASH)
    expect(SorobanRpc.Server.prototype.getTransaction).not.toHaveBeenCalled()
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SorobanRpc } from '@stellar/stellar-sdk'
import { SorobanResurrect } from '../src/soroban-resurrect.js'

const RPC_URL = 'https://soroban-testnet.stellar.org'
const NETWORK_PASSPHRASE = 'Test SDF Network ; September 2015'

function createClient(): SorobanResurrect {
  return new SorobanResurrect({
    rpcUrl: RPC_URL,
    networkPassphrase: NETWORK_PASSPHRASE,
    allowHttp: false,
  } as any)
}

describe('restoration confirmation before original submission', () => {
  let client: SorobanResurrect
  let submit: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.spyOn(SorobanRpc.Server.prototype, 'getNetwork').mockResolvedValue({
      passphrase: NETWORK_PASSPHRASE,
    } as any)
    client = createClient()
    submit = vi.fn(async (xdr: string) => `hash-of-${xdr}`)
    vi.spyOn(client as any, 'submitSignedTransaction').mockImplementation(submit)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('submits the original transaction when the restoration ended in SUCCESS', async () => {
    vi.spyOn(SorobanRpc.Server.prototype, 'getTransaction').mockResolvedValue({
      status: SorobanRpc.Api.GetTransactionStatus.SUCCESS,
    } as any)

    const result = await client.executeRestoreThenOriginal('restore', 'original', async x => x)

    expect(result.success).toBe(true)
    expect(result.restoreTxHash).toBe('hash-of-restore')
    expect(submit).toHaveBeenCalledTimes(2)
    expect(submit).toHaveBeenLastCalledWith('original', expect.any(Function))
  })

  it('rejects with RESTORE_FAILED and never submits the original when the restoration is not SUCCESS', async () => {
    vi.spyOn(SorobanRpc.Server.prototype, 'getTransaction').mockResolvedValue({
      status: SorobanRpc.Api.GetTransactionStatus.FAILED,
    } as any)

    await expect(
      client.executeRestoreThenOriginal('restore', 'original', async x => x),
    ).rejects.toBeInstanceOf(Error)

    expect(submit).toHaveBeenCalledTimes(1)
  })

  it('verifies every successful batch before the concurrent original is submitted', async () => {
    const getTx = vi
      .spyOn(SorobanRpc.Server.prototype, 'getTransaction')
      .mockResolvedValue({ status: SorobanRpc.Api.GetTransactionStatus.SUCCESS } as any)

    const batches = [
      { batchIndex: 0, transactionXDR: 'b0', keysRestored: 1, status: 'pending' as const },
      { batchIndex: 1, transactionXDR: 'b1', keysRestored: 1, status: 'pending' as const },
    ]
    vi.spyOn(client, 'buildRestoreTransactionBatchesConcurrent').mockResolvedValue(batches)
    vi.spyOn(client, 'executeRestoreBatchesConcurrent').mockResolvedValue({
      success: true,
      batches: [
        { ...batches[0], status: 'success', txHash: 'h0' },
        { ...batches[1], status: 'success', txHash: 'h1' },
      ],
      totalKeysRestored: 2,
    })

    await client.executeRestoreThenOriginalBatchesConcurrent(
      [],
      'original',
      'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN',
      async x => x,
    )

    expect(getTx).toHaveBeenCalledWith('h0')
    expect(getTx).toHaveBeenCalledWith('h1')
    expect(submit).toHaveBeenLastCalledWith('original', expect.any(Function))
  })
})

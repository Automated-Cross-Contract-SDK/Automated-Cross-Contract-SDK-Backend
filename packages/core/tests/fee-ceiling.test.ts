import { describe, expect, it, vi, afterEach } from 'vitest'
import { Account, Keypair, Networks, Operation, SorobanRpc, TransactionBuilder } from '@stellar/stellar-sdk'
import { SorobanResurrect } from '../src/soroban-resurrect.js'

const RPC_URL = 'https://soroban-testnet.stellar.org'
const SOURCE = Keypair.random().publicKey()

function buildTx(fee: string): string {
  return new TransactionBuilder(new Account(SOURCE, '1'), {
    fee,
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(Operation.bumpSequence({ bumpTo: '2' }))
    .setTimeout(30)
    .build()
    .toXDR()
}

function createClient(maxFeeStroops?: string): SorobanResurrect {
  return new SorobanResurrect({
    rpcUrl: RPC_URL,
    networkPassphrase: Networks.TESTNET,
    maxFeeStroops,
  } as any)
}

describe('maxFeeStroops ceiling before wallet signing', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('never calls the wallet when the fee exceeds the ceiling', async () => {
    const client = createClient('500')
    const signTransaction = vi.fn(async (xdr: string) => xdr)
    const send = vi.spyOn(SorobanRpc.Server.prototype, 'sendTransaction')

    await expect(
      (client as any).submitSignedTransaction(buildTx('1000'), signTransaction),
    ).rejects.toBeInstanceOf(Error)

    expect(signTransaction).not.toHaveBeenCalled()
    expect(send).not.toHaveBeenCalled()
  })

  it('asks the wallet to sign when the fee is at or below the ceiling', async () => {
    const client = createClient('1000')
    const signTransaction = vi.fn(async () => {
      throw new Error('wallet reached')
    })

    await expect(
      (client as any).submitSignedTransaction(buildTx('1000'), signTransaction),
    ).rejects.toThrow('wallet reached')

    expect(signTransaction).toHaveBeenCalledTimes(1)
  })

  it('imposes no ceiling when maxFeeStroops is unset', async () => {
    const client = createClient()
    const signTransaction = vi.fn(async () => {
      throw new Error('wallet reached')
    })

    await expect(
      (client as any).submitSignedTransaction(buildTx('999999999'), signTransaction),
    ).rejects.toThrow('wallet reached')

    expect(signTransaction).toHaveBeenCalledTimes(1)
  })
})

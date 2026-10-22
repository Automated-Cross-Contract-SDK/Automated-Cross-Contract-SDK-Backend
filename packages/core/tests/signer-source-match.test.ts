import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Account, Keypair, Networks, Operation, SorobanRpc, TransactionBuilder } from '@stellar/stellar-sdk'
import { SorobanResurrect } from '../src/soroban-resurrect.js'

const RPC_URL = 'https://soroban-testnet.stellar.org'

function buildUnsignedTx(sourcePublicKey: string): string {
  return new TransactionBuilder(new Account(sourcePublicKey, '1'), {
    fee: '100',
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(Operation.bumpSequence({ bumpTo: '2' }))
    .setTimeout(30)
    .build()
    .toXDR()
}

function signWith(xdrString: string, signer: Keypair): string {
  const tx = TransactionBuilder.fromXDR(xdrString, Networks.TESTNET) as any
  tx.sign(signer)
  return tx.toXDR()
}

describe('wallet signer matches transaction source account', () => {
  const sourceKeypair = Keypair.random()
  const otherKeypair = Keypair.random()
  let client: SorobanResurrect
  let sendTransaction: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    client = new SorobanResurrect({
      rpcUrl: RPC_URL,
      networkPassphrase: Networks.TESTNET,
    } as any)
    sendTransaction = vi
      .spyOn(SorobanRpc.Server.prototype, 'sendTransaction')
      .mockResolvedValue({ status: 'ERROR' } as any)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('accepts a signature from the transaction source account and proceeds to submission', async () => {
    const unsigned = buildUnsignedTx(sourceKeypair.publicKey())

    await expect(
      (client as any).submitSignedTransaction(unsigned, async (xdr: string) =>
        signWith(xdr, sourceKeypair),
      ),
    ).rejects.toBeInstanceOf(Error)

    expect(sendTransaction).toHaveBeenCalledTimes(1)
  })

  it('rejects a signature from a different account before anything is submitted', async () => {
    const unsigned = buildUnsignedTx(sourceKeypair.publicKey())

    await expect(
      (client as any).submitSignedTransaction(unsigned, async (xdr: string) =>
        signWith(xdr, otherKeypair),
      ),
    ).rejects.toBeInstanceOf(Error)

    expect(sendTransaction).not.toHaveBeenCalled()
  })

  it('rejects a signed transaction whose source account was changed', async () => {
    const unsigned = buildUnsignedTx(sourceKeypair.publicKey())
    const swapped = buildUnsignedTx(otherKeypair.publicKey())

    await expect(
      (client as any).submitSignedTransaction(unsigned, async () =>
        signWith(swapped, otherKeypair),
      ),
    ).rejects.toBeInstanceOf(Error)

    expect(sendTransaction).not.toHaveBeenCalled()
  })
})

/**
 * Issue #454 — fee-bump detection must behave identically wherever it is used.
 *
 * `isFeeBumpTx` is currently duplicated in the sdk and core packages. These
 * tests drive the public `checkTransaction` entry point with real fee-bump XDR
 * (built by stellar-sdk, not mocked) so that any regression in fee-bump
 * detection is caught regardless of where the helper lives.
 */
import { describe, it, expect } from 'vitest'
import {
  Account,
  Asset,
  Keypair,
  Operation,
  TransactionBuilder,
} from '@stellar/stellar-sdk'
import { SorobanResurrect } from '../src/soroban-resurrect.js'
import { SorobanResurrectError } from '../src/types.js'

const NETWORK_PASSPHRASE = 'Test SDF Network ; September 2015'
const RPC_URL = 'https://soroban-testnet.stellar.org'

function buildInnerTransaction(): ReturnType<TransactionBuilder['build']> {
  const source = Keypair.random().publicKey()
  const destination = Keypair.random().publicKey()
  return new TransactionBuilder(new Account(source, '1'), {
    fee: '100',
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(Operation.payment({ destination, asset: Asset.native(), amount: '1' }))
    .setTimeout(0)
    .build()
}

function buildFeeBumpXdr(): string {
  const feeSource = Keypair.random().publicKey()
  return TransactionBuilder.buildFeeBumpTransaction(
    feeSource,
    '200',
    buildInnerTransaction(),
    NETWORK_PASSPHRASE,
  ).toXDR()
}

describe('fee-bump detection (issue #454)', () => {
  const client = new SorobanResurrect({
    rpcUrl: RPC_URL,
    networkPassphrase: NETWORK_PASSPHRASE,
  })

  it('rejects a real fee-bump transaction with INVALID_XDR', async () => {
    const feeBumpXdr = buildFeeBumpXdr()

    const error = await client.checkTransaction(feeBumpXdr).then(
      () => undefined,
      (err: unknown) => err,
    )

    expect(error).toBeInstanceOf(SorobanResurrectError)
    expect((error as SorobanResurrectError).message).toBe('Fee bump transactions are not supported')
    expect((error as SorobanResurrectError).code).toBe('INVALID_XDR')
  })

  it('keeps fee-bump rejection distinct from malformed-XDR rejection', async () => {
    const malformed = await client.checkTransaction('not-a-transaction').then(
      () => undefined,
      (err: unknown) => err,
    )

    expect(malformed).toBeInstanceOf(SorobanResurrectError)
    expect((malformed as SorobanResurrectError).message).toBe('Invalid transaction XDR')
    expect((malformed as SorobanResurrectError).message).not.toBe('Fee bump transactions are not supported')
  })
})

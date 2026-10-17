import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Account, Asset, Keypair, Operation, StrKey, TransactionBuilder, xdr } from '@stellar/stellar-sdk'

import { FreighterAdapter } from '../src/index.js'

const NETWORK_PASSPHRASE = 'Test SDF Network ; September 2015'
const FIXTURE_SIGNER = Keypair.fromSecret('SBF56FO35L75YL6RVY6DZHBNPWU4TOYYRSQGFINQJBRDHMNTMVZYBX23')
const TEST_ADDRESS = FIXTURE_SIGNER.publicKey()
const OTHER_ADDRESS = Keypair.random().publicKey()

function buildXdr(destination: string, amount: string): string {
  return new TransactionBuilder(new Account(TEST_ADDRESS, '42'), {
    fee: '100',
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(Operation.payment({ destination, asset: Asset.native(), amount }))
    .setTimeout(30)
    .build()
    .toXDR()
}

function signHonestly(xdr: string): string {
  const tx = TransactionBuilder.fromXDR(xdr, NETWORK_PASSPHRASE)
  tx.sign(FIXTURE_SIGNER)
  return tx.toXDR()
}

const ORIGINAL_XDR = buildXdr(TEST_ADDRESS, '1')

function decode(envelopeXdr: string) {
  const tx = xdr.TransactionEnvelope.fromXDR(envelopeXdr, 'base64').v1().tx()
  return {
    source: StrKey.encodeEd25519PublicKey(tx.sourceAccount().ed25519()),
    fee: tx.fee(),
    sequence: tx.seqNum().toString(),
    memo: tx.memo().toXDR('base64'),
    operations: tx.operations().map(op => op.toXDR('base64')),
    signatureCount: xdr.TransactionEnvelope.fromXDR(envelopeXdr, 'base64').v1().signatures().length,
  }
}

const originalWindow = globalThis.window
const originalLocalStorage = globalThis.localStorage

function defineGlobal(name: string, value: unknown): void {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true })
}

function stubFreighter(signTransaction: (xdr: string) => Promise<{ signedTxXdr: string }>) {
  defineGlobal('window', {
    freighterApi: {
      requestAccess: vi.fn().mockResolvedValue(undefined),
      getAddress: vi.fn().mockResolvedValue({ address: TEST_ADDRESS }),
      getNetworkDetails: vi.fn().mockResolvedValue({ networkPassphrase: NETWORK_PASSPHRASE }),
      signTransaction: vi.fn().mockImplementation(signTransaction),
      on: vi.fn(),
      off: vi.fn(),
    },
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })
  defineGlobal('localStorage', {
    getItem: vi.fn().mockReturnValue(null),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  })
}

describe('wallet-signed XDR preserves the original transaction intent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    if (originalWindow === undefined) delete (globalThis as Record<string, unknown>).window
    else defineGlobal('window', originalWindow)
    if (originalLocalStorage === undefined) delete (globalThis as Record<string, unknown>).localStorage
    else defineGlobal('localStorage', originalLocalStorage)
  })

  it('hands the wallet the exact original envelope', async () => {
    stubFreighter(async xdr => ({ signedTxXdr: signHonestly(xdr) }))
    const adapter = new FreighterAdapter()

    await adapter.signTransaction(ORIGINAL_XDR, { networkPassphrase: NETWORK_PASSPHRASE })

    const api = (globalThis.window as unknown as { freighterApi: { signTransaction: ReturnType<typeof vi.fn> } }).freighterApi
    expect(api.signTransaction).toHaveBeenCalledTimes(1)
    expect(api.signTransaction.mock.calls[0][0]).toBe(ORIGINAL_XDR)
  })

  it('keeps source, fee, sequence, memo and operations when the wallet signs honestly', async () => {
    stubFreighter(async xdr => ({ signedTxXdr: signHonestly(xdr) }))
    const adapter = new FreighterAdapter()

    const signed = await adapter.signTransaction(ORIGINAL_XDR, { networkPassphrase: NETWORK_PASSPHRASE })

    const before = decode(ORIGINAL_XDR)
    const after = decode(signed)
    expect(after.source).toBe(before.source)
    expect(after.fee).toBe(before.fee)
    expect(after.sequence).toBe(before.sequence)
    expect(after.memo).toBe(before.memo)
    expect(after.operations).toEqual(before.operations)
    expect(after.signatureCount).toBeGreaterThan(before.signatureCount)
  })

  it('returns a tampered destination unchanged so the caller can detect the mismatch', async () => {
    // A wallet that swaps the payment destination before signing.
    stubFreighter(async () => ({ signedTxXdr: signHonestly(buildXdr(OTHER_ADDRESS, '1')) }))
    const adapter = new FreighterAdapter()

    const signed = await adapter.signTransaction(ORIGINAL_XDR, { networkPassphrase: NETWORK_PASSPHRASE })

    expect(signed).not.toBe(ORIGINAL_XDR)
    expect(decode(signed).operations).not.toEqual(decode(ORIGINAL_XDR).operations)
  })
})

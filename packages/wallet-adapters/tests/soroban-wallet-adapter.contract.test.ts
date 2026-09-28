import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Account, Asset, Keypair, Operation, TransactionBuilder } from '@stellar/stellar-sdk'

import {
  AlbedoAdapter,
  FreighterAdapter,
  LedgerAdapter,
  LobstrAdapter,
  RabetAdapter,
  XBullAdapter,
} from '../src/index.js'
import * as walletTypes from '../src/types.js'
import type { SorobanWalletAdapter } from '../src/types.js'

const NETWORK_PASSPHRASE = 'Test SDF Network ; September 2015'
const FIXTURE_SIGNER = Keypair.fromSecret('SBF56FO35L75YL6RVY6DZHBNPWU4TOYYRSQGFINQJBRDHMNTMVZYBX23')
const TEST_ADDRESS = FIXTURE_SIGNER.publicKey()
const DESTINATION = TEST_ADDRESS

function buildFixtureXdr(): string {
  const account = new Account(TEST_ADDRESS, '0')
  return new TransactionBuilder(account, {
    fee: '100',
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(
      Operation.payment({
        destination: DESTINATION,
        asset: Asset.native(),
        amount: '1',
      }),
    )
    .setTimeout(30)
    .build()
    .toXDR()
}

function addDeterministicSignature(xdr: string): string {
  const tx = TransactionBuilder.fromXDR(xdr, NETWORK_PASSPHRASE)
  tx.sign(FIXTURE_SIGNER)
  return tx.toXDR()
}

const FIXTURE_XDR = buildFixtureXdr()

const originalWindow = globalThis.window
const originalNavigator = globalThis.navigator
const originalDocument = globalThis.document
const originalLocalStorage = globalThis.localStorage

function defineGlobal<T>(name: string, value: T): void {
  Object.defineProperty(globalThis, name, {
    value,
    configurable: true,
    writable: true,
  })
}

function clearGlobal(name: string): void {
  delete (globalThis as Record<string, unknown>)[name]
}

function stubWindowWith(value: Record<string, unknown>): void {
  defineGlobal('window', value as Window & typeof globalThis)
}

afterEach(() => {
  vi.restoreAllMocks()
  if (originalWindow === undefined) clearGlobal('window')
  else defineGlobal('window', originalWindow)

  if (originalNavigator === undefined) clearGlobal('navigator')
  else defineGlobal('navigator', originalNavigator)

  if (originalDocument === undefined) clearGlobal('document')
  else defineGlobal('document', originalDocument)

  if (originalLocalStorage === undefined) clearGlobal('localStorage')
  else defineGlobal('localStorage', originalLocalStorage)
})

type ContractCase = {
  id: string
  name: string
  factory: () => SorobanWalletAdapter
  setup: () => {
    address: string
    api: Record<string, unknown>
  }
  verifySignedTransaction: (api: Record<string, unknown>, signedXdr: string) => void
}

const contractCases: ContractCase[] = [
  {
    id: 'freighter',
    name: 'Freighter',
    factory: () => new FreighterAdapter(),
    setup: () => {
      const api = {
        requestAccess: vi.fn().mockResolvedValue(undefined),
        getAddress: vi.fn().mockResolvedValue({ address: TEST_ADDRESS }),
        getNetworkDetails: vi.fn().mockResolvedValue({ networkPassphrase: NETWORK_PASSPHRASE }),
        signTransaction: vi.fn().mockImplementation(async (xdr: string) => ({ signedTxXdr: addDeterministicSignature(xdr) })),
        on: vi.fn(),
        off: vi.fn(),
      }
      stubWindowWith({ freighterApi: api, addEventListener: vi.fn(), removeEventListener: vi.fn() })
      defineGlobal('localStorage', {
        getItem: vi.fn().mockReturnValue(null),
        setItem: vi.fn(),
        removeItem: vi.fn(),
      })
      return { address: TEST_ADDRESS, api }
    },
    verifySignedTransaction: (api, signedXdr) => {
      expect(api.signTransaction).toHaveBeenCalledWith(FIXTURE_XDR, expect.objectContaining({ networkPassphrase: NETWORK_PASSPHRASE, address: TEST_ADDRESS }))
      expect(() => TransactionBuilder.fromXDR(signedXdr, NETWORK_PASSPHRASE)).not.toThrow()
    },
  },
  {
    id: 'albedo',
    name: 'Albedo',
    factory: () => new AlbedoAdapter(),
    setup: () => {
      const api = {
        publicKey: vi.fn().mockResolvedValue({ pubkey: TEST_ADDRESS }),
        tx: vi.fn().mockImplementation(async (payload: { xdr: string }) => ({ signed_envelope_xdr: addDeterministicSignature(payload.xdr) })),
      }
      vi.spyOn(walletTypes, 'loadOptionalWalletDependency').mockResolvedValue({ default: api })
      stubWindowWith({})
      return { address: TEST_ADDRESS, api }
    },
    verifySignedTransaction: (api, signedXdr) => {
      expect(api.tx).toHaveBeenCalledWith(
        expect.objectContaining({
          xdr: FIXTURE_XDR,
          pubkey: TEST_ADDRESS,
          network: 'testnet',
        }),
      )
      expect(() => TransactionBuilder.fromXDR(signedXdr, NETWORK_PASSPHRASE)).not.toThrow()
    },
  },
  {
    id: 'rabet',
    name: 'Rabet',
    factory: () => new RabetAdapter(),
    setup: () => {
      const api = {
        connect: vi.fn().mockResolvedValue({ publicKey: TEST_ADDRESS }),
        disconnect: vi.fn().mockResolvedValue(undefined),
        sign: vi.fn().mockImplementation(async (xdr: string) => ({ xdr: addDeterministicSignature(xdr) })),
      }
      stubWindowWith({ rabet: api, addEventListener: vi.fn(), removeEventListener: vi.fn() })
      return { address: TEST_ADDRESS, api }
    },
    verifySignedTransaction: (api, signedXdr) => {
      expect(api.sign).toHaveBeenCalledWith(FIXTURE_XDR, NETWORK_PASSPHRASE)
      expect(() => TransactionBuilder.fromXDR(signedXdr, NETWORK_PASSPHRASE)).not.toThrow()
    },
  },
  {
    id: 'xbull',
    name: 'xBull',
    factory: () => new XBullAdapter(),
    setup: () => {
      const api = {
        connect: vi.fn().mockResolvedValue([TEST_ADDRESS]),
        getNetwork: vi.fn().mockResolvedValue({ networkPassphrase: NETWORK_PASSPHRASE }),
        sign: vi.fn().mockImplementation(async ({ xdr }: { xdr: string }) => addDeterministicSignature(xdr)),
        disconnect: vi.fn().mockResolvedValue(undefined),
      }
      stubWindowWith({ xBullSDK: api })
      return { address: TEST_ADDRESS, api }
    },
    verifySignedTransaction: (api, signedXdr) => {
      expect(api.sign).toHaveBeenCalledWith(
        expect.objectContaining({
          xdr: FIXTURE_XDR,
          publicKeys: [TEST_ADDRESS],
          network: NETWORK_PASSPHRASE,
        }),
      )
      expect(() => TransactionBuilder.fromXDR(signedXdr, NETWORK_PASSPHRASE)).not.toThrow()
    },
  },
  {
    id: 'lobstr',
    name: 'LOBSTR',
    factory: () => new LobstrAdapter(),
    setup: () => {
      const api = {
        connect: vi.fn().mockResolvedValue(TEST_ADDRESS),
        getNetwork: vi.fn().mockResolvedValue(NETWORK_PASSPHRASE),
        signTransaction: vi.fn().mockImplementation(async (xdr: string) => addDeterministicSignature(xdr)),
      }
      stubWindowWith({ lobstrApi: api })
      return { address: TEST_ADDRESS, api }
    },
    verifySignedTransaction: (api, signedXdr) => {
      expect(api.signTransaction).toHaveBeenCalledWith(FIXTURE_XDR, { networkPassphrase: NETWORK_PASSPHRASE })
      expect(() => TransactionBuilder.fromXDR(signedXdr, NETWORK_PASSPHRASE)).not.toThrow()
    },
  },
  {
    id: 'ledger',
    name: 'Ledger',
    factory: () => new LedgerAdapter(),
    setup: () => {
      const transport = {
        close: vi.fn().mockResolvedValue(undefined),
        on: vi.fn(),
      }
      const app = {
        getPublicKey: vi.fn().mockResolvedValue({ publicKey: TEST_ADDRESS }),
        signTransaction: vi.fn().mockImplementation(async (_path: string, signatureBase: Uint8Array) => ({
          signature: FIXTURE_SIGNER.sign(signatureBase),
        })),
      }
      const Transport = {
        create: vi.fn().mockResolvedValue(transport),
      }
      vi.spyOn(walletTypes, 'loadOptionalWalletDependency').mockImplementation(async (moduleName: string) => {
        if (moduleName === '@ledgerhq/hw-transport-webhid') return { default: Transport }
        if (moduleName === '@ledgerhq/hw-transport-webusb') return { default: Transport }
        if (moduleName === '@ledgerhq/hw-app-str')
          return {
            default: class MockLedgerApp {
              constructor() {
                return app
              }
            },
          }
        throw new Error(`Unexpected module load: ${moduleName}`)
      })
      defineGlobal('navigator', { hid: {} })
      return { address: TEST_ADDRESS, api: app }
    },
    verifySignedTransaction: (api, signedXdr) => {
      expect(api.signTransaction).toHaveBeenCalledTimes(1)
      expect(() => TransactionBuilder.fromXDR(signedXdr, NETWORK_PASSPHRASE)).not.toThrow()
    },
  },
]

describe('[M6][Test] Wallet adapters: contract tests', () => {
  beforeEach(() => {
    stubWindowWith({})
    defineGlobal('navigator', {})
    defineGlobal('document', {})
    defineGlobal('localStorage', {
      getItem: vi.fn().mockReturnValue(null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    })
  })

  it.each(contractCases)('$name adapter implements the shared SorobanWalletAdapter contract', async ({ factory, setup, verifySignedTransaction }) => {
    const { address, api } = setup()
    const adapter = factory()

    expect(typeof adapter.id).toBe('string')
    expect(typeof adapter.name).toBe('string')
    expect(await adapter.isAvailable()).toBeTypeOf('boolean')

    const connection = await adapter.connect()
    expect(connection.address).toBe(address)

    const signedXdr = await adapter.signTransaction(FIXTURE_XDR, { networkPassphrase: NETWORK_PASSPHRASE })
    verifySignedTransaction(api, signedXdr)

    await expect(adapter.disconnect()).resolves.toBeUndefined()
  })
})

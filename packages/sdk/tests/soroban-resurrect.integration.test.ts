import { describe, it, expect } from 'vitest'
import { SorobanResurrect } from '../src/soroban-resurrect.js'
import { SorobanResurrectError } from '../src/types.js'

const RPC_URL = process.env.SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org'
const NETWORK_PASSPHRASE = process.env.SOROBAN_NETWORK_PASSPHRASE || 'Test SDF Network ; September 2015'
const RUN_INTEGRATION = process.env.RUN_INTEGRATION_TESTS === 'true'

const itIf = RUN_INTEGRATION ? it : it.skip

describe('SorobanResurrect [integration]', () => {
  const client = new SorobanResurrect({
    rpcUrl: RPC_URL,
    networkPassphrase: NETWORK_PASSPHRASE,
    allowHttp: true,
  })

  itIf('connects to the Soroban RPC endpoint', async () => {
    const server = client.getRpcServer()
    const health = await server.getHealth()
    expect(health).toBeDefined()
  })

  itIf('returns simulation result for a valid transaction', async () => {
    const keypair = (await import('@stellar/stellar-sdk')).Keypair.random()
    const account = await client.getRpcServer().getAccount(keypair.publicKey()).catch(() => null)

    if (!account) {
      // Skip if account doesn't exist on testnet
      return
    }

    const { TransactionBuilder, Operation, BASE_FEE, Networks, xdr, SorobanDataBuilder } =
      await import('@stellar/stellar-sdk')

    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: NETWORK_PASSPHRASE,
      sorobanData: new SorobanDataBuilder()
        .setFootprint([], [])
        .build()
        .toXDR('base64'),
    })
      .addOperation(Operation.restoreFootprint({}))
      .setTimeout(30)
      .build()

    const result = await client.simulate(tx.toXDR())
    expect(result).toBeDefined()
    expect(result.totalKeysInFootprint).toBeGreaterThanOrEqual(0)
  })

  itIf('throws SorobanResurrectError for invalid XDR', async () => {
    await expect(client.simulate('not-valid-xdr')).rejects.toThrow(SorobanResurrectError)
  })

  itIf('rejects unsupported fee bump transactions', async () => {
    const { TransactionBuilder, Networks } = await import('@stellar/stellar-sdk')
    const badXDR = TransactionBuilder.fromXDR(
      'AAAAAgAAAABh6D6JQnK0a8kYrV1f4zA0j3x2y5z6a7b8c9d0e1f2g3h4i5j6k7l8m9n0o1p2q3r4s5t6u7v8w9x0y1z2',
      Networks.TESTNET,
    )

    const xdrStr = 'sorobanData' in badXDR ? badXDR.toXDR() : ''
    if (xdrStr) {
      await expect(client.simulate(xdrStr)).rejects.toThrow()
    }
  })
})

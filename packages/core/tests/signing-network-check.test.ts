import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SorobanRpc } from '@stellar/stellar-sdk'
import { SorobanResurrect } from '../src/soroban-resurrect.js'

const RPC_URL = 'https://rpc.example.com'
const NETWORK_PASSPHRASE = 'Test SDF Network ; September 2015'
const MAINNET_PASSPHRASE = 'Public Global Stellar Network ; September 2015'
const TX_XDR = 'AAAA-unsigned'

/** Thrown by the signer stub to stop the flow once signing has been reached. */
class SignerReached extends Error {}

function createClient(): SorobanResurrect {
  return new SorobanResurrect({ rpcUrl: RPC_URL, networkPassphrase: NETWORK_PASSPHRASE })
}

/** Calls the private submit path with a signer that records invocation. */
function attemptSign(client: SorobanResurrect) {
  const signer = vi.fn(async () => {
    throw new SignerReached()
  })
  const attempt = (client as unknown as {
    submitSignedTransaction(xdr: string, sign: typeof signer): Promise<string>
  }).submitSignedTransaction(TX_XDR, signer)
  return { signer, attempt }
}

describe('signing is gated on RPC network identity', () => {
  let getNetwork: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    getNetwork = vi.spyOn(SorobanRpc.Server.prototype, 'getNetwork').mockResolvedValue({
      passphrase: NETWORK_PASSPHRASE,
    } as never)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('hands the transaction to the signer when the passphrases match', async () => {
    const client = createClient()
    const { signer, attempt } = attemptSign(client)

    await expect(attempt).rejects.toBeInstanceOf(SignerReached)
    expect(signer).toHaveBeenCalledWith(TX_XDR)
    client.destroy()
  })

  it('refuses to sign when the RPC reports a different network', async () => {
    getNetwork.mockResolvedValue({ passphrase: MAINNET_PASSPHRASE } as never)
    const client = createClient()
    const { signer, attempt } = attemptSign(client)

    const error = await attempt.catch(err => err)

    expect(signer).not.toHaveBeenCalled()
    expect(error.code).toBe('NETWORK_MISMATCH')
    expect(error.message).toContain(NETWORK_PASSPHRASE)
    expect(error.message).toContain(MAINNET_PASSPHRASE)
    client.destroy()
  })

  it('refuses to sign when the RPC cannot be reached to verify the network', async () => {
    getNetwork.mockRejectedValue(new Error('timeout'))
    const client = createClient()
    const { signer, attempt } = attemptSign(client)

    const error = await attempt.catch(err => err)

    expect(signer).not.toHaveBeenCalled()
    expect(error.code).toBe('NETWORK_ERROR')
    expect(error.message).toContain('timeout')
    client.destroy()
  })

  it('checks again after a failed verification and signs once the RPC recovers', async () => {
    getNetwork.mockRejectedValueOnce(new Error('timeout'))
    const client = createClient()

    await attemptSign(client).attempt.catch(() => undefined)
    const { signer, attempt } = attemptSign(client)

    await expect(attempt).rejects.toBeInstanceOf(SignerReached)
    expect(signer).toHaveBeenCalledTimes(1)
    client.destroy()
  })

  it('caches a successful verification so later signings do not re-query the RPC', async () => {
    const client = createClient()
    getNetwork.mockClear()

    await attemptSign(client).attempt.catch(() => undefined)
    await attemptSign(client).attempt.catch(() => undefined)

    expect(getNetwork).toHaveBeenCalledTimes(1)
    client.destroy()
  })
})

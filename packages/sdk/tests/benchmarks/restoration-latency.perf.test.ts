import { describe, it, expect, vi } from 'vitest'
import { Account, Keypair, Networks, Operation, TransactionBuilder } from '@stellar/stellar-sdk'
import { SorobanResurrect } from '../../src/soroban-resurrect.js'
import { FixedDelay } from '../../src/retry-policy.js'

/**
 * Breaks restoration latency into simulation, signing and submission stages.
 * RPC and wallet latencies are injected so each stage is measured in
 * isolation; the harness verifies the SDK adds negligible overhead per stage
 * and attributes failures to the correct stage.
 */
type Stage = 'simulation' | 'signing' | 'submission'
const SIM_MS = 30
const SIGN_MS = 20
const SUBMIT_MS = 40
const OVERHEAD_BUDGET_MS = 50

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
const keypair = Keypair.random()

function buildTxXDR(): string {
  return new TransactionBuilder(new Account(keypair.publicKey(), '1'), { fee: '100', networkPassphrase: Networks.TESTNET })
    .addOperation(Operation.bumpSequence({ bumpTo: '2' }))
    .setTimeout(30)
    .build()
    .toXDR()
}

function setup(opts: { failAt?: Stage } = {}) {
  const timings: Record<Stage, number> = { simulation: 0, signing: 0, submission: 0 }
  const time = async <T>(stage: Stage, fn: () => Promise<T>): Promise<T> => {
    const start = performance.now()
    try {
      if (opts.failAt === stage) throw new Error(`${stage} failed`)
      return await fn()
    } finally {
      timings[stage] += performance.now() - start
    }
  }

  const client = new SorobanResurrect({
    rpcUrl: 'https://soroban-testnet.stellar.org',
    networkPassphrase: Networks.TESTNET,
    retryPolicy: new FixedDelay(0, 0),
  })
  const server = {
    simulateTransaction: () => time('simulation', async () => { await sleep(SIM_MS); return {} }),
    sendTransaction: () => time('submission', async () => { await sleep(SUBMIT_MS); return { status: 'PENDING', hash: 'abc' } }),
  }
  vi.spyOn(client as any, 'getServer').mockReturnValue(server)
  ;(client as any).server = server
  vi.spyOn(client, 'waitForTransaction').mockResolvedValue({ hash: 'abc' } as any)

  const sign = (xdrStr: string) => time('signing', async () => { await sleep(SIGN_MS); return xdrStr })
  return { client, timings, sign }
}

async function runPipeline(client: SorobanResurrect, sign: (x: string) => Promise<string>) {
  const tx = buildTxXDR()
  await (client as any).server.simulateTransaction(tx)
  return (client as any).submitSignedTransaction(tx, sign) as Promise<string>
}

describe('Restoration latency by stage', () => {
  it('attributes latency to simulation, signing and submission', async () => {
    const { client, timings, sign } = setup()
    const total = performance.now()
    await expect(runPipeline(client, sign)).resolves.toBe('abc')
    const totalMs = performance.now() - total

    console.table(Object.entries(timings).map(([stage, ms]) => ({ stage, ms: ms.toFixed(1) })))
    expect(timings.simulation).toBeGreaterThanOrEqual(SIM_MS - 2)
    expect(timings.signing).toBeGreaterThanOrEqual(SIGN_MS - 2)
    expect(timings.submission).toBeGreaterThanOrEqual(SUBMIT_MS - 2)

    const sdkOverhead = totalMs - (timings.simulation + timings.signing + timings.submission)
    expect(sdkOverhead).toBeLessThan(OVERHEAD_BUDGET_MS)
  })

  it('runs stages sequentially (signing completes before submission starts)', async () => {
    const { client, timings, sign } = setup()
    const order: Stage[] = []
    const trackedSign = async (x: string) => { const r = await sign(x); order.push('signing'); return r }
    const send = (client as any).server.sendTransaction
    ;(client as any).server.sendTransaction = async () => { order.push('submission'); return send() }
    await runPipeline(client, trackedSign)
    expect(order).toEqual(['signing', 'submission'])
    expect(timings.signing).toBeGreaterThan(0)
  })

  it.each<Stage>(['signing', 'submission'])('surfaces a %s failure without running later stages', async stage => {
    const { client, timings, sign } = setup({ failAt: stage })
    await expect(runPipeline(client, sign)).rejects.toThrow()
    if (stage === 'signing') expect(timings.submission).toBe(0)
  })

  it('surfaces a simulation failure before signing', async () => {
    const { client, timings, sign } = setup({ failAt: 'simulation' })
    await expect(runPipeline(client, sign)).rejects.toThrow('simulation failed')
    expect(timings.signing).toBe(0)
    expect(timings.submission).toBe(0)
  })
})

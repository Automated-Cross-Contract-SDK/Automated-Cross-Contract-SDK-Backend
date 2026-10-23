import { describe, it, expect } from 'vitest'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { recordRpc, exportReproFixture, createReplayServer } from './helpers/mock-rpc-recorder.js'

describe('mock-RPC repro fixtures', () => {
  it('records results and errors, exports them, and replays in order', async () => {
    let n = 0
    const real = {
      getLatestLedger: async () => ({ sequence: ++n, big: 10n }),
      sendTransaction: async () => { throw new Error('timeout') },
    }
    const { server, calls } = recordRpc(real, 'recorder-self-test')
    await server.getLatestLedger()
    await expect(server.sendTransaction()).rejects.toThrow('timeout')
    expect(calls.map(c => c.method)).toEqual(['getLatestLedger', 'sendTransaction'])
    expect(calls[0].result).toEqual({ sequence: 1, big: '10' })

    const dir = mkdtempSync(join(tmpdir(), 'repro-'))
    const file = exportReproFixture({ test: 'a/b c', recordedAt: 'now', calls }, dir)
    expect(file).toBe(join(dir, 'a_b_c.json'))
    const replay = createReplayServer(JSON.parse(readFileSync(file, 'utf8')))
    await expect(replay.getLatestLedger()).resolves.toEqual({ sequence: 1, big: '10' })
    await expect(replay.sendTransaction()).rejects.toThrow('timeout')
    await expect(replay.getLatestLedger()).rejects.toThrow('No recorded response left')
  })
})

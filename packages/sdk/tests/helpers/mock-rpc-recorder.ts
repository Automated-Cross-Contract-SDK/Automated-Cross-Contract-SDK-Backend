import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { onTestFailed } from 'vitest'

export interface RecordedRpcCall {
  method: string
  args: unknown[]
  result?: unknown
  error?: string
}

export interface ReproFixture {
  test: string
  rpcUrl?: string
  recordedAt: string
  calls: RecordedRpcCall[]
}

export const REPRO_DIR = process.env.SOROBAN_REPRO_DIR ?? join(process.cwd(), 'tests', 'fixtures', 'repro')

const toJson = (v: unknown): unknown =>
  JSON.parse(JSON.stringify(v, (_k, x) =>
    typeof x === 'bigint' ? x.toString()
      : x && typeof x === 'object' && typeof x.toXDR === 'function' ? { xdr: x.toXDR('base64') }
        : x))

/**
 * Wraps an RPC server so every call is recorded. Call inside a test: if the test
 * fails, the recorded calls are written to `REPRO_DIR/<test>.json` so the failure
 * can be replayed offline with `createReplayServer`.
 */
export function recordRpc<T extends object>(server: T, testName: string, rpcUrl?: string): { server: T; calls: RecordedRpcCall[] } {
  const calls: RecordedRpcCall[] = []
  const proxy = new Proxy(server, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver)
      if (typeof value !== 'function') return value
      return async (...args: unknown[]) => {
        const call: RecordedRpcCall = { method: String(prop), args: toJson(args) as unknown[] }
        calls.push(call)
        try {
          const result = await value.apply(target, args)
          call.result = toJson(result)
          return result
        } catch (err) {
          call.error = err instanceof Error ? err.message : String(err)
          throw err
        }
      }
    },
  })
  onTestFailed(() => { exportReproFixture({ test: testName, rpcUrl, recordedAt: new Date().toISOString(), calls }) })
  return { server: proxy, calls }
}

export function exportReproFixture(fixture: ReproFixture, dir = REPRO_DIR): string {
  mkdirSync(dir, { recursive: true })
  const file = join(dir, `${fixture.test.replace(/[^a-z0-9-_]+/gi, '_')}.json`)
  writeFileSync(file, JSON.stringify(fixture, null, 2))
  return file
}

/** Builds a mock server that replays a fixture's responses in call order per method. */
export function createReplayServer(fixture: ReproFixture): Record<string, (...args: unknown[]) => Promise<unknown>> {
  const queues = new Map<string, RecordedRpcCall[]>()
  for (const c of fixture.calls) queues.set(c.method, [...(queues.get(c.method) ?? []), c])
  return new Proxy({}, {
    get: (_t, method: string) => async () => {
      const next = queues.get(method)?.shift()
      if (!next) throw new Error(`No recorded response left for ${method}`)
      if (next.error) throw new Error(next.error)
      return next.result
    },
  })
}

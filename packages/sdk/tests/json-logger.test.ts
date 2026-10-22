import { describe, it, expect } from 'vitest'
import { jsonLogger } from '../src/logger.js'

describe('jsonLogger', () => {
  it('emits stable JSON fields', () => {
    const lines: string[] = []
    jsonLogger((l) => lines.push(l)).warn('hello', { rpcUrl: 'x' })
    const rec = JSON.parse(lines[0])
    expect(rec).toMatchObject({ level: 'warn', component: 'soroban-resurrect', message: 'hello', meta: { rpcUrl: 'x' } })
    expect(typeof rec.timestamp).toBe('string')
  })
})

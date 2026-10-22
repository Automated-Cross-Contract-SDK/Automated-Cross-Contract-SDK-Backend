import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const repoRoot = resolve(__dirname, '../../..')
const security = readFileSync(resolve(repoRoot, 'SECURITY.md'), 'utf8')

describe('SECURITY.md', () => {
  it('describes the attack surface and disclosure timeline', () => {
    expect(security).toContain('## Attack Surface')
    expect(security).toContain('## Coordinated Disclosure Timeline')
    expect(security).toContain('Within 48 hours')
    expect(security).toContain('Within 7 days')
  })

  it('documents the fuzz harness entrypoint and where its results are consumed', () => {
    expect(security).toContain('packages/sdk/tests/fuzz/xdr-parsing.fuzz.ts')
    expect(existsSync(resolve(repoRoot, 'packages/sdk/tests/fuzz/xdr-parsing.fuzz.ts'))).toBe(true)
    expect(security).toContain('.github/workflows/nightly-fuzz.yml')
    expect(existsSync(resolve(repoRoot, '.github/workflows/nightly-fuzz.yml'))).toBe(true)
  })
})

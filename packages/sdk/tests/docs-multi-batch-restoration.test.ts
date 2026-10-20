import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const repoRoot = resolve(__dirname, '../../..')
const guide = readFileSync(resolve(repoRoot, 'docs/multi-batch-restoration.md'), 'utf8')
const source = readFileSync(resolve(repoRoot, 'packages/sdk/src/soroban-resurrect.ts'), 'utf8')
const types = readFileSync(resolve(repoRoot, 'packages/sdk/src/types.ts'), 'utf8')

describe('docs/multi-batch-restoration.md', () => {
  it('documents both result types', () => {
    expect(guide).toContain('RestoreAllBatchesResult')
    expect(guide).toContain('ConcurrentRestoreResult')
    expect(types).toContain('export interface RestoreAllBatchesResult')
    expect(types).toContain('export interface ConcurrentRestoreResult')
  })

  it('references only methods that exist on the client', () => {
    for (const method of [
      'executeRestoreThenOriginalBatches',
      'executeRestoreThenOriginalBatchesConcurrent',
      'estimateRestoreFee',
      'getFailedKeys',
      'retryFailedRestore',
    ]) {
      expect(guide).toContain(method)
      expect(source).toMatch(new RegExp(`\\b${method}\\(`))
    }
  })

  it('is linked from the root README and the sdk README', () => {
    const rootReadme = readFileSync(resolve(repoRoot, 'README.md'), 'utf8')
    const sdkReadme = readFileSync(resolve(repoRoot, 'packages/sdk/README.md'), 'utf8')
    expect(rootReadme).toContain('docs/multi-batch-restoration.md')
    expect(sdkReadme).toContain('docs/multi-batch-restoration.md')
  })
})

import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const proposalsDir = resolve(__dirname, '../../../docs/proposals')
const template = readFileSync(join(proposalsDir, '0000-template.md'), 'utf8')
const index = readFileSync(join(proposalsDir, 'README.md'), 'utf8')

describe('docs/proposals', () => {
  it('template contains every required RFC section', () => {
    for (const heading of [
      '## Summary',
      '## Motivation',
      '## Guide-level explanation',
      '## Reference-level explanation',
      '## Drawbacks',
      '## Rationale and alternatives',
      '## Prior art',
      '## Unresolved questions',
      '## Future possibilities',
    ]) {
      expect(template).toContain(heading)
    }
  })

  it('index lists every existing proposal file', () => {
    const proposals = readdirSync(proposalsDir).filter(
      (file) => file.endsWith('.md') && file !== '0000-template.md' && file !== 'README.md',
    )
    expect(proposals.length).toBeGreaterThan(0)
    for (const file of proposals) {
      expect(index).toContain(`./${file}`)
    }
  })
})

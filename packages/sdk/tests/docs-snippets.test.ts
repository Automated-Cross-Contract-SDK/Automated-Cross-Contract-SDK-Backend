import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { extractSnippets, compileSnippet, DOC_FILES } from '../scripts/doc-snippets.js'

describe('documentation snippets', () => {
  it('discovers documentation files', () => {
    expect(DOC_FILES.length).toBeGreaterThan(0)
  })

  for (const file of DOC_FILES) {
    const snippets = extractSnippets(readFileSync(file, 'utf8'))
    describe(file.replace(resolve(__dirname, '../../..') + '/', ''), () => {
      snippets.forEach((snippet, i) => {
        it(`snippet #${i + 1} (line ${snippet.line}) compiles`, () => {
          expect(compileSnippet(snippet.code, snippet.lang)).toEqual([])
        })
      })
    })
  }

  it('reports syntax errors for broken snippets', () => {
    expect(compileSnippet('const x = {')).not.toEqual([])
  })

  it('skips fences marked with no-compile', () => {
    const md = '```ts no-compile\nconst x = {\n```\n```ts\nconst y = 1\n```'
    expect(extractSnippets(md)).toHaveLength(1)
  })

  it('ignores non-TypeScript fences', () => {
    expect(extractSnippets('```bash\nnpm i\n```')).toHaveLength(0)
  })
})


import { readdirSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const FENCE = /^```(ts|typescript|tsx|js|javascript)([^\n]*)\n([\s\S]*?)^```/gm

/** Markdown files whose TypeScript/JavaScript fences are compiled in CI. */
export const DOC_FILES: string[] = [
  join(ROOT, 'README.md'),
  join(ROOT, 'packages/sdk/README.md'),
  ...(existsSync(join(ROOT, 'docs'))
    ? readdirSync(join(ROOT, 'docs')).filter(f => f.endsWith('.md')).map(f => join(ROOT, 'docs', f))
    : []),
].filter(existsSync)

export interface Snippet {
  lang: string
  code: string
  line: number
}

/** Extracts code fences; a fence whose info string contains `no-compile` is skipped. */
export function extractSnippets(markdown: string): Snippet[] {
  const out: Snippet[] = []
  for (const m of markdown.matchAll(FENCE)) {
    if (m[2].includes('no-compile')) continue
    out.push({ lang: m[1], code: m[3], line: markdown.slice(0, m.index).split('\n').length })
  }
  return out
}

/** Transpiles a snippet and returns syntax diagnostics (empty when it compiles). */
export function compileSnippet(code: string, lang = 'ts'): string[] {
  const { diagnostics = [] } = ts.transpileModule(code, {
    reportDiagnostics: true,
    fileName: `snippet.${lang.startsWith('tsx') ? 'tsx' : 'ts'}`,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.Preserve },
  })
  return diagnostics.map(d => ts.flattenDiagnosticMessageText(d.messageText, '\n'))
}

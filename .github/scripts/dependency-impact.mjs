#!/usr/bin/env node
/**
 * Builds a Markdown dependency impact report by diffing two `npm ls --all --json`
 * trees produced by the "Dependency Impact Report" workflow.
 *
 * Inputs (relative to CWD): base-tree.json, head-tree.json, base-size.txt, head-size.txt
 * Output: Markdown on stdout.
 */

import fs from 'node:fs'

const readJson = (f) => {
  try {
    return JSON.parse(fs.readFileSync(f, 'utf8'))
  } catch {
    return {}
  }
}
const readText = (f) => {
  try {
    return fs.readFileSync(f, 'utf8').trim() || 'n/a'
  } catch {
    return 'n/a'
  }
}

/** Flatten an npm ls tree into { packageName: version }. */
const flatten = (node, acc = {}) => {
  for (const [name, info] of Object.entries(node?.dependencies || {})) {
    if (info?.version) acc[name] = info.version
    flatten(info, acc)
  }
  return acc
}

const before = flatten(readJson('base-tree.json'))
const after = flatten(readJson('head-tree.json'))

const names = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort()
const added = []
const removed = []
const changed = []

for (const n of names) {
  if (!(n in before)) added.push(n)
  else if (!(n in after)) removed.push(n)
  else if (before[n] !== after[n]) changed.push(n)
}

const list = (items, fmt) => (items.length ? items.map(fmt).map((l) => `- ${l}`).join('\n') : '_none_')

const report = `## 📦 Dependency Impact Report

### Version changes
${list(changed, (n) => `\`${n}\`: ${before[n]} → **${after[n]}**`)}

### New transitive dependencies
${list(added, (n) => `\`${n}@${after[n]}\``)}

### Removed transitive dependencies
${list(removed, (n) => `\`${n}@${before[n]}\``)}

### Installed size (\`node_modules\`)
| | size |
|---|---|
| before | ${readText('base-size.txt')} |
| after | ${readText('head-size.txt')} |

### Security & license
- Vulnerability delta: see the \`npm audit\` output in the CI logs for this PR.
- License review: check the **new** packages listed above against project policy.

### Changelogs
${list(changed.length ? changed : added, (n) => `[\`${n}\`](https://www.npmjs.com/package/${n})`)}

### Tests
- Build & test results for these changes are reported by the **CI** workflow on this PR.
`

process.stdout.write(report)

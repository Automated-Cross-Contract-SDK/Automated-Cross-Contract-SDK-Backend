#!/usr/bin/env node
/**
 * Refresh protocol-upgrade fixtures.
 *
 * Copies protocol-upgrade fixture JSON files from a source directory into the
 * SDK test fixtures directory. Each file must be a JSON object with an integer
 * `protocolVersion` and a non-empty string `name`. Files are written with
 * sorted keys so diffs stay small.
 *
 * Usage:
 *   node scripts/refresh-protocol-fixtures.mjs --from <dir> [--out <dir>] [--check]
 *
 *   --from   Directory containing the upstream fixture JSON files (required).
 *   --out    Destination directory (default: packages/sdk/tests/fixtures/protocol-upgrade).
 *   --check  Do not write. Exit with status 1 if the destination is out of date.
 */

import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
export const DEFAULT_OUT_DIR = resolve(SCRIPT_DIR, '../packages/sdk/tests/fixtures/protocol-upgrade')

/**
 * Validate a parsed fixture. Throws with the file name when a field is missing.
 * @param {string} file
 * @param {unknown} data
 */
export function validateFixture(file, data) {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error(`${file}: fixture must be a JSON object`)
  }
  if (!Number.isInteger(data.protocolVersion)) {
    throw new Error(`${file}: protocolVersion must be an integer`)
  }
  if (typeof data.name !== 'string' || data.name.trim() === '') {
    throw new Error(`${file}: name must be a non-empty string`)
  }
  return data
}

/** Serialize with keys sorted at every level so output is stable. */
export function stableStringify(value) {
  const sort = v => {
    if (Array.isArray(v)) return v.map(sort)
    if (v !== null && typeof v === 'object') {
      return Object.fromEntries(Object.keys(v).sort().map(k => [k, sort(v[k])]))
    }
    return v
  }
  return `${JSON.stringify(sort(value), null, 2)}\n`
}

/**
 * Read, validate and render every `.json` fixture in `fromDir`.
 * @returns {Promise<Map<string, string>>} file name → rendered content
 */
export async function loadFixtures(fromDir) {
  const names = (await readdir(fromDir)).filter(f => f.endsWith('.json')).sort()
  const rendered = new Map()
  for (const name of names) {
    const raw = await readFile(join(fromDir, name), 'utf8')
    let data
    try {
      data = JSON.parse(raw)
    } catch (err) {
      throw new Error(`${name}: invalid JSON (${err.message})`)
    }
    rendered.set(name, stableStringify(validateFixture(name, data)))
  }
  if (rendered.size === 0) {
    throw new Error(`${fromDir}: no .json fixtures found`)
  }
  return rendered
}

/**
 * Refresh the destination directory from `fromDir`.
 * @param {{ from: string, out?: string, check?: boolean }} options
 * @returns {Promise<{ changed: string[], upToDate: boolean }>}
 */
export async function refreshProtocolFixtures({ from, out = DEFAULT_OUT_DIR, check = false }) {
  const expected = await loadFixtures(resolve(from))
  const changed = []

  for (const [name, content] of expected) {
    const dest = join(out, name)
    let current = null
    try {
      current = await readFile(dest, 'utf8')
    } catch {
      // Missing destination counts as changed.
    }
    if (current !== content) changed.push(name)
  }

  if (!check && changed.length > 0) {
    await mkdir(out, { recursive: true })
    for (const name of changed) {
      await writeFile(join(out, name), expected.get(name), 'utf8')
    }
  }

  return { changed, upToDate: changed.length === 0 }
}

async function main(argv) {
  const args = { check: false }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--check') args.check = true
    else if (arg === '--from') args.from = argv[++i]
    else if (arg === '--out') args.out = argv[++i]
    else throw new Error(`Unknown argument: ${arg}`)
  }
  if (!args.from) throw new Error('--from <dir> is required')

  const { changed, upToDate } = await refreshProtocolFixtures(args)
  if (args.check) {
    if (upToDate) {
      console.log('Protocol fixtures are up to date.')
      return 0
    }
    console.error(`Protocol fixtures are out of date: ${changed.join(', ')}`)
    return 1
  }
  console.log(changed.length === 0 ? 'No fixture changes.' : `Updated: ${changed.join(', ')}`)
  return 0
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2))
    .then(code => {
      process.exitCode = code
    })
    .catch(err => {
      console.error(err.message)
      process.exitCode = 2
    })
}

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
// @ts-expect-error - plain ESM maintainer script without type declarations
import { refreshProtocolFixtures, validateFixture } from '../../../scripts/refresh-protocol-fixtures.mjs'

const upstreamFixture = { name: 'upgrade-v21', protocolVersion: 21, entries: { b: 2, a: 1 } }

describe('refreshProtocolFixtures', () => {
  let root: string
  let from: string
  let out: string

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'protocol-fixtures-'))
    from = join(root, 'upstream')
    out = join(root, 'out')
    await mkdir(from)
    await writeFile(join(from, 'upgrade-v21.json'), JSON.stringify(upstreamFixture))
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('writes validated fixtures with sorted keys into the destination', async () => {
    const result = await refreshProtocolFixtures({ from, out })

    expect(result).toEqual({ changed: ['upgrade-v21.json'], upToDate: false })
    const written = await readFile(join(out, 'upgrade-v21.json'), 'utf8')
    expect(written).toBe(
      `${JSON.stringify({ entries: { a: 1, b: 2 }, name: 'upgrade-v21', protocolVersion: 21 }, null, 2)}\n`,
    )
  })

  it('is idempotent: a second run reports nothing changed', async () => {
    await refreshProtocolFixtures({ from, out })
    const second = await refreshProtocolFixtures({ from, out })

    expect(second).toEqual({ changed: [], upToDate: true })
  })

  it('check mode reports drift without writing anything', async () => {
    const result = await refreshProtocolFixtures({ from, out, check: true })

    expect(result.upToDate).toBe(false)
    await expect(readFile(join(out, 'upgrade-v21.json'), 'utf8')).rejects.toThrow()
  })

  it('check mode passes once the destination matches upstream', async () => {
    await refreshProtocolFixtures({ from, out })
    const result = await refreshProtocolFixtures({ from, out, check: true })

    expect(result.upToDate).toBe(true)
  })

  it('rejects a fixture whose protocolVersion is not an integer', async () => {
    await writeFile(join(from, 'bad.json'), JSON.stringify({ name: 'x', protocolVersion: '21' }))

    await expect(refreshProtocolFixtures({ from, out })).rejects.toThrow(
      'bad.json: protocolVersion must be an integer',
    )
  })

  it('rejects invalid JSON with the file name', async () => {
    await writeFile(join(from, 'broken.json'), '{ not json')

    await expect(refreshProtocolFixtures({ from, out })).rejects.toThrow(/broken\.json: invalid JSON/)
  })

  it('fails when the upstream directory has no fixtures', async () => {
    const empty = join(root, 'empty')
    await mkdir(empty)

    await expect(refreshProtocolFixtures({ from: empty, out })).rejects.toThrow('no .json fixtures found')
  })
})

describe('validateFixture', () => {
  it('requires a non-empty name', () => {
    expect(() => validateFixture('f.json', { name: '  ', protocolVersion: 22 })).toThrow('name must be a non-empty string')
  })

  it('rejects arrays and null as fixture roots', () => {
    expect(() => validateFixture('f.json', [])).toThrow('must be a JSON object')
    expect(() => validateFixture('f.json', null)).toThrow('must be a JSON object')
  })
})

// Shared helpers: pack built workspace packages and install them into a clean,
// throwaway consumer project (no workspace symlinks, only what `npm pack` ships).
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, existsSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

/** Publishable packages that have been built (have a dist/ folder). */
export function listPackages() {
  const dir = join(ROOT, 'packages')
  return readdirSync(dir)
    .map((name) => join(dir, name))
    .filter((p) => existsSync(join(p, 'package.json')))
    .map((p) => ({ dir: p, pkg: JSON.parse(readFileSync(join(p, 'package.json'), 'utf8')) }))
    .filter(({ pkg }) => !pkg.private && pkg.exports)
    .map((p) => ({ ...p, built: existsSync(join(p.dir, 'dist')) }))
}

/** Flatten an export map into [{ subpath, conditions: { import?, require?, default?, ... } }]. */
export function exportEntries(pkg) {
  const exp = typeof pkg.exports === 'string' ? { '.': pkg.exports } : pkg.exports
  return Object.entries(exp).map(([subpath, target]) => ({
    subpath,
    specifier: subpath === '.' ? pkg.name : `${pkg.name}/${subpath.replace(/^\.\//, '')}`,
    conditions: typeof target === 'string' ? { default: target } : target,
  }))
}

/**
 * Create a clean consumer: `npm pack` each package, extract the tarball into
 * consumer/node_modules, and link third-party peers from the workspace root so
 * the run stays offline.
 */
export function createConsumer(packages) {
  const work = mkdtempSync(join(tmpdir(), 'soroban-consumer-'))
  const nm = join(work, 'node_modules')
  mkdirSync(nm, { recursive: true })
  writeFileSync(join(work, 'package.json'), JSON.stringify({ name: 'consumer', private: true, type: 'module' }))

  for (const { dir, pkg } of packages) {
    const out = execFileSync('npm', ['pack', '--json', '--pack-destination', work], { cwd: dir, encoding: 'utf8' })
    const tarball = join(work, JSON.parse(out)[0].filename)
    const dest = join(nm, pkg.name)
    mkdirSync(dest, { recursive: true })
    execFileSync('tar', ['-xzf', tarball, '-C', dest, '--strip-components=1'])
  }

  const linked = new Set(packages.map((p) => p.pkg.name))
  const deps = packages.flatMap(({ pkg }) =>
    Object.keys({ ...pkg.dependencies, ...pkg.peerDependencies }),
  )
  for (const dep of new Set(deps)) {
    if (linked.has(dep)) continue
    const src = join(ROOT, 'node_modules', dep)
    if (!existsSync(src)) continue // optional peer not installed in the workspace
    mkdirSync(dirname(join(nm, dep)), { recursive: true })
    symlinkSync(src, join(nm, dep), 'dir')
  }
  return work
}

export function peerExternals(pkg) {
  return Object.keys({ ...pkg.dependencies, ...pkg.peerDependencies })
}

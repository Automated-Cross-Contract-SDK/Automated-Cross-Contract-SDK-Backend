#!/usr/bin/env node
/**
 * Pre-release smoke check. For every publishable workspace package it runs
 * `npm pack --dry-run` and asserts that each file the manifest points at
 * (`main`, `module`, `types`, `typings`, and every `exports` target) is
 * actually included in the tarball. This catches `files` whitelists or
 * `exports` maps that drift from the build output before users hit
 * ERR_MODULE_NOT_FOUND after publishing.
 *
 *   npm run verify-release
 *
 * Run it after `npm run build`; the release workflow does so before publish.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const normalise = (path) => path.replace(/^\.\//, '');

/** Collects every string target from an `exports` value, however nested. */
export function collectExportTargets(exportsField) {
  if (typeof exportsField === 'string') return [exportsField];
  if (Array.isArray(exportsField)) return exportsField.flatMap(collectExportTargets);
  if (exportsField && typeof exportsField === 'object') {
    return Object.values(exportsField).flatMap(collectExportTargets);
  }
  return [];
}

/**
 * Returns human-readable problems for a manifest given the list of paths
 * that `npm pack` would ship. An empty array means the package is consistent.
 */
export function findPackageProblems(pkg, packedPaths) {
  const shipped = new Set(packedPaths.map(normalise));
  const referenced = [
    pkg.main,
    pkg.module,
    pkg.types,
    pkg.typings,
    ...collectExportTargets(pkg.exports),
  ].filter((target) => typeof target === 'string');

  return [...new Set(referenced.map(normalise))]
    .filter((target) => !shipped.has(target))
    .map(
      (target) =>
        `${pkg.name}: "${target}" is referenced by package.json but not included in the packed tarball`,
    );
}

/** Lists the files `npm pack` would include, without writing a tarball. */
export function listPackedPaths(packageDir) {
  const output = execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
    cwd: packageDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  const [result] = JSON.parse(output);
  return result.files.map((file) => file.path);
}

/** Workspace packages that are published (i.e. not `private`). */
export function publishableWorkspaces(rootDir) {
  const { workspaces } = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf8'));
  return workspaces
    .map((dir) => join(rootDir, dir))
    .map((dir) => ({ dir, pkg: JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) }))
    .filter(({ pkg }) => !pkg.private && pkg.name);
}

function main() {
  const problems = [];
  const workspaces = publishableWorkspaces(root);

  for (const { dir, pkg } of workspaces) {
    const packed = listPackedPaths(dir);
    problems.push(...findPackageProblems(pkg, packed));
    console.log(`checked ${pkg.name}@${pkg.version} (${packed.length} files)`);
  }

  if (problems.length > 0) {
    console.error(`\nverify-release failed with ${problems.length} problem(s):`);
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exit(1);
  }
  console.log(`\nverify-release passed for ${workspaces.length} package(s)`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();

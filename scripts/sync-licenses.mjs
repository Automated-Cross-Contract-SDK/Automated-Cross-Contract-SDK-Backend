#!/usr/bin/env node
// Sync the repository root LICENSE into every published package so that the
// `files: ["LICENSE"]` entries in each package.json resolve and npm tarballs
// include the MIT license text. See issue #376.
//
// Usage: node scripts/sync-licenses.mjs [--check]
//   (default) copy the root LICENSE into each published package
//   --check   verify each package LICENSE matches the root; exit 1 on drift

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const packagesDir = join(repoRoot, 'packages');
const rootLicensePath = join(repoRoot, 'LICENSE');

const checkOnly = process.argv.includes('--check');

if (!existsSync(rootLicensePath)) {
  console.error(`[sync-licenses] Root LICENSE not found at ${rootLicensePath}`);
  process.exit(1);
}

const rootLicense = readFileSync(rootLicensePath, 'utf8');

if (!existsSync(packagesDir)) {
  console.error(`[sync-licenses] packages directory not found at ${packagesDir}`);
  process.exit(1);
}

/** Collect package directories that declare a LICENSE in their files array. */
function findPublishedPackages() {
  const found = [];
  for (const entry of readdirSync(packagesDir)) {
    const pkgDir = join(packagesDir, entry);
    if (!statSync(pkgDir).isDirectory()) continue;
    const pkgJsonPath = join(pkgDir, 'package.json');
    if (!existsSync(pkgJsonPath)) continue;
    let pkgJson;
    try {
      pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf8'));
    } catch (err) {
      console.error(`[sync-licenses] Failed to parse ${pkgJsonPath}: ${err.message}`);
      process.exit(1);
    }
    if (pkgJson.private) continue;
    const files = Array.isArray(pkgJson.files) ? pkgJson.files : [];
    if (!files.includes('LICENSE')) continue;
    found.push({ name: pkgJson.name || entry, dir: pkgDir });
  }
  return found;
}

const packages = findPublishedPackages();

if (packages.length === 0) {
  console.warn('[sync-licenses] No published packages declaring LICENSE were found.');
  process.exit(0);
}

let drift = 0;

for (const pkg of packages) {
  const targetPath = join(pkg.dir, 'LICENSE');
  const existing = existsSync(targetPath) ? readFileSync(targetPath, 'utf8') : null;

  if (existing === rootLicense) {
    console.log(`[sync-licenses] up to date: ${pkg.name}`);
    continue;
  }

  if (checkOnly) {
    drift += 1;
    console.error(`[sync-licenses] out of sync: ${pkg.name} (${targetPath})`);
    continue;
  }

  writeFileSync(targetPath, rootLicense);
  console.log(`[sync-licenses] wrote ${targetPath}`);
}

if (checkOnly && drift > 0) {
  console.error(`[sync-licenses] ${drift} package LICENSE file(s) out of sync with root LICENSE.`);
  process.exit(1);
}

console.log(`[sync-licenses] done (${packages.length} package(s)).`);

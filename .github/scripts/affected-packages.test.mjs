import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PACKAGES_DIR = join(ROOT, 'packages');

/**
 * Reads every workspace package.json and returns name -> set of workspace deps.
 */
function loadWorkspaceGraph() {
  const graph = new Map();
  for (const dir of readdirSync(PACKAGES_DIR)) {
    let pkg;
    try {
      pkg = JSON.parse(readFileSync(join(PACKAGES_DIR, dir, 'package.json'), 'utf8'));
    } catch {
      continue;
    }
    const deps = new Set([
      ...Object.keys(pkg.dependencies ?? {}),
      ...Object.keys(pkg.peerDependencies ?? {}),
      ...Object.keys(pkg.devDependencies ?? {}),
    ]);
    graph.set(pkg.name, deps);
  }
  return graph;
}

/**
 * Returns the transitive set of packages that depend on `target`.
 */
function dependentsOf(graph, target) {
  const affected = new Set([target]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const [name, deps] of graph) {
      if (!affected.has(name) && [...deps].some((dep) => affected.has(dep))) {
        affected.add(name);
        changed = true;
      }
    }
  }
  affected.delete(target);
  return affected;
}

describe('affected-package detection (#445)', () => {
  const graph = loadWorkspaceGraph();
  const RPC = '@soroban-resurrect/rpc';

  it('a change to packages/rpc affects its direct dependents', () => {
    const affected = dependentsOf(graph, RPC);

    assert.ok(affected.has('@soroban-resurrect/core'));
    assert.ok(affected.has('@soroban-resurrect/sdk'));
  });

  it('a change to packages/rpc affects the react package through the dependency chain', () => {
    const affected = dependentsOf(graph, RPC);

    assert.ok(affected.has('@soroban-resurrect/react'));
  });

  it('a change to packages/rpc does not affect unrelated leaf packages', () => {
    const affected = dependentsOf(graph, RPC);

    assert.equal(affected.has('@soroban-resurrect/types'), false);
    assert.equal(affected.has('@soroban-resurrect/errors'), false);
  });
});

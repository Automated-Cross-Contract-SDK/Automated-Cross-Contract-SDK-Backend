import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectExportTargets, findPackageProblems } from './verify-release.mjs';

const goodPkg = {
  name: '@fixture/good',
  main: './dist/index.cjs',
  types: './dist/index.d.ts',
  exports: {
    '.': {
      types: './dist/index.d.ts',
      import: './dist/index.js',
      require: './dist/index.cjs',
    },
  },
};

const packed = ['package.json', 'dist/index.js', 'dist/index.cjs', 'dist/index.d.ts'];

test('collectExportTargets walks nested conditions and arrays', () => {
  assert.deepEqual(
    collectExportTargets({
      '.': { import: './a.js', require: ['./b.cjs', { default: './c.js' }] },
    }),
    ['./a.js', './b.cjs', './c.js'],
  );
});

test('accepts a manifest whose targets are all shipped', () => {
  assert.deepEqual(findPackageProblems(goodPkg, packed), []);
});

test('catches an exports target missing from the tarball', () => {
  const broken = {
    ...goodPkg,
    exports: { '.': { import: './dist/missing.js', require: './dist/index.cjs' } },
  };
  const problems = findPackageProblems(broken, packed);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /"dist\/missing\.js" is referenced/);
});

test('catches a types file excluded by the files whitelist', () => {
  const problems = findPackageProblems(
    goodPkg,
    packed.filter((p) => p !== 'dist/index.d.ts'),
  );
  assert.ok(problems.some((p) => p.includes('"dist/index.d.ts"')));
});

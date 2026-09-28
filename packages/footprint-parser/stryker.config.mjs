/**
 * Stryker mutation testing configuration for @soroban-resurrect/footprint-parser.
 *
 * Run with:  npm run test:mutation -w packages/footprint-parser
 * Requires @stryker-mutator/core and @stryker-mutator/vitest-runner (run `npm install`).
 */
const config = {
  packageManager: 'npm',
  reporters: ['html', 'clear-text', 'progress', 'json'],
  htmlReporter: { fileName: 'reports/mutation/index.html' },
  jsonReporter: { fileName: 'reports/mutation/mutation.json' },
  testRunner: 'vitest',
  coverageAnalysis: 'perTest',
  mutate: ['src/**/*.ts', '!src/**/*.d.ts'],
  vitest: { configFile: 'vitest.config.ts' },
  // Advisory for now: survivors are reported, not enforced.
  thresholds: { high: 80, low: 60, break: null },
  timeoutMS: 60_000,
  tempDirName: '.stryker-tmp',
  cleanTempDir: 'always',
  disableTypeChecks: true,
}

export default config

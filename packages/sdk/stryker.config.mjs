/**
 * Stryker mutation testing configuration for the SDK.
 *
 * Stryker measures the effectiveness of our test suite by injecting bugs
 * ("mutants") into the source code and checking whether any test fails.
 * A passing mutant signals a gap in test coverage.
 *
 * Run with:  npx stryker run
 *
 * Docs: https://stryker-mutator.io/docs/stryker-js/vitest-runner/
 */
const config = {
  packageManager: 'npm',
  reporters: ['html', 'clear-text', 'progress'],
  htmlReporter: {
    fileName: 'stryker-report.html',
  },
  testRunner: 'vitest',
  testRunner_comment:
    'Uses @stryker-mutator/vitest-runner (installed as devDependency).',
  coverageAnalysis: 'perTest',
  mutate: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/index.ts',          // barrel file – re-exports only
    '!src/version.ts',        // static VERSION constant
    '!src/constants.ts',      // static constants
  ],
  vitest: {
    configFile: 'vitest.config.ts',
  },
  thresholds: {
    high: 80,
    low: 70,
    break: 70,
  },
  timeoutMS: 120_000,
  tempDirName: '.stryker-tmp',
  cleanTempDir: 'always',
  disableTypeChecks: true,
  // Stryker sandboxes mutate per-test; full tsc is covered by CI typecheck step.
}

export default config

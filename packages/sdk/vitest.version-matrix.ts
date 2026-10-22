import { defineConfig } from 'vitest/config'

/**
 * Version-specific integration test suites for Soroban protocols 20, 21, and 22.
 *
 * These tests validate the SDK against each supported protocol version
 * to detect API drift across RPC releases.
 *
 * Usage:
 *   # Run all version-specific suites:
 *   SOROBAN_RPC_URL=https://rpc-futurenet.stellar.org npx vitest run --config vitest.version-matrix.ts
 *
 *   # Run a single version:
 *   SOROBAN_RPC_URL=https://localhost:8000/soroban/rpc npx vitest run --config vitest.version-matrix.ts
 *
 * CI matrix:
 *   See .github/workflows/ci.yml → `version-matrix` job.
 */

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/version-matrix/**/*.test.ts'],
    testTimeout: 120_000,
    hookTimeout: 30_000,
    retry: 2,
  },
})

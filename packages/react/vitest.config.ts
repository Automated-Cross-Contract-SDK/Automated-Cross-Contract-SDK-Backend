import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    setupFiles: ['tests/setup.ts'],
    css: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      thresholds: {
        lines: 80,
        branches: 70,
        functions: 75,
        statements: 80,
      },
    },
  },
})

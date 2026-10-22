import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    // The package's canonical suite lives in `tests/` (same layout as the
    // sdk/react packages). The stale co-located `src/adapters/*.test.ts` files
    // predate the adapter rewrites and assert removed behaviour.
    include: ['tests/**/*.test.ts'],
  },
})

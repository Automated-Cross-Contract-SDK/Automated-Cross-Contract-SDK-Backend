import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  outDir: 'dist',
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  // Keep .js extension for ESM and .cjs for CommonJS
  outExtension({ format }) {
    return { js: format === 'cjs' ? '.cjs' : '.js' }
  },
  // Treat stellar-sdk and internal packages as external
  external: [
    '@stellar/stellar-sdk',
    '@soroban-resurrect/types',
    '@soroban-resurrect/errors',
    '@soroban-resurrect/footprint-parser',
    '@soroban-resurrect/rpc',
    '@soroban-resurrect/utils',
    '@soroban-resurrect/core',
  ],
})

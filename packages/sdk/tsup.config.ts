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
  // Treat stellar-sdk as external — consumers provide it
  external: ['@stellar/stellar-sdk'],
})

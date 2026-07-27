import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  outDir: 'dist',
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  outExtension({ format }) {
    return { js: format === 'cjs' ? '.cjs' : '.js' }
  },
  // Treat React and the SDK as external peer dependencies
  external: ['react', 'react-dom', '@soroban-resurrect/sdk', '@stellar/stellar-sdk'],
})

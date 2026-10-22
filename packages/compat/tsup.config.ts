import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
  external: ['@soroban-resurrect/core', '@soroban-resurrect/types', '@soroban-resurrect/errors', '@soroban-resurrect/footprint-parser', '@soroban-resurrect/rpc', '@soroban-resurrect/utils'],
})

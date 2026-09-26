import { defineConfig } from 'tsup'

export default defineConfig({
  entry: [
    'src/index.native.ts',
    'src/crypto.quick-crypto.ts',
    'src/crypto.expo-crypto.ts',
  ],
  outDir: 'dist',
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  external: [
    '@soroban-resurrect/react',
    '@soroban-resurrect/sdk',
    'react',
    'react-native',
    'react-native-quick-crypto',
    'expo-crypto',
  ],
})

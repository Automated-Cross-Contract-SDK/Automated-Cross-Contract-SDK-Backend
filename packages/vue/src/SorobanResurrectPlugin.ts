import type { App } from 'vue'
import { useSorobanResurrect } from './composables/useSorobanResurrect.js'
import { SOROBAN_RESURRECT_INJECTION_KEY, type SorobanResurrectPluginOptions } from './types.js'

export const SorobanResurrectPlugin = {
  install(app: App, options: SorobanResurrectPluginOptions) {
    const resurrect = useSorobanResurrect(options)
    app.provide(SOROBAN_RESURRECT_INJECTION_KEY, resurrect)
    app.config.globalProperties.$sorobanResurrect = resurrect
  },
}

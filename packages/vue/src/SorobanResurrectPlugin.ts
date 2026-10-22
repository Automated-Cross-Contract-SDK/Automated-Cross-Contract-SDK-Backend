import type { App } from 'vue'
import { useSorobanResurrect } from './composables/useSorobanResurrect.js'
import { SOROBAN_RESURRECT_INJECTION_KEY, type SorobanResurrectPluginOptions, type SorobanResurrectPluginContextValue } from './types.js'

export const SorobanResurrectPlugin = {
  install(app: App, options: SorobanResurrectPluginOptions) {
    const resurrect = useSorobanResurrect(options)

    const config = {
      rpcUrl: options.rpcUrl,
      networkPassphrase: options.networkPassphrase,
      allowHttp: options.allowHttp,
      timeout: options.timeout,
    }

    const contextValue: SorobanResurrectPluginContextValue = {
      resurrect,
      config,
    }

    app.provide(SOROBAN_RESURRECT_INJECTION_KEY, contextValue)
    app.config.globalProperties.$sorobanResurrect = contextValue
  },
}

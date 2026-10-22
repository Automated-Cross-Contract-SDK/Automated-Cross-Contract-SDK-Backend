/**
 * Example usage of runtime feature flags
 * 
 * This demonstrates how to use feature flags to enable/disable experimental features
 * without breaking changes.
 */

import { SorobanResurrect } from '@soroban-resurrect/core'
import type { FeatureFlags } from '@soroban-resurrect/types'

// Example 1: Basic usage with all flags disabled (default)
const resurrect = new SorobanResurrect({
  rpcUrl: 'https://rpc-futurenet.stellar.org',
  networkPassphrase: 'Test SDF Future Network ; October 2022',
})

console.log('Default feature flags:', resurrect.getFeatureFlags())
// Output: { feeBumpSupport: false, concurrentBatches: false, wasmParser: false, persistentCache: false }

// Example 2: Enable specific experimental features
const resurrectWithFlags = new SorobanResurrect({
  rpcUrl: 'https://rpc-futurenet.stellar.org',
  networkPassphrase: 'Test SDF Future Network ; October 2022',
  featureFlags: {
    feeBumpSupport: true,      // Enable fee bump transaction support
    concurrentBatches: true,  // Enable concurrent batch execution
  },
})

console.log('Custom feature flags:', resurrectWithFlags.getFeatureFlags())
// Output: { feeBumpSupport: true, concurrentBatches: true, wasmParser: false, persistentCache: false }

// Example 3: Check if a specific feature is enabled
if (resurrectWithFlags.isFeatureEnabled('feeBumpSupport')) {
  console.log('Fee bump support is enabled')
  // Safe to use fee bump transactions
}

// Example 4: Update feature flags at runtime
resurrectWithFlags.setFeatureFlags({
  wasmParser: true,  // Enable WASM parser dynamically
})

console.log('Updated feature flags:', resurrectWithFlags.getFeatureFlags())
// Output: { feeBumpSupport: true, concurrentBatches: true, wasmParser: true, persistentCache: false }

// Example 5: Using feature flags for A/B testing
const isTestGroup = Math.random() > 0.5
const testResurrect = new SorobanResurrect({
  rpcUrl: 'https://rpc-futurenet.stellar.org',
  networkPassphrase: 'Test SDF Future Network ; October 2022',
  featureFlags: {
    concurrentBatches: isTestGroup,  // Enable for 50% of users
  },
})

if (testResurrect.isFeatureEnabled('concurrentBatches')) {
  console.log('Using concurrent batch execution (test group)')
  // Use concurrent batch execution
} else {
  console.log('Using sequential batch execution (control group)')
  // Use sequential batch execution
}

// Example 6: Safe rollout with feature flags
const safeRollout = new SorobanResurrect({
  rpcUrl: 'https://rpc-futurenet.stellar.org',
  networkPassphrase: 'Test SDF Future Network ; October 2022',
  featureFlags: {
    persistentCache: false,  // Start with experimental feature disabled
  },
})

// Later, after monitoring, enable the feature for all users
safeRollout.setFeatureFlags({ persistentCache: true })
console.log('Persistent cache now enabled')

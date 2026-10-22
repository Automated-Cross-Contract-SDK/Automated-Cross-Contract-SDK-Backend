# Migration Guide: v0.1.0 to v1.0.0

This guide covers breaking changes and migration steps for upgrading from v0.1.0 to v1.0.0 of the Automated Cross-Contract SDK.

## Package Map

The SDK is now a modular monorepo. `@soroban-resurrect/sdk` is a compatibility façade over the modular packages; new code should import from the focused packages directly. The table below lists every published package, its one-line description, and its stability.

| Package | Description | Stability |
|---------|-------------|-----------|
| `@soroban-resurrect/sdk` | Compatibility façade re-exporting the modular packages | Stable |
| `@soroban-resurrect/core` | Core restoration engine and orchestration | Stable |
| `@soroban-resurrect/types` | Shared TypeScript types and interfaces | Stable |
| `@soroban-resurrect/errors` | Typed error classes and error codes | Stable |
| `@soroban-resurrect/rpc` | Soroban RPC client and transport | Stable |
| `@soroban-resurrect/utils` | Shared utilities and helpers | Stable |
| `@soroban-resurrect/footprint-parser` | Ledger footprint parsing | Stable |
| `@soroban-resurrect/footprint-parser-wasm` | WASM-accelerated footprint parsing | Experimental |
| `@soroban-resurrect/mock-rpc` | In-memory mock RPC for tests | Stable |
| `@soroban-resurrect/compat` | Migration shims for v0.1.0 APIs | Stable |
| `@soroban-resurrect/wallet-adapters` | Wallet connection adapters | Stable |
| `@soroban-resurrect/react` | React bindings and hooks | Stable |
| `@soroban-resurrect/next` | Next.js bindings and helpers | Stable |
| `@soroban-resurrect/react-native` | React Native bindings | Experimental |
| `@soroban-resurrect/angular` | Angular bindings and services | Experimental |
| `@soroban-resurrect/vue` | Vue bindings and composables | Experimental |
| `@soroban-resurrect/svelte` | Svelte bindings and stores | Experimental |
| `@soroban-resurrect/cli` | Command-line tooling | Stable |
| `@soroban-resurrect/devtools-extension` | Browser devtools extension | Experimental |
| `@soroban-resurrect/vscode-extension` | VS Code extension | Experimental |
| `@soroban-resurrect/example` | Example application | Experimental |

### Framework Bindings

Framework-specific bindings are published as separate packages so you only pull in what you use: `@soroban-resurrect/react`, `@soroban-resurrect/next`, `@soroban-resurrect/react-native`, `@soroban-resurrect/angular`, `@soroban-resurrect/vue`, and `@soroban-resurrect/svelte`.

### Migrating to the Modular Packages

`@soroban-resurrect/compat` provides shims for the v0.1.0 API surface, so existing imports from `@soroban-resurrect/sdk` keep working while you migrate. Move to the focused packages incrementally:

```typescript
// Before: single entry point
import { RestorationService } from '@soroban-resurrect/sdk';

// After: import from the focused package
import { RestorationService } from '@soroban-resurrect/core';
```

## Angular Service Scope with Multiple Application Roots

`@soroban-resurrect/angular` services are provided at the **root injector** by default (`providedIn: 'root'`). This means a single service instance is shared across the whole application, which is the supported behavior for the common single-root case.

When an application hosts **multiple Angular application roots** (for example, several independently bootstrapped apps on one page, micro-frontends, or multiple `bootstrapApplication` calls), each root has its own injector tree. The supported behavior is:

- **One instance per root injector.** Services provided at root are instantiated once per application root, not once per page. Two roots do not share a service instance.
- **No cross-root state sharing.** State held by a root-scoped service (connection status, wallet selection, in-flight restoration state) is isolated to the root that created it. Do not assume a service resolved in root A reflects state from root B.
- **Explicit sharing requires a shared provider.** To share a single instance across roots, provide the service in a shared parent injector (e.g. a platform injector or a manually created `Injector`) and pass it to each root via `bootstrapApplication`'s `providers`, or use a shared module-level singleton. Sharing is opt-in, never implicit.

### Edge cases and failure modes

- **Duplicate instances:** resolving the same root-provided service from two different roots yields two distinct instances. Code that relies on identity equality across roots will fail; compare state explicitly instead.
- **Missing providers:** if a service is provided in a feature-level injector rather than at root, resolving it from a different root throws Angular's `NullInjectorError: No provider for ...`. Provide the service at the root (or a shared parent) of every root that needs it.
- **Cross-root injection:** injecting a root-A service into a root-B component is not supported and will either fail resolution or silently bind to root B's own instance. Keep service usage within the root that provides it.
- **Teardown:** destroying one root destroys only that root's service instances; instances in other roots remain alive. Do not hold references to a destroyed root's services.

### Migration note

If your v0.1.0 code assumed a single global service instance across multiple bootstrapped apps, move shared state into an explicitly shared provider (see above) or consolidate to a single application root. No API changes are required for single-root applications.

## Breaking Changes Summary

### 1. EventEmitter-Based Configuration
**Before:** PreFlightConfig used callbacks
**After:** PreFlightConfig uses EventEmitter pattern

### 2. Batch Processing API Changes
**Before:** Sequential key processing
**After:** Batch processing with 50 keys / 100KB limits

### 3. Retry Logic Moved to Core
**Before:** Applications handled retries manually
**After:** Built-in 3-attempt exponential backoff

### 4. Fee-Bump Transaction Rejection
**Before:** No restrictions
**After:** Fee-bump transactions are rejected

### 5. ESM-Only Module Distribution
**Before:** Dual ESM/CJS support
**After:** ESM-only packages

## Deprecated APIs and Replacements

### PreFlightConfig Callbacks → EventEmitter

**Before:**
```typescript
const preflight = new PreFlightConfig({
  onSuccess: (result) => console.log(result),
  onError: (error) => console.error(error)
});
```

**After:**
```typescript
const preflight = new PreFlightConfig();
preflight.on('success', (result) => console.log(result));
preflight.on('error', (error) => console.error(error));
```

### Manual Batching → Automatic Batching

**Before:**
```typescript
// Manual batch creation
const batchSize = 25;
for (let i = 0; i < keys.length; i += batchSize) {
  const batch = keys.slice(i, i + batchSize);
  await processKeys(batch);
}
```

**After:**
```typescript
// Automatic batching with 50 keys/100KB
await restoreKeys(keys); // Batching handled internally
```

### Manual Retries → Built-in Retries

**Before:**
```typescript
let result;
for (let attempt = 0; attempt < 3; attempt++) {
  try {
    result = await makeRequest();
    break;
  } catch (error) {
    if (attempt === 2) throw error;
  }
}
```

**After:**
```typescript
// Retries with exponential backoff handled automatically
const result = await makeRequest();
```

## Step-by-Step Migration Instructions

### Step 1: Update Dependencies
```bash
npm install @soroban-resurrect/sdk@1.0.0
```

### Step 2: Update Import Statements
Ensure you're using ESM imports:
```typescript
import { RestorationService } from '@soroban-resurrect/sdk';
```

### Step 3: Update Configuration Usage
Convert callback-based configuration to EventEmitter:
```typescript
// Find all uses of PreFlightConfig with callbacks
// Replace with EventEmitter pattern shown above
```

### Step 4: Remove Manual Batching Code
- Identify any manual batching logic in your application
- Remove it - the SDK handles batching internally
- Batch configuration is available through settings

### Step 5: Remove Manual Retry Logic
- Find any try/catch retry loops in your code
- Replace with direct calls to SDK methods
- Custom retry logic can be implemented via event listeners if needed

### Step 6: Handle Fee-Bump Transaction Errors
- Add error handling for `FeeBumpTransactionError`
- Guide users to provide non-fee-bump transactions

### Step 7: Test and Validate
- Run your test suite
- Verify all event listeners are functioning
- Test error scenarios

## Automated Codemods (jscodeshift)

Run the provided codemods to automate parts of the migration:

```bash
npx jscodeshift --transform codemods/preflight-config.js src/
npx jscodeshift --transform codemods/remove-manual-batching.js src/
npx jscodeshift --transform codemods/remove-manual-retry.js src/
```

### Codemod 1: PreFlightConfig Callbacks → EventEmitter
Automatically converts callback-based configuration to EventEmitter.

### Codemod 2: Remove Manual Batching
Removes manual batch creation loops.

### Codemod 3: Remove Manual Retry Logic
Removes try/catch retry patterns.

## Before/After Code Examples

### Example 1: Complete Restoration Service Integration

**Before (v0.1.0):**
```typescript
import { RestorationService, PreFlightConfig } from '@soroban-resurrect/sdk';

const preflight = new PreFlightConfig({
  onSuccess: (result) => {
    console.log('Preflight successful:', result);
  },
  onError: (error) => {
    console.error('Preflight failed:', error);
  }
});

const service = new RestorationService(preflight);

// Manual batching
const keys = getKeysToRestore();
const batchSize = 25;
for (let i = 0; i < keys.length; i += batchSize) {
  const batch = keys.slice(i, i + batchSize);
  
  // Manual retry logic
  let result;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      result = await service.restoreKeys(batch);
      break;
    } catch (error) {
      if (attempt === 2) throw error;
      await delay(Math.pow(2, attempt) * 1000);
    }
  }
  
  console.log('Restored batch:', result);
}
```

**After (v1.0.0):**
```typescript
import { RestorationService, PreFlightConfig } from '@soroban-resurrect/sdk';

const preflight = new PreFlightConfig();
preflight.on('success', (result) => {
  console.log('Preflight successful:', result);
});
preflight.on('error', (error) => {
  console.error('Preflight failed:', error);
});

const service = new RestorationService(preflight);

// Automatic batching and retry logic
const keys = getKeysToRestore();
const results = await service.restoreKeys(keys);
console.log('Restored keys:', results);
```

### Example 2: Event Handling

**Before (v0.1.0):**
```typescript
const preflight = new PreFlightConfig({
  onSuccess: (result) => handleSuccess(result),
  onError: (error) => handleError(error)
});
```

**After (v1.0.0):**
```typescript
const preflight = new PreFlightConfig();
preflight.on('success', handleSuccess);
preflight.on('error', handleError);
```

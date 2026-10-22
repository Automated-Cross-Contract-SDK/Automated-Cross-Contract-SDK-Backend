# @soroban-resurrect/compat

**⚠️ Migration Package - Will be removed in v2.0.0**

This package provides backwards compatibility for migrating from `@soroban-resurrect/sdk` v0.x to the modular v1.0 architecture.

## Purpose

When the SDK was split from a monolithic `@soroban-resurrect/sdk` package into modular packages (`@soroban-resurrect/core`, `@soroban-resurrect/footprint-parser`, etc.), this compat package was created to provide a smooth migration path.

## Usage

### Temporary Migration Aid

If you're migrating from v0.x and need time to update your imports:

```typescript
// Use this temporarily during migration
import { SorobanResurrect } from '@soroban-resurrect/compat'
```

### Permanent Migration Path

Update your imports to use the specific modular packages:

```typescript
// Instead of:
import { SorobanResurrect } from '@soroban-resurrect/compat'

// Use:
import { SorobanResurrect } from '@soroban-resurrect/core'

// Instead of:
import { extractKeysFromFootprint } from '@soroban-resurrect/compat'

// Use:
import { extractKeysFromFootprint } from '@soroban-resurrect/footprint-parser'
```

## Migration Guide

| Old Import (v0.x) | New Import (v1.0+) |
|------------------|-------------------|
| `@soroban-resurrect/sdk` | `@soroban-resurrect/core` |
| Core classes | `@soroban-resurrect/core` |
| Footprint parsing | `@soroban-resurrect/footprint-parser` |
| Error types | `@soroban-resurrect/errors` |
| Type definitions | `@soroban-resurrect/types` |
| RPC utilities | `@soroban-resurrect/rpc` |
| Helper utilities | `@soroban-resurrect/utils` |

## Deprecation Timeline

- **v0.1.0**: Compat package introduced
- **v1.0.0**: Compat package still available, emits deprecation warnings
- **v2.0.0**: Compat package removed

## Warnings

When you import from this package, you'll see a deprecation warning:

```
[DEPRECATION WARNING] @soroban-resurrect/compat is a migration aid and will be removed in v2.0.0. Please migrate to the modular packages (@soroban-resurrect/core, @soroban-resurrect/footprint-parser, etc.). This will be removed in v2.0.0.
```

## License

MIT

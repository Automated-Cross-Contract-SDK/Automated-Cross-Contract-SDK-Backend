# Codemods

This directory contains automated migration scripts (codemods) to help users upgrade between major versions of the SDK.

## Available Codemods

### migrate-to-modular.ts

Migrates imports from the monolithic `@soroban-resurrect/sdk` package to the new modular package structure.

**When to use**: When upgrading from v0.x to v1.0+

**What it does**:
- Replaces `@soroban-resurrect/sdk` imports with specific package imports
- Groups imports by their new package locations
- Preserves import aliases and type imports

**Usage**:
```bash
# Migrate a single file
npx tsx scripts/codemods/migrate-to-modular.ts src/myFile.ts

# Migrate a directory
npx tsx scripts/codemods/migrate-to-modular.ts src/

# Migrate the entire project
npx tsx scripts/codemods/migrate-to-modular.ts .
```

**Example transformation**:
```typescript
// Before
import { SorobanResurrect, extractKeysFromFootprint } from '@soroban-resurrect/sdk'

// After
import { SorobanResurrect } from '@soroban-resurrect/core'
import { extractKeysFromFootprint } from '@soroban-resurrect/footprint-parser'
```

## Manual Review Required

After running any codemod, you should:

1. **Review the changes** - Codemods handle common patterns but may miss edge cases
2. **Run your build** - Ensure TypeScript compiles without errors
3. **Run your tests** - Verify functionality is preserved
4. **Check for commented-out code** - Some complex patterns may be commented for manual review

## Limitations

Codemods cannot automatically handle:
- Dynamic imports
- Imports in template strings
- Import statements in comments
- Very complex import patterns
- Runtime package resolution

These cases will require manual intervention.

## Contributing

When adding new deprecations or breaking changes, consider adding a codemod to help users migrate:

1. Create a new script in this directory
2. Add documentation to this README
3. Test the codemod on sample code
4. Update the migration guide in CONTRIBUTING.md

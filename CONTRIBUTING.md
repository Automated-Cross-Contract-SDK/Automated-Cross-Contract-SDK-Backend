# Contributing

Project roles, the decision-making process, RFCs, the contribution ladder, and
conflict resolution are described in [`GOVERNANCE.md`](./GOVERNANCE.md).

## Development Setup

```bash
git clone <repo>
npm install
npm run build
npm run test
```

## Pull Request Process

1. Create a feature branch from `main`
2. Make your changes with clear commit messages
3. Run `npm run build && npm run test` to verify
4. Open a PR with a description of changes
5. Ensure CI passes before merge

## Code Style

- TypeScript strict mode
- No commented code
- Tests for all new functionality
- Follow existing patterns in the codebase

## API Deprecation Policy

This project follows a formal deprecation policy to ensure smooth transitions when APIs change.

### Deprecation Process

When an API needs to be deprecated:

1. **Add JSDoc @deprecated tag** with migration instructions
2. **Add runtime deprecation warning** using the `deprecate()` utility from `@soroban-resurrect/utils`
3. **Maintain backwards compatibility** for one major version
4. **Update documentation** with migration examples
5. **Create codemod** if the change requires code modifications

### Deprecation Timeline

- **Current version (v0.x)**: API marked as deprecated but still functional
- **Next major version (v1.0)**: Deprecated APIs removed, compatibility layer available
- **Following major version (v2.0)**: Compatibility layer removed

### Example

```typescript
/**
 * @deprecated Use `simulate()` instead. This method will be removed in v1.0.0.
 * @example
 * // Before
 * const result = await client.checkTransaction(txXDR, source)
 * // After
 * const result = await client.simulate(txXDR, source)
 */
async checkTransaction(txXDR: string, source?: string): Promise<SimulationCheckResult> {
  deprecate('checkTransaction() is deprecated. Use simulate() instead', 'v1.0.0')
  return this.simulate(txXDR, source)
}
```

### Migration Guide

When users need to migrate between versions:

1. **Check deprecation warnings** in console output
2. **Review JSDoc comments** for migration instructions
3. **Run available codemods** from `scripts/codemods/`
4. **Update imports** to use new package structure
5. **Test thoroughly** after migration

### Compatibility Packages

For major breaking changes, a compatibility package may be provided:

- `@soroban-resurrect/compat` - Migration aid for v0.x → v1.0 transition
- Emits deprecation warnings when used
- Will be removed in v2.0.0

### Adding New Deprecations

When adding a new deprecation:

1. Follow the deprecation process above
2. Update the migration guide in this file
3. Consider creating a codemod for automated migration
4. Add an entry to the CHANGELOG
5. Update version negotiation if needed

## Versioning

This project follows Semantic Versioning (SemVer):

- **Major version**: Breaking changes
- **Minor version**: New features, backwards compatible
- **Patch version**: Bug fixes, backwards compatible

### When to Bump Major Version

- Remove deprecated APIs
- Breaking changes to public APIs
- Major architectural changes
- Significant changes to configuration options

### When to Bump Minor Version

- Add new features
- Add new exports (non-breaking)
- Improve documentation
- Add new optional configuration options

### When to Bump Patch Version

- Bug fixes
- Performance improvements
- Typing fixes
- Documentation corrections

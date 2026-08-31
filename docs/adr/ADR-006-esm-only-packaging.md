# ADR-006: ESM-Only Packaging Decision

## Status
Accepted

## Context
Modern JavaScript packages need to choose between CommonJS (CJS), ES Modules (ESM), or dual-format support. This affects how the SDK can be consumed.

## Decision
The SDK will be published as ESM-only modules with TypeScript source.

## Rationale
1. **Future-Proof**: ESM is the standardized module system for JavaScript
2. **Simpler Build**: No dual-build complexity or conditional imports
3. **Smaller Package**: Eliminates duplicate code from dual-format support
4. **Better Tree-Shaking**: ESM enables more effective tree-shaking in bundlers
5. **Developer Experience**: Aligns with modern tooling and frameworks
6. **Ecosystem Trend**: JavaScript ecosystem is moving to ESM-first

## Consequences
- Positive: Simpler maintenance, better performance, future compatibility
- Negative: Excludes Node.js older than v12, requires `"type": "module"` in package.json
- Mitigation: Clear documentation about Node.js version requirements

## Alternatives Considered
1. CommonJS only - rejected as outdated approach
2. Dual ESM/CJS - rejected for complexity and maintenance burden
3. UMD for browser - rejected in favor of bundler-based distribution

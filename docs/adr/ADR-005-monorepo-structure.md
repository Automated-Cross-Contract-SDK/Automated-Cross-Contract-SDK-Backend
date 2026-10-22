# ADR-005: Monorepo Structure with npm Workspaces

## Status
Accepted

## Context
The Automated Cross-Contract SDK consists of multiple packages that share common code and dependencies. We needed to choose a monorepo structure approach.

## Decision
Use npm workspaces for monorepo structure, keeping all packages in a single git repository.

## Rationale
1. **Dependency Management**: npm workspaces handles shared dependencies efficiently
2. **Atomic Commits**: Related changes across packages can be committed together
3. **Code Reuse**: Shared utilities and types can be imported directly
4. **Simplified Development**: Single clone, single install for all development
5. **Tool Support**: npm workspaces is built-in to npm (no external tools needed)
6. **Gradual Splitting**: Can migrate to separate repos later if needed

## Consequences
- Positive: Simplified dependency management, easier cross-package development
- Negative: Repository size grows with all packages
- Mitigation: Clear package boundaries and documentation

## Alternatives Considered
1. Lerna - rejected for unnecessary complexity
2. Yarn workspaces - rejected for npm workspaces availability
3. Separate repositories - rejected for complexity in managing shared code

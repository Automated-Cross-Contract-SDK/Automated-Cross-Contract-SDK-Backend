# ADR-001: Why Reject Fee-Bump Transactions (for now)

## Status
Accepted

## Context
Fee-bump transactions are a Stellar feature that allows increasing the fee for an existing transaction. During the initial implementation of the restoration service, we encountered decisions about whether to support fee-bump transactions.

## Decision
We will reject fee-bump transactions in the restoration service for the current version.

## Rationale
1. **Complexity**: Handling fee-bump transactions adds significant complexity to the transaction simulation and restoration logic
2. **Limited Use Case**: Most users don't utilize fee-bump transactions in their workflows
3. **Future Consideration**: This can be revisited in a future release with proper support infrastructure
4. **Maintainability**: Reducing scope ensures the current implementation is stable and maintainable

## Consequences
- Positive: Simplified implementation, easier to test and maintain
- Negative: Users cannot use fee-bump transactions with the restoration service
- Mitigation: Clear error messaging when fee-bump transactions are detected

## Alternatives Considered
1. Support fee-bump transactions fully - rejected due to complexity
2. Partial support with limitations - rejected for clarity and simplicity

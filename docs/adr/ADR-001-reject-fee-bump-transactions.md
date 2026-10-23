# ADR-001: Why Reject Fee-Bump Transactions (for now)

## Status
Accepted

## Context
Fee-bump transactions are a Stellar feature that allows increasing the fee for an existing transaction. During the initial implementation of the restoration service, we encountered decisions about whether to support fee-bump transactions.

A related question arises when a wallet returns a *signed envelope* to the restoration service: the wallet may return either a plain `TransactionEnvelope` or a `FeeBumpTransactionEnvelope` that wraps the inner transaction and raises its fee. This ADR defines the supported behavior for both cases so that callers and wallets share a single, predictable contract.

## Decision
We will reject fee-bump transactions in the restoration service for the current version.

Specifically, when a wallet returns a signed envelope:

1. **Plain signed envelope (`TransactionEnvelope`)** — accepted and processed as today. This is the supported path.
2. **Fee-bumped signed envelope (`FeeBumpTransactionEnvelope`)** — rejected with a clear, typed error. The service does not unwrap, simulate, or submit the inner transaction.
3. **Ambiguous or malformed envelope** — rejected with the same typed error path; the service never guesses at the intended envelope type.

Rejection is deterministic and happens before any simulation or submission work, so no partial state is created for a rejected envelope.

## Rationale
1. **Complexity**: Handling fee-bump transactions adds significant complexity to the transaction simulation and restoration logic
2. **Limited Use Case**: Most users don't utilize fee-bump transactions in their workflows
3. **Future Consideration**: This can be revisited in a future release with proper support infrastructure
4. **Maintainability**: Reducing scope ensures the current implementation is stable and maintainable
5. **Predictability**: A single, documented contract for signed envelopes avoids silent divergence between wallets and the service

## Consequences
- Positive: Simplified implementation, easier to test and maintain
- Positive: Wallets and callers have an explicit, documented contract for signed envelopes
- Negative: Users cannot use fee-bump transactions with the restoration service
- Mitigation: Clear error messaging when fee-bump transactions are detected

## Compatibility
- No public API changes: the accepted envelope type is unchanged and the rejection path uses the existing error surface.
- Wallets that currently return fee-bumped envelopes must be configured to return a plain signed envelope instead.

## Alternatives Considered
1. Support fee-bump transactions fully - rejected due to complexity
2. Partial support with limitations - rejected for clarity and simplicity
3. Silently unwrap the inner transaction from a fee-bumped envelope - rejected because it hides fee changes from the caller and breaks the documented contract

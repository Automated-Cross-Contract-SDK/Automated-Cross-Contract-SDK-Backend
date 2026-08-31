# ADR-003: Retry Strategy (3 Attempts, Exponential Backoff)

## Status
Accepted

## Context
Network requests in the restoration service can fail due to temporary issues like rate limiting or transient server errors. We needed a robust retry strategy.

## Decision
Implement a retry strategy with 3 maximum attempts and exponential backoff (1s, 2s, 4s).

## Rationale
1. **Failure Recovery**: 3 attempts handles most transient failures
2. **Backoff Strategy**: Exponential backoff prevents overwhelming the server during issues
3. **User Experience**: Balances reliability against total wait time (max ~7 seconds)
4. **Industry Standard**: Aligns with common practices in distributed systems
5. **RPC Compliance**: Respects rate limiting signals from Soroban RPC

## Consequences
- Positive: Increased reliability, handles transient failures gracefully
- Negative: Failed requests have latency cost
- Mitigation: Clear error messages distinguish transient from permanent failures

## Alternatives Considered
1. No retries - rejected for poor reliability
2. Infinite retries with backoff - rejected for unbounded latency
3. Fixed delay retries - rejected for inefficient backoff strategy
4. Circuit breaker pattern - deferred for future enhancement

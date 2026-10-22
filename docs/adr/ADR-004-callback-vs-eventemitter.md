# ADR-004: Callback vs EventEmitter for PreFlightConfig

## Status
Accepted

## Context
The PreFlightConfig needs a way to communicate preflight results back to callers. We needed to choose between callbacks and EventEmitter patterns.

## Decision
Use EventEmitter pattern for PreFlightConfig communication.

## Rationale
1. **Multiple Listeners**: EventEmitter allows multiple listeners for the same event
2. **Loose Coupling**: Decouples configuration from specific handlers
3. **Standard Pattern**: Aligns with Node.js conventions and user expectations
4. **Flexibility**: Easy to add new event types without API changes
5. **Error Handling**: EventEmitter provides built-in error event handling

## Consequences
- Positive: Flexible, extensible, follows Node.js conventions
- Negative: Slightly more verbose than simple callbacks for single-listener use cases
- Mitigation: Provide examples and documentation for common patterns

## Alternatives Considered
1. Simple callbacks - rejected for limited extensibility
2. Promises/async-await - rejected for event-driven nature of results
3. RxJS Observables - rejected for additional dependency

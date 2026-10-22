# Proposal: <Title>

- **Issue:** #<number>
- **Status:** Draft | Accepted | Rejected | Implemented
- **Author:** <name / handle>
- **Created:** <YYYY-MM-DD>
- **Last updated:** <YYYY-MM-DD>

## Summary

One or two paragraphs describing the proposal and the problem it addresses.

## Motivation

Why is this change needed? What is the current behavior, and what pain does it
cause for users or maintainers? Link to related issues, discussions, or reports.

## Goals

- <goal>
- <goal>

## Non-goals

- <explicitly out of scope>
- <explicitly out of scope>

## Proposed behavior

Describe the supported behavior in detail. Include the public API surface
(types, functions, configuration keys) and how it interacts with existing
features. Keep modular boundaries and public API compatibility in view.

### Configuration

List any new configuration options, defaults, and compatibility constraints.

### Failure and edge cases

Enumerate the important failure modes and edge cases, and define the expected
behavior for each. Examples:

- What happens when a required provider is missing?
- What happens when the same service is resolved from multiple contexts?
- Are duplicate instances possible, and if so, under what conditions?
- How are errors surfaced to the caller?

## Alternatives considered

- <alternative> — why it was rejected
- <alternative> — why it was rejected

## API changes

Document any intentional API changes, including breaking changes and the
migration path for existing users. If there are none, state that explicitly.

## Testing plan

- Focused automated coverage for the expected behavior.
- Coverage for important failure and edge paths.
- Verification that affected workspace tests and type checks pass.

## Documentation plan

- User-facing documentation updates for new behavior, configuration, or
  compatibility constraints.
- Troubleshooting notes for the documented failure modes.

## Open questions

- <question>
- <question>

## Decision

Record the outcome (accepted / rejected / deferred) and the rationale once the
proposal has been reviewed.

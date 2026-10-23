# Contributing

Thanks for your interest in improving this project. This document describes how to
set up a development environment, run the workspace checks, and add tests.

## Getting started

1. Install dependencies for the workspace (see the package manager used by the
   repository).
2. Run the workspace type checks and tests before opening a pull request.

## Workspace checks

Before submitting a change, make sure the affected workspace packages pass their
tests and type checks. Document any intentional API changes in the pull request
description.

## Framework binding conformance suite

Framework bindings (for example, the React, Vue, and Svelte integrations) share a
common set of behavioral expectations. To keep these bindings consistent, the
repository provides a **shared conformance suite** that each binding runs against
its own adapter.

### What the suite covers

The conformance suite defines the supported binding behavior and its important
failure and edge cases, including:

- Initialization and teardown of the binding lifecycle.
- Propagation of state updates from the core to the framework layer.
- Handling of progress and error states surfaced by the core.
- Cleanup of subscriptions and listeners on unmount/dispose.
- Behavior when the underlying core reports an error or is disposed early.

### Running the suite

Each binding package wires the shared suite into its own test runner. Run the
binding package's tests as usual; the conformance cases are included in that
package's test run. A binding is considered conformant when all shared cases
pass alongside its package-specific tests.

### Adding a new binding

When adding a new framework binding:

1. Implement the binding against the shared public API.
2. Wire the shared conformance suite into the binding's test setup.
3. Ensure all conformance cases pass before considering the binding complete.

### Compatibility constraints

The conformance suite is additive and does not change the public API. Bindings
must continue to honor the existing public API surface; the suite exists to
verify that behavior rather than to introduce new requirements. If a binding
cannot satisfy a conformance case, document the deviation and the reason in the
pull request.

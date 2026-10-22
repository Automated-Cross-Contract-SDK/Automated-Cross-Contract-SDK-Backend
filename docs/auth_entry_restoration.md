# Soroban Authorization Entry Restoration Guide

Documents the process of restoring revoked or expired Soroban authorization entries.

## React Native / Hermes support

The React Native crypto and authorization-entry restoration paths are supported on
the Hermes JavaScript engine. Hermes is the default engine for React Native and
is exercised by the dedicated Hermes test project so that crypto primitives and
restoration flows are validated on the same runtime used in production apps.

### Configuration

- No additional configuration is required to use the crypto and restoration
  modules on Hermes; the public API is unchanged.
- The Hermes test project runs the React Native crypto and restoration suites
  against the Hermes runtime. Run it with the workspace test command targeting
  the Hermes project (for example `yarn test --project hermes`).

### Compatibility constraints

- Hermes does not provide the full Node.js `crypto` module. The React Native
  crypto layer relies on the platform-provided primitives (via the React Native
  crypto polyfill) rather than Node built-ins.
- If a required crypto primitive is missing or invalid on the runtime, the
  crypto and restoration calls reject with an explicit error instead of
  silently producing incorrect results. Callers should handle these rejections
  when restoring authorization entries.
- Restoration of auth entries requires valid, non-expired entries; expired or
  revoked entries surface an error that callers must handle.

### API changes

None. This documents existing behavior and the Hermes compatibility surface; the
public API remains backward compatible.

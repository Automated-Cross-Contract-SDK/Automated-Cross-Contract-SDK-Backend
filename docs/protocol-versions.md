# Supported Soroban Protocol Versions

The SDK negotiates the RPC node's protocol version during initialization and
checks it against the bounds below. The values are defined in
`packages/sdk/src/version-negotiator.ts`.

| Constant                 | Value | Meaning                                              |
| ------------------------ | ----- | ---------------------------------------------------- |
| `MIN_SUPPORTED_PROTOCOL` | 20    | Lowest protocol version the SDK accepts by default.  |
| `MAX_SUPPORTED_PROTOCOL` | 22    | Highest protocol version the SDK has been tested on. |

## Behavior at the bounds

- **Below the minimum.** Negotiation throws an error with code
  `UNSUPPORTED_PROTOCOL`. The message names the detected version and the
  minimum that applies.
- **Above the maximum.** Negotiation succeeds and logs a warning. The node is
  newer than the tested range, so behavior may vary.
- **Inside the range.** Every version from 20 to 22 has an entry in
  `PROTOCOL_COMPATIBILITY_MATRIX` with its XDR variant, so the SDK can pick
  encoding hints for it.

## Per-network minimum

`MIN_PROTOCOL_PER_NETWORK` lets a network raise its own minimum. For example, a
testnet that requires protocol 21 can be configured with
`{ [networkId]: 21 }`. The per-network value replaces the global
`MIN_SUPPORTED_PROTOCOL` for that network only. It does not change the maximum.

## Compatibility matrix

| Protocol | XDR variant | Supported | Notes                          |
| -------- | ----------- | --------- | ------------------------------ |
| 20       | v20         | yes       | Initial Soroban release        |
| 21       | v21         | yes       | Contract auth improvements     |
| 22       | v22         | yes       | Current mainnet protocol       |

## Framework binding conformance

Framework bindings (React, Vue, Svelte, and any future adapter) share a single
conformance suite so that every binding exposes the same observable behavior.
The suite lives at `packages/sdk/tests/framework-binding-conformance.test.ts`
and is parameterized by a binding factory, so a new binding is covered by
registering it with the suite rather than writing a bespoke test file.

### Supported behavior

A conforming binding must:

- Expose the negotiated protocol version and the compatibility matrix entry for
  it through its public surface, matching `version-negotiator.ts`.
- Surface `UNSUPPORTED_PROTOCOL` errors from negotiation unchanged, including
  the detected version and the applicable minimum in the message.
- Emit a warning (not an error) when the node is above
  `MAX_SUPPORTED_PROTOCOL`, and continue to operate.
- Honor `MIN_PROTOCOL_PER_NETWORK` overrides for the active network only.

### Failure and edge cases

The suite asserts the following paths:

- Negotiation below the global minimum throws `UNSUPPORTED_PROTOCOL`.
- Negotiation below a per-network minimum throws `UNSUPPORTED_PROTOCOL` even
  when the version is at or above the global minimum.
- A per-network override for one network does not affect another network.
- A version above the maximum resolves successfully and records a warning.
- Every version in the supported range has a matrix entry with an XDR variant.

### Compatibility constraints

- The suite is additive: it does not change the public API of any binding.
- Bindings that cannot satisfy a case must document the deviation here before
  the suite is extended to require it.
- When `MIN_SUPPORTED_PROTOCOL`, `MAX_SUPPORTED_PROTOCOL`, or the matrix
  changes, update this section and the conformance suite in the same change.

## Keeping this document current

When `MIN_SUPPORTED_PROTOCOL` or `MAX_SUPPORTED_PROTOCOL` changes, update the
table above and the matrix in the same change. The test at
`packages/sdk/tests/protocol-version-bounds.test.ts` fails when the document
and the constants disagree.

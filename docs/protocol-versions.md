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

## Keeping this document current

When `MIN_SUPPORTED_PROTOCOL` or `MAX_SUPPORTED_PROTOCOL` changes, update the
table above and the matrix in the same change. The test at
`packages/sdk/tests/protocol-version-bounds.test.ts` fails when the document
and the constants disagree.

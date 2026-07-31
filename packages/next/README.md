# @soroban-resurrect/next

Server-compatible utilities for `@soroban-resurrect/sdk` — usable from Next.js
Server Components and Server Actions, where `window` is not defined.

## "use client" boundaries

- Everything exported from this package (`checkAndPrepare`, the
  `SerializableSimulationResult` type, and `examples/server-action.ts`) is
  **server-only**. Do not add a `"use client"` directive to any module that
  imports from `@soroban-resurrect/next`.
- The client only ever receives the plain-JSON `SerializableSimulationResult`
  returned by a Server Action — never the raw `SorobanResurrect` instance or
  `xdr.LedgerKey` objects, which are not serializable across the RSC
  boundary.
- Signing must still happen client-side. The typical flow is:
  1. Client calls a Server Action that runs `checkAndPrepare` (server-only).
  2. Server Action returns a `SerializableSimulationResult` (plain JSON).
  3. A `"use client"` component reads that result, prompts the wallet to
     sign, and submits the restore/execute transaction.

See `examples/server-action.ts` for a full orchestration example.

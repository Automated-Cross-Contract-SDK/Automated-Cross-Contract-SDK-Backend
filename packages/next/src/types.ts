/**
 * Plain-JSON serializable form of `SimulationCheckResult` (from
 * `@soroban-resurrect/sdk`), safe to return from a Next.js Server Action or
 * Server Component and pass across the client/server boundary.
 *
 * `xdr.LedgerKey` values are not structured-cloneable, so archived keys are
 * flattened to their base64-encoded XDR representation.
 */
export interface SerializableSimulationResult {
  needsRestoration: boolean
  totalKeysInFootprint: number
  archivedKeys: Array<{
    keyBase64: string
    keyType: 'contractInstance' | 'contractData' | 'contractCode' | 'ttlEntry' | 'unknown'
    sacKeyType?: string
    contractId?: string
    restorePriority: number
  }>
  /** Unsigned restoration transaction envelope XDR, if one was built server-side. */
  restoreTransactionXDR?: string
}

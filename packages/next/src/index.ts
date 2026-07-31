import { SorobanResurrect } from '@soroban-resurrect/sdk'
import type { SorobanResurrectConfig } from '@soroban-resurrect/sdk'
import type { SerializableSimulationResult } from './types.js'

export type { SerializableSimulationResult } from './types.js'

/**
 * Server-context equivalent of the `useSorobanResurrect().checkTransaction`
 * flow: simulates a transaction, detects archived ledger entries, and
 * (optionally) builds the restore transaction — all without touching
 * `window`, so it can run inside a Next.js Server Component or Server Action.
 */
export async function checkAndPrepare(
  config: SorobanResurrectConfig,
  txXDR: string,
  sourceAccountID: string,
): Promise<SerializableSimulationResult> {
  const resurrect = new SorobanResurrect(config)
  const { simulationResult, restoreTransactionXDR } = await resurrect.checkAndPrepare(
    txXDR,
    sourceAccountID,
  )

  return {
    needsRestoration: simulationResult.needsRestoration,
    totalKeysInFootprint: simulationResult.totalKeysInFootprint,
    archivedKeys: simulationResult.archivedKeys.map((k) => ({
      keyBase64: k.keyBase64,
      keyType: k.keyType,
      sacKeyType: k.sacKeyType,
      contractId: k.contractId,
      restorePriority: k.restorePriority,
    })),
    restoreTransactionXDR,
  }
}

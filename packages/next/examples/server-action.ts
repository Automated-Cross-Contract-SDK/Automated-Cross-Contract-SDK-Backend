'use server'

import { checkAndPrepare } from '@soroban-resurrect/next'
import type { SerializableSimulationResult } from '@soroban-resurrect/next'

/**
 * Example Server Action showing the restoration orchestration flow for a
 * Next.js App Router app.
 *
 * IMPORTANT: this file is server-only ('use server'). The client component
 * that calls it must NOT import anything else from '@soroban-resurrect/next'
 * directly — only the SerializableSimulationResult returned here crosses the
 * client/server boundary.
 */
export async function prepareTransaction(
  txXDR: string,
  sourceAccountID: string,
): Promise<SerializableSimulationResult> {
  return checkAndPrepare(
    {
      rpcUrl: process.env.SOROBAN_RPC_URL!,
      networkPassphrase: process.env.SOROBAN_NETWORK_PASSPHRASE!,
    },
    txXDR,
    sourceAccountID,
  )
}

/*
 * Client-side usage ("use client" component):
 *
 *   import { prepareTransaction } from './server-action'
 *
 *   const result = await prepareTransaction(txXDR, sourceAccountID)
 *   if (result.needsRestoration && result.restoreTransactionXDR) {
 *     const signedRestoreXDR = await wallet.sign(result.restoreTransactionXDR)
 *     // submit signedRestoreXDR, then resubmit the original transaction
 *   }
 */

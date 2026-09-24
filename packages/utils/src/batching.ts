import type { ArchivedKey, ContractKeyGroup } from '@soroban-resurrect/types'
import type { BatchingOptions } from './types.js'

/**
 * Groups archived keys by contract ID to enable parallel restoration
 * across independent contracts.
 */
export function batchKeysByContract(keys: ArchivedKey[]): ContractKeyGroup[] {
  const groups = new Map<string, ArchivedKey[]>()
  
  for (const key of keys) {
    const contractId = key.contractId || '__unknown__'
    if (!groups.has(contractId)) {
      groups.set(contractId, [])
    }
    groups.get(contractId)!.push(key)
  }
  
  return Array.from(groups.entries()).map(([contractId, keys]) => ({
    contractId,
    keys,
  }))
}

/**
 * Groups keys by their restore priority to ensure proper restoration order.
 * Keys with lower priority values are restored first.
 */
export function groupKeysByPriority(keys: ArchivedKey[]): Map<number, ArchivedKey[]> {
  const groups = new Map<number, ArchivedKey[]>()
  
  for (const key of keys) {
    const priority = key.restorePriority
    if (!groups.has(priority)) {
      groups.set(priority, [])
    }
    groups.get(priority)!.push(key)
  }
  
  return groups
}

/**
 * Splits keys into batches of maximum size while preserving priority order.
 */
export function createBatches(keys: ArchivedKey[], options: BatchingOptions = {}): ArchivedKey[][] {
  const maxBatchSize = options.maxBatchSize || 50
  const batches: ArchivedKey[][] = []
  
  // Sort by priority first
  const sortedKeys = [...keys].sort((a, b) => a.restorePriority - b.restorePriority)
  
  for (let i = 0; i < sortedKeys.length; i += maxBatchSize) {
    batches.push(sortedKeys.slice(i, i + maxBatchSize))
  }
  
  return batches
}

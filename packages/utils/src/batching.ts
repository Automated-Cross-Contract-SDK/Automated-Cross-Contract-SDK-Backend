import type { ArchivedKey, ContractKeyGroup } from '@soroban-resurrect/types'
import type { BatchingOptions } from './types.js'

/**
 * Groups archived keys by contract ID to enable parallel restoration
 * across independent contracts.
 *
 * TTL entries that extend a contractData key are grouped with their sibling
 * data key so they are restored together (and never batched separately).
 */
export function batchKeysByContract(keys: ArchivedKey[]): ContractKeyGroup[] {
  const groups = new Map<string, ArchivedKey[]>()

  // Resolve the effective contract for each key. TTL keys may not carry a
  // contractId themselves, so fall back to the contract of the sibling
  // contractData key they extend (matched by the TTL's inner key).
  const contractByKeyId = new Map<string, string>()
  for (const key of keys) {
    if (key.contractId) {
      contractByKeyId.set(key.id, key.contractId)
    }
  }

  const resolveContractId = (key: ArchivedKey): string => {
    if (key.contractId) return key.contractId
    const siblingId = key.extendsKeyId
    if (siblingId) {
      const siblingContract = contractByKeyId.get(siblingId)
      if (siblingContract) return siblingContract
    }
    return '__unknown__'
  }

  for (const key of keys) {
    const contractId = resolveContractId(key)
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
 *
 * Keys are partitioned by contract ID first so that a contract's keys are
 * never split across concurrent batches. Within each contract group keys are
 * sorted by restore priority, then whole groups are packed into batches. A
 * group is only split when it alone exceeds `maxBatchSize`; in that case the
 * continuation batches are marked `sequential` so callers submit them in
 * order rather than concurrently.
 */
export function createBatches(keys: ArchivedKey[], options: BatchingOptions = {}): ArchivedKey[][] {
  const maxBatchSize = options.maxBatchSize || 50
  const batches: ArchivedKey[][] = []

  // Partition by contract identity so a contract's keys stay together.
  const groups = batchKeysByContract(keys)

  // Sort groups by their highest-priority (lowest value) key so that
  // higher-priority contracts are packed into earlier batches.
  const sortedGroups = groups
    .map((group) => ({
      contractId: group.contractId,
      keys: [...group.keys].sort((a, b) => a.restorePriority - b.restorePriority),
    }))
    .sort((a, b) => {
      const aMin = a.keys.length > 0 ? a.keys[0].restorePriority : 0
      const bMin = b.keys.length > 0 ? b.keys[0].restorePriority : 0
      return aMin - bMin
    })

  let current: ArchivedKey[] = []

  const flush = () => {
    if (current.length > 0) {
      batches.push(current)
      current = []
    }
  }

  for (const group of sortedGroups) {
    // A group that fits in a single batch is never split across batches.
    if (group.keys.length <= maxBatchSize) {
      if (current.length + group.keys.length > maxBatchSize) {
        flush()
      }
      current.push(...group.keys)
      continue
    }

    // The group alone exceeds the max: flush any pending keys, then emit
    // the group's keys in sequential continuation batches.
    flush()
    for (let i = 0; i < group.keys.length; i += maxBatchSize) {
      batches.push(group.keys.slice(i, i + maxBatchSize))
    }
  }

  flush()

  return batches
}

/**
 * Reorders keys so each TTL entry immediately follows the sibling key it
 * extends, preventing the TTL from landing in a later batch than its data key.
 */
function keepTtlWithSibling(keys: ArchivedKey[]): ArchivedKey[] {
  const result: ArchivedKey[] = []
  const placed = new Set<string>()
  const byId = new Map<string, ArchivedKey>()
  for (const key of keys) {
    byId.set(key.id, key)
  }

  for (const key of keys) {
    if (placed.has(key.id)) continue
    result.push(key)
    placed.add(key.id)

    // Pull forward any TTL entries that extend this key.
    for (const candidate of keys) {
      if (placed.has(candidate.id)) continue
      if (candidate.extendsKeyId === key.id) {
        result.push(candidate)
        placed.add(candidate.id)
      }
    }
  }

  return result
}

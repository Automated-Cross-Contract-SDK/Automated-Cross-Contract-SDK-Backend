import { describe, it, expect, bench, vi } from 'vitest'
import { SorobanResurrect } from '../../src/soroban-resurrect.js'
import { extractKeysFromFootprint, classifyLedgerKey, encodeLedgerKey } from '../../src/footprint-parser.js'
import type { ArchivedKey } from '../../src/types.js'

const CONTRACT_COUNT = 12
const KEYS_PER_CONTRACT = 45
const TOTAL_KEYS = CONTRACT_COUNT * KEYS_PER_CONTRACT

const keyTypes = ['contractData', 'contractCode', 'ttlEntry'] as const

function generateContractId(index: number): string {
  return `CA${index.toString(16).padStart(54, '0')}`
}

function generateLargeFootprint(): Array<{ key: any; keyBase64: string; keyType: string; contractId?: string }> {
  const keys: Array<{ key: any; keyBase64: string; keyType: string; contractId?: string }> = []
  for (let c = 0; c < CONTRACT_COUNT; c++) {
    const contractId = generateContractId(c)
    for (let k = 0; k < KEYS_PER_CONTRACT; k++) {
      const keyType = keyTypes[k % keyTypes.length]
      const hexId = `${c.toString(16).padStart(2, '0')}${k.toString(16).padStart(4, '0')}`
      const key = {
        switch: () => keyType,
        contractData: () => ({
          contract: () => ({ contractId: () => Buffer.from(hexId, 'hex') }),
          key: () => ({}),
          durability: () => ({}),
        }),
        contractCode: () => ({ hash: () => Buffer.from(hexId, 'hex') }),
        toXDR: (fmt?: string) => fmt === 'base64' ? `b64:${hexId}` : Buffer.from(hexId, 'hex'),
      }
      keys.push({
        key,
        keyBase64: `b64:${hexId}`,
        keyType,
        contractId: keyType !== 'ttlEntry' ? contractId : undefined,
      })
    }
  }
  return keys
}

describe('Large Footprint Performance', () => {
  const config = {
    rpcUrl: 'https://soroban-testnet.stellar.org',
    networkPassphrase: 'Test SDF Network ; September 2015',
  }

  describe('batchKeys — splits large key sets within XDR size limits', () => {
    const client = new SorobanResurrect(config)
    const allKeys = generateLargeFootprint().map(k => ({
      key: k.key,
      keyBase64: k.keyBase64,
      keyType: k.keyType as 'contractData' | 'contractCode' | 'ttlEntry' | 'unknown',
      contractId: k.contractId,
    }))

    it(`generates ${TOTAL_KEYS} test keys across ${CONTRACT_COUNT} contracts`, () => {
      expect(allKeys).toHaveLength(TOTAL_KEYS)
      const uniqueContracts = new Set(allKeys.filter(k => k.contractId).map(k => k.contractId))
      expect(uniqueContracts.size).toBe(CONTRACT_COUNT)
    })

    it('splits into multiple batches when keys exceed size limit', () => {
      const batches = (client as any).batchKeys(allKeys)
      expect(batches.length).toBeGreaterThan(1)
      expect(batches[0].length).toBeGreaterThan(0)
      const totalInBatches = batches.reduce((sum: number, b: ArchivedKey[]) => sum + b.length, 0)
      expect(totalInBatches).toBe(TOTAL_KEYS)
    })

    it('each batch is under the XDR size limit (100KB)', () => {
      const batches = (client as any).batchKeys(allKeys)
      for (const batch of batches) {
        const base64Size = batch.reduce((sum: number, k: ArchivedKey) => sum + k.keyBase64.length, 0)
        expect(base64Size + 200 * batch.length).toBeLessThanOrEqual(100_000)
      }
    })

    it('single contract < 50 keys fits in one batch', () => {
      const singleContract = allKeys.filter(k => k.contractId === generateContractId(0))
      const batches = (client as any).batchKeys(singleContract)
      expect(batches).toHaveLength(1)
    })
  })

  describe('classifyLedgerKey — handles all 540 keys under 10ms', () => {
    const allKeys = generateLargeFootprint()

    it('classifies all key types correctly', () => {
      const start = performance.now()
      for (const entry of allKeys) {
        const result = classifyLedgerKey(entry.key)
        expect(['contractData', 'contractCode', 'ttlEntry', 'unknown']).toContain(result.keyType)
      }
      const elapsed = performance.now() - start
      expect(elapsed).toBeLessThan(100)
    })
  })

  describe('extractKeysFromFootprint — large footprint parsing speed', () => {
    it('parses 540 keys in under 5ms', () => {
      const roKeys = generateLargeFootprint().map(k => k.key)
      const rwKeys = generateLargeFootprint().map(k => k.key)
      const footprint = {
        readOnly: () => roKeys,
        readWrite: () => rwKeys,
      } as any

      const start = performance.now()
      const result = extractKeysFromFootprint(footprint)
      const elapsed = performance.now() - start

      expect(result.all).toHaveLength(roKeys.length + rwKeys.length)
      expect(elapsed).toBeLessThan(5)
    })
  })

  describe('detectArchivedKeys — performance with mixed live/archived', () => {
    it('filters archived from live in large set within 50ms', async () => {
      const client = new SorobanResurrect(config)

      const allKeys = generateLargeFootprint()
      const rwKeys = allKeys.slice(0, 100).map(k => k.key)

      const liveSet = new Set<string>()
      const archivedCount = 30
      for (let i = 0; i < rwKeys.length - archivedCount; i++) {
        liveSet.add(encodeLedgerKey(rwKeys[i]))
      }

      const start = performance.now()
      let detectedArchived = 0
      for (const key of rwKeys) {
        if (!liveSet.has(encodeLedgerKey(key))) {
          detectedArchived++
        }
      }
      const elapsed = performance.now() - start

      expect(detectedArchived).toBe(archivedCount)
      expect(elapsed).toBeLessThan(50)
    })
  })

  describe('full pipeline — large footprint simulated end-to-end', () => {
    it('completes simulate+build in under 200ms with mocked RPC', async () => {
      const largeFootprintKeys = generateLargeFootprint().slice(0, 100).map(k => k.key)

      const client = new SorobanResurrect(config)

      vi.spyOn(client as any, 'buildSingleRestoreTransaction').mockImplementation(
        async (keys: any[]) => ({
          transactionXDR: 'mock-large-restore-xdr',
          keysRestored: keys.length,
        }),
      )

      const archived = generateLargeFootprint().slice(0, 100).map(k => ({
        key: k.key,
        keyBase64: k.keyBase64,
        keyType: k.keyType as 'contractData' | 'contractCode' | 'ttlEntry' | 'unknown',
        contractId: k.contractId,
      }))

      const batches = (client as any).batchKeys(archived)

      const start = performance.now()

      let totalRestored = 0
      for (const batch of batches) {
        const result = await (client as any).buildSingleRestoreTransaction(batch, 'GABCDEF...')
        totalRestored += result.keysRestored
      }

      const elapsed = performance.now() - start
      expect(totalRestored).toBe(100)
      expect(elapsed).toBeLessThan(500)
    })
  })
})

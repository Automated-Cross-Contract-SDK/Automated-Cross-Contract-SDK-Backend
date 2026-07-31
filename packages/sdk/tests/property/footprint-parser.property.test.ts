/**
 * Property-based tests (issue #75) verifying invariants of the footprint
 * parsing/classification helpers using fast-check.
 */
import { describe, it, expect, vi } from 'vitest'
import fc from 'fast-check'
import { classifyLedgerKey, classifySacKey, extractKeysFromFootprint } from '../../src/footprint-parser.js'
import { SorobanResurrectError } from '../../src/types.js'
import { xdr } from '@stellar/stellar-sdk'

// ---------------------------------------------------------------------------
// Mock stellar-sdk to keep property tests hermetic (mirrors tests/sac-contract-data.test.ts)
// ---------------------------------------------------------------------------

vi.mock('@stellar/stellar-sdk', () => {
  class MockScVal {
    constructor(private _typeValue: number, private _val?: unknown) {}
    switch() {
      return { value: this._typeValue, name: `type_${this._typeValue}` }
    }
    value() {
      return this._val
    }
  }

  const SCV_SYMBOL = 15
  const SCV_VEC = 16
  const SCV_LEDGER_KEY_NONCE = 21
  const SCV_LEDGER_KEY_CONTRACT_INSTANCE = 20

  const scvSymbol = (s: string) => new MockScVal(SCV_SYMBOL, Buffer.from(s))
  const scvVec = (items: MockScVal[]) => new MockScVal(SCV_VEC, items)
  const scvLedgerKeyContractInstance = () => new MockScVal(SCV_LEDGER_KEY_CONTRACT_INSTANCE)
  const scvLedgerKeyNonce = () => new MockScVal(SCV_LEDGER_KEY_NONCE, {})

  const makeLedgerKey = (entryType: string, overrides: Record<string, () => unknown> = {}) => ({
    switch: () => entryType,
    contractData: () => ({
      contract: () => ({ contractId: () => Buffer.from('cafebabe', 'hex') }),
      key: overrides.key ?? (() => scvLedgerKeyContractInstance()),
      durability: () => ({ value: 1 }),
    }),
    contractCode: () => ({ hash: () => Buffer.from('deadbeef', 'hex') }),
    ...overrides,
  })

  return {
    xdr: {
      LedgerEntryType: {
        contractData: () => 'contractData',
        contractCode: () => 'contractCode',
        ttl: () => 'ttl',
      },
      ScValType: {
        scvSymbol: () => ({ value: SCV_SYMBOL }),
        scvVec: () => ({ value: SCV_VEC }),
        scvLedgerKeyNonce: () => ({ value: SCV_LEDGER_KEY_NONCE }),
        scvLedgerKeyContractInstance: () => ({ value: SCV_LEDGER_KEY_CONTRACT_INSTANCE }),
      },
      ScVal: { scvSymbol, scvVec, scvLedgerKeyContractInstance, scvLedgerKeyNonce },
      _makeLedgerKey: makeLedgerKey,
      _scvSymbol: scvSymbol,
      _scvVec: scvVec,
    },
    SorobanRpc: { Server: vi.fn(), Api: {} },
    TransactionBuilder: { fromXDR: vi.fn() },
    Transaction: vi.fn(),
    Operation: { restoreFootprint: vi.fn() },
    Account: vi.fn(),
    BASE_FEE: '100',
    SorobanDataBuilder: vi.fn(),
  }
})

function makeContractDataKey(scVal: unknown): xdr.LedgerKey {
  return (xdr as any)._makeLedgerKey('contractData', { key: () => scVal }) as unknown as xdr.LedgerKey
}

// A minimal footprint stand-in; only readOnly()/readWrite() are exercised by
// extractKeysFromFootprint.
function makeFootprint(readOnly: unknown[], readWrite: unknown[]): xdr.LedgerFootprint {
  return {
    readOnly: () => readOnly,
    readWrite: () => readWrite,
  } as unknown as xdr.LedgerFootprint
}

describe('property: classifySacKey', () => {
  const KNOWN_SYMBOL_KEYS: Record<string, string> = {
    Admin: 'sacAdmin',
    Name: 'sacMetadata',
    Symbol: 'sacMetadata',
    Decimals: 'sacMetadata',
  }

  it('maps every known scvSymbol key to its documented sacKeyType', () => {
    fc.assert(
      fc.property(fc.constantFrom(...Object.keys(KNOWN_SYMBOL_KEYS)), (sym) => {
        const scVal = (xdr as any)._scvSymbol(sym)
        expect(classifySacKey(scVal)).toBe(KNOWN_SYMBOL_KEYS[sym])
      }),
    )
  })

  it('never returns a sacKeyType for arbitrary unknown symbol strings', () => {
    fc.assert(
      fc.property(
        fc.string().filter((s) => !(s in KNOWN_SYMBOL_KEYS)),
        (sym) => {
          const scVal = (xdr as any)._scvSymbol(sym)
          expect(classifySacKey(scVal)).toBeUndefined()
        },
      ),
    )
  })

  it('is a pure function: identical input always yields identical output', () => {
    fc.assert(
      fc.property(fc.string(), (sym) => {
        const a = classifySacKey((xdr as any)._scvSymbol(sym))
        const b = classifySacKey((xdr as any)._scvSymbol(sym))
        expect(a).toBe(b)
      }),
    )
  })
})

describe('property: classifyLedgerKey', () => {
  it('is deterministic/idempotent for any given key', () => {
    fc.assert(
      fc.property(fc.constantFrom('contractData', 'contractCode', 'ttl', 'account'), (entryType) => {
        const key = (xdr as any)._makeLedgerKey(entryType) as unknown as xdr.LedgerKey
        const first = classifyLedgerKey(key)
        const second = classifyLedgerKey(key)
        expect(second).toEqual(first)
      }),
    )
  })

  it('always assigns contractInstance entries restorePriority 0 and everything else > 0', () => {
    fc.assert(
      fc.property(fc.constantFrom('contractData', 'contractCode', 'ttl', 'account'), (entryType) => {
        const key = (xdr as any)._makeLedgerKey(entryType) as unknown as xdr.LedgerKey
        const { keyType, restorePriority } = classifyLedgerKey(key)
        if (keyType === 'contractInstance') {
          expect(restorePriority).toBe(0)
        } else {
          expect(restorePriority).toBeGreaterThan(0)
        }
      }),
    )
  })

  it('SAC keys built from arbitrary vec symbols only ever classify as balance/allowance/undefined', () => {
    fc.assert(
      fc.property(fc.constantFrom('Balance', 'Allowance', 'Other'), (sym) => {
        const vec = (xdr as any)._scvVec([(xdr as any)._scvSymbol(sym)])
        const key = makeContractDataKey(vec)
        const { sacKeyType } = classifyLedgerKey(key)
        if (sym === 'Balance') expect(sacKeyType).toBe('sacBalance')
        else if (sym === 'Allowance') expect(sacKeyType).toBe('sacAllowance')
        else expect(sacKeyType).toBeUndefined()
      }),
    )
  })
})

describe('property: extractKeysFromFootprint', () => {
  it('readOnly and readWrite are always disjoint and `all` is their concatenation', () => {
    fc.assert(
      fc.property(fc.nat({ max: 10 }), fc.nat({ max: 10 }), (roCount, rwCount) => {
        const readOnly = Array.from({ length: roCount }, (_, i) => ({ tag: `ro-${i}` }))
        const readWrite = Array.from({ length: rwCount }, (_, i) => ({ tag: `rw-${i}` }))
        const footprint = makeFootprint(readOnly, readWrite)

        const result = extractKeysFromFootprint(footprint)

        expect(result.readOnly).toHaveLength(roCount)
        expect(result.readWrite).toHaveLength(rwCount)
        expect(result.all).toHaveLength(roCount + rwCount)
        expect(result.all).toEqual([...result.readOnly, ...result.readWrite])

        const roSet = new Set(result.readOnly)
        const rwSet = new Set(result.readWrite)
        for (const key of roSet) expect(rwSet.has(key)).toBe(false)
      }),
    )
  })
})

describe('property: SorobanResurrectError codes are unique', () => {
  it('has no duplicate error codes across the documented union', () => {
    const codes = [
      'SIMULATION_FAILED',
      'RESTORE_FAILED',
      'ORIGINAL_TX_FAILED',
      'NO_ACCOUNT',
      'INVALID_XDR',
      'ARCHIVE_DETECTION_FAILED',
      'NETWORK_ERROR',
    ] as const

    expect(new Set(codes).size).toBe(codes.length)

    for (const code of codes) {
      const err = new SorobanResurrectError(`test ${code}`, code)
      expect(err.code).toBe(code)
      expect(err).toBeInstanceOf(Error)
    }
  })
})

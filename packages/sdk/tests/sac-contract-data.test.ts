/**
 * Tests for SAC (Stellar Asset Contract) key detection and classification.
 *
 * Covers issues #47 (SAC ContractData key support) and #48 (ContractInstance
 * handling with priority restoration).
 */
import { describe, it, expect, vi } from 'vitest'
import { classifyLedgerKey, classifySacKey } from '../src/footprint-parser.js'
import { xdr } from '@stellar/stellar-sdk'

// ---------------------------------------------------------------------------
// Mock stellar-sdk to keep tests hermetic
// ---------------------------------------------------------------------------

vi.mock('@stellar/stellar-sdk', () => {
  /**
   * Minimal ScVal-alike that carries a numeric type discriminant and an
   * optional value, mirroring the real XDR union.
   */
  class MockScVal {
    private _typeValue: number
    private _val: unknown

    constructor(typeValue: number, val?: unknown) {
      this._typeValue = typeValue
      this._val = val
    }

    switch() {
      return { value: this._typeValue, name: `type_${this._typeValue}` }
    }

    value() {
      return this._val
    }
  }

  // ScValType numeric constants (from actual stellar-sdk)
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
      durability: () => ({ value: 1 }), // persistent
    }),
    contractCode: () => ({
      hash: () => Buffer.from('deadbeef', 'hex'),
    }),
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
      ScVal: {
        scvSymbol,
        scvVec,
        scvLedgerKeyContractInstance,
        scvLedgerKeyNonce,
      },
      // Expose helpers for test construction
      _makeLedgerKey: makeLedgerKey,
      _scvSymbol: scvSymbol,
      _scvVec: scvVec,
      _scvLedgerKeyContractInstance: scvLedgerKeyContractInstance,
      _scvLedgerKeyNonce: scvLedgerKeyNonce,
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

// ---------------------------------------------------------------------------
// Helpers — build mock LedgerKey objects with custom ScVal keys
// ---------------------------------------------------------------------------

function makeContractDataKey(scVal: unknown): xdr.LedgerKey {
  return (xdr as any)._makeLedgerKey('contractData', {
    key: () => scVal,
  }) as unknown as xdr.LedgerKey
}

function makeContractCodeKey(): xdr.LedgerKey {
  return (xdr as any)._makeLedgerKey('contractCode') as unknown as xdr.LedgerKey
}

function makeTtlKey(): xdr.LedgerKey {
  return (xdr as any)._makeLedgerKey('ttl') as unknown as xdr.LedgerKey
}

function makeUnknownKey(): xdr.LedgerKey {
  return (xdr as any)._makeLedgerKey('account') as unknown as xdr.LedgerKey
}

// ---------------------------------------------------------------------------
// classifySacKey unit tests (issue #47)
// ---------------------------------------------------------------------------

describe('classifySacKey', () => {
  it('identifies Balance keys (scvVec with scvSymbol("Balance") as first element)', () => {
    const balanceScVal = (xdr as any)._scvVec([
      (xdr as any)._scvSymbol('Balance'),
      (xdr as any)._scvSymbol('some-address'), // simplified stand-in for scvAddress
    ])
    expect(classifySacKey(balanceScVal as unknown as xdr.ScVal)).toBe('sacBalance')
  })

  it('identifies Allowance keys (scvVec with scvSymbol("Allowance") as first element)', () => {
    const allowanceScVal = (xdr as any)._scvVec([
      (xdr as any)._scvSymbol('Allowance'),
    ])
    expect(classifySacKey(allowanceScVal as unknown as xdr.ScVal)).toBe('sacAllowance')
  })

  it('identifies Admin keys (scvSymbol("Admin"))', () => {
    const adminScVal = (xdr as any)._scvSymbol('Admin')
    expect(classifySacKey(adminScVal as unknown as xdr.ScVal)).toBe('sacAdmin')
  })

  it('identifies Name metadata key (scvSymbol("Name"))', () => {
    const nameScVal = (xdr as any)._scvSymbol('Name')
    expect(classifySacKey(nameScVal as unknown as xdr.ScVal)).toBe('sacMetadata')
  })

  it('identifies Symbol metadata key (scvSymbol("Symbol"))', () => {
    const symScVal = (xdr as any)._scvSymbol('Symbol')
    expect(classifySacKey(symScVal as unknown as xdr.ScVal)).toBe('sacMetadata')
  })

  it('identifies Decimals metadata key (scvSymbol("Decimals"))', () => {
    const decimalsScVal = (xdr as any)._scvSymbol('Decimals')
    expect(classifySacKey(decimalsScVal as unknown as xdr.ScVal)).toBe('sacMetadata')
  })

  it('identifies Nonce keys (scvLedgerKeyNonce)', () => {
    const nonceScVal = (xdr as any)._scvLedgerKeyNonce()
    expect(classifySacKey(nonceScVal as unknown as xdr.ScVal)).toBe('sacNonce')
  })

  it('returns undefined for scvLedgerKeyContractInstance (classified at LedgerKey level)', () => {
    const instanceScVal = (xdr as any)._scvLedgerKeyContractInstance()
    expect(classifySacKey(instanceScVal as unknown as xdr.ScVal)).toBeUndefined()
  })

  it('returns undefined for non-SAC vec keys', () => {
    const unknownVec = (xdr as any)._scvVec([
      (xdr as any)._scvSymbol('SomeOtherStorage'),
    ])
    expect(classifySacKey(unknownVec as unknown as xdr.ScVal)).toBeUndefined()
  })

  it('returns undefined for non-SAC symbol keys', () => {
    const randomSym = (xdr as any)._scvSymbol('RandomKey')
    expect(classifySacKey(randomSym as unknown as xdr.ScVal)).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// classifyLedgerKey extended tests (issues #47 and #48)
// ---------------------------------------------------------------------------

describe('classifyLedgerKey — contractInstance entries (issue #48)', () => {
  it('classifies ContractData with scvLedgerKeyContractInstance key as contractInstance', () => {
    const instanceKey = makeContractDataKey((xdr as any)._scvLedgerKeyContractInstance())
    const result = classifyLedgerKey(instanceKey)
    expect(result.keyType).toBe('contractInstance')
    expect(result.restorePriority).toBe(0)
    expect(result.contractId).toBe('cafebabe')
    expect(result.sacKeyType).toBeUndefined()
  })

  it('assigns restorePriority 0 to contractInstance entries', () => {
    const instanceKey = makeContractDataKey((xdr as any)._scvLedgerKeyContractInstance())
    const result = classifyLedgerKey(instanceKey)
    expect(result.restorePriority).toBe(0)
  })
})

describe('classifyLedgerKey — SAC ContractData entries (issue #47)', () => {
  it('classifies Balance entry with sacKeyType=sacBalance', () => {
    const balanceKey = makeContractDataKey(
      (xdr as any)._scvVec([(xdr as any)._scvSymbol('Balance')]),
    )
    const result = classifyLedgerKey(balanceKey)
    expect(result.keyType).toBe('contractData')
    expect(result.sacKeyType).toBe('sacBalance')
    expect(result.restorePriority).toBe(2)
  })

  it('classifies Allowance entry with sacKeyType=sacAllowance', () => {
    const allowanceKey = makeContractDataKey(
      (xdr as any)._scvVec([(xdr as any)._scvSymbol('Allowance')]),
    )
    const result = classifyLedgerKey(allowanceKey)
    expect(result.keyType).toBe('contractData')
    expect(result.sacKeyType).toBe('sacAllowance')
  })

  it('classifies Admin entry with sacKeyType=sacAdmin', () => {
    const adminKey = makeContractDataKey((xdr as any)._scvSymbol('Admin'))
    const result = classifyLedgerKey(adminKey)
    expect(result.keyType).toBe('contractData')
    expect(result.sacKeyType).toBe('sacAdmin')
  })

  it('classifies Name metadata entry with sacKeyType=sacMetadata', () => {
    const nameKey = makeContractDataKey((xdr as any)._scvSymbol('Name'))
    const result = classifyLedgerKey(nameKey)
    expect(result.keyType).toBe('contractData')
    expect(result.sacKeyType).toBe('sacMetadata')
  })

  it('classifies Nonce entry with sacKeyType=sacNonce', () => {
    const nonceKey = makeContractDataKey((xdr as any)._scvLedgerKeyNonce())
    const result = classifyLedgerKey(nonceKey)
    expect(result.keyType).toBe('contractData')
    expect(result.sacKeyType).toBe('sacNonce')
  })

  it('classifies non-SAC contractData entries without sacKeyType', () => {
    const customKey = makeContractDataKey((xdr as any)._scvSymbol('CustomStorage'))
    const result = classifyLedgerKey(customKey)
    expect(result.keyType).toBe('contractData')
    expect(result.sacKeyType).toBeUndefined()
  })

  it('assigns restorePriority 2 to all contractData entries', () => {
    const balanceKey = makeContractDataKey(
      (xdr as any)._scvVec([(xdr as any)._scvSymbol('Balance')]),
    )
    expect(classifyLedgerKey(balanceKey).restorePriority).toBe(2)
  })
})

describe('classifyLedgerKey — contractCode entries', () => {
  it('classifies contractCode keys correctly', () => {
    const result = classifyLedgerKey(makeContractCodeKey())
    expect(result.keyType).toBe('contractCode')
    expect(result.contractId).toBe('deadbeef')
    expect(result.restorePriority).toBe(1)
    expect(result.sacKeyType).toBeUndefined()
  })
})

describe('classifyLedgerKey — ttl and unknown entries', () => {
  it('classifies ttl entries with priority 3', () => {
    const result = classifyLedgerKey(makeTtlKey())
    expect(result.keyType).toBe('ttlEntry')
    expect(result.restorePriority).toBe(3)
  })

  it('classifies unknown entry types with priority 3', () => {
    const result = classifyLedgerKey(makeUnknownKey())
    expect(result.keyType).toBe('unknown')
    expect(result.restorePriority).toBe(3)
  })
})

// ---------------------------------------------------------------------------
// Restoration priority ordering tests (issue #48)
// ---------------------------------------------------------------------------

describe('restoration priority ordering', () => {
  it('contractInstance has lower priority number than contractCode', () => {
    const instanceKey = makeContractDataKey((xdr as any)._scvLedgerKeyContractInstance())
    const codeKey = makeContractCodeKey()
    const instanceResult = classifyLedgerKey(instanceKey)
    const codeResult = classifyLedgerKey(codeKey)
    expect(instanceResult.restorePriority).toBeLessThan(codeResult.restorePriority)
  })

  it('contractCode has lower priority number than contractData', () => {
    const codeKey = makeContractCodeKey()
    const dataKey = makeContractDataKey((xdr as any)._scvSymbol('Admin'))
    const codeResult = classifyLedgerKey(codeKey)
    const dataResult = classifyLedgerKey(dataKey)
    expect(codeResult.restorePriority).toBeLessThan(dataResult.restorePriority)
  })

  it('sorts a mixed batch by restorePriority ascending', () => {
    const keys = [
      { restorePriority: 2, keyType: 'contractData' as const, key: {} as xdr.LedgerKey, keyBase64: 'b' },
      { restorePriority: 0, keyType: 'contractInstance' as const, key: {} as xdr.LedgerKey, keyBase64: 'a' },
      { restorePriority: 1, keyType: 'contractCode' as const, key: {} as xdr.LedgerKey, keyBase64: 'c' },
      { restorePriority: 3, keyType: 'ttlEntry' as const, key: {} as xdr.LedgerKey, keyBase64: 'd' },
    ]
    const sorted = [...keys].sort((a, b) => a.restorePriority - b.restorePriority)
    expect(sorted.map(k => k.keyType)).toEqual([
      'contractInstance',
      'contractCode',
      'contractData',
      'ttlEntry',
    ])
  })
})

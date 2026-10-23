import { describe, it, expect } from 'vitest';
import { RpcSchemaError, SCHEMA_PROTOCOL_LINES, validateRpcResultSchema } from './response-schema';

const VALID = {
  getHealth: { status: 'healthy' },
  getNetwork: { passphrase: 'Test SDF Network ; September 2015', protocolVersion: 22 },
  getLatestLedger: { id: 'abc', protocolVersion: 22, sequence: 100 },
  getLedgerEntries: { entries: [], latestLedger: 100 },
  simulateTransaction: { latestLedger: 100 },
  sendTransaction: { status: 'PENDING', hash: 'h', latestLedger: 100 },
  getTransaction: { status: 'NOT_FOUND', latestLedger: 100, txHash: 'h' },
} as const;

describe('validateRpcResultSchema', () => {
  for (const protocol of SCHEMA_PROTOCOL_LINES) {
    for (const [method, result] of Object.entries(VALID)) {
      it(`accepts a valid ${method} result on protocol ${protocol}`, () => {
        expect(() => validateRpcResultSchema(method, { ...result, extra: true }, protocol)).not.toThrow();
      });
    }
  }

  it('requires getTransaction.txHash only from protocol 22', () => {
    const { txHash: _omit, ...legacy } = VALID.getTransaction;
    expect(() => validateRpcResultSchema('getTransaction', legacy, 21)).not.toThrow();
    expect(() => validateRpcResultSchema('getTransaction', legacy, 22)).toThrow(/missing txHash/);
  });

  it('reports the missing field', () => {
    try {
      validateRpcResultSchema('sendTransaction', { status: 'PENDING', latestLedger: 1 }, 22);
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(RpcSchemaError);
      expect((err as RpcSchemaError).field).toBe('hash');
      expect((err as RpcSchemaError).protocolVersion).toBe(22);
    }
  });

  it('rejects wrong field types, including null', () => {
    expect(() => validateRpcResultSchema('getLatestLedger', { ...VALID.getLatestLedger, sequence: '100' }, 22))
      .toThrow(/sequence must be number, received string/);
    expect(() => validateRpcResultSchema('getLedgerEntries', { entries: null, latestLedger: 1 }, 22))
      .toThrow(/entries must be array, received null/);
  });

  it('rejects non-object results', () => {
    for (const bad of [null, [], 'ok', 1]) {
      expect(() => validateRpcResultSchema('getHealth', bad, 22)).toThrow(/must be an object/);
    }
  });

  it('rejects protocols outside the matrix and unknown methods', () => {
    expect(() => validateRpcResultSchema('getHealth', VALID.getHealth, 19)).toThrow(/outside the supported matrix/);
    expect(() => validateRpcResultSchema('getHealth', VALID.getHealth, 23)).toThrow(/outside the supported matrix/);
    expect(() => validateRpcResultSchema('getEvents', {}, 22)).toThrow(/No response schema/);
  });
});

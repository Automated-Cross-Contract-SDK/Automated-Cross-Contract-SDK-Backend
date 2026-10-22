import { describe, it, expect } from 'vitest';
import {
  parseTraceparent,
  formatTraceparent,
  resolveParentContext,
} from '../src/tracing';

const VALID_TRACE_ID = '4bf92f3577b34da6a3ce929d0e0e4736';
const VALID_PARENT_ID = '00f067aa0ba902b7';
const VALID = `00-${VALID_TRACE_ID}-${VALID_PARENT_ID}-01`;

describe('parseTraceparent', () => {
  it('parses a valid traceparent', () => {
    const ctx = parseTraceparent(VALID);
    expect(ctx).not.toBeNull();
    expect(ctx!.traceId).toBe(VALID_TRACE_ID);
    expect(ctx!.parentId).toBe(VALID_PARENT_ID);
    expect(ctx!.traceFlags).toBe('01');
    expect(ctx!.version).toBe('00');
  });

  it('accepts unknown versions (>00) and records traceflags verbatim', () => {
    const ctx = parseTraceparent(`01-${VALID_TRACE_ID}-${VALID_PARENT_ID}-ff`);
    expect(ctx).not.toBeNull();
    expect(ctx!.version).toBe('01');
    expect(ctx!.traceFlags).toBe('ff');
  });

  const invalid: Array<[string, string]> = [
    ['empty string', ''],
    ['missing fields', `00-${VALID_TRACE_ID}-${VALID_PARENT_ID}`],
    ['too many fields', `${VALID}-extra`],
    ['version ff is forbidden', `ff-${VALID_TRACE_ID}-${VALID_PARENT_ID}-01`],
    ['version not hex', `zz-${VALID_TRACE_ID}-${VALID_PARENT_ID}-01`],
    ['version wrong length', `0-${VALID_TRACE_ID}-${VALID_PARENT_ID}-01`],
    ['trace-id too short', `00-${VALID_TRACE_ID.slice(0, 30)}-${VALID_PARENT_ID}-01`],
    ['trace-id too long', `00-${VALID_TRACE_ID}00-${VALID_PARENT_ID}-01`],
    ['trace-id not hex', `00-${'g'.repeat(32)}-${VALID_PARENT_ID}-01`],
    ['trace-id all zeros', `00-${'0'.repeat(32)}-${VALID_PARENT_ID}-01`],
    ['parent-id too short', `00-${VALID_TRACE_ID}-${VALID_PARENT_ID.slice(0, 14)}-01`],
    ['parent-id too long', `00-${VALID_TRACE_ID}-${VALID_PARENT_ID}00-01`],
    ['parent-id not hex', `00-${VALID_TRACE_ID}-${'z'.repeat(16)}-01`],
    ['parent-id all zeros', `00-${VALID_TRACE_ID}-${'0'.repeat(16)}-01`],
    ['traceflags too short', `00-${VALID_TRACE_ID}-${VALID_PARENT_ID}-0`],
    ['traceflags too long', `00-${VALID_TRACE_ID}-${VALID_PARENT_ID}-010`],
    ['traceflags not hex', `00-${VALID_TRACE_ID}-${VALID_PARENT_ID}-zz`],
    ['wrong delimiter', `00_${VALID_TRACE_ID}-${VALID_PARENT_ID}-01`],
    ['uppercase hex', `00-${VALID_TRACE_ID.toUpperCase()}-${VALID_PARENT_ID}-01`],
    ['leading whitespace', ` ${VALID}`],
    ['trailing whitespace', `${VALID} `],
  ];

  it.each(invalid)('rejects %s', (_label, value) => {
    expect(parseTraceparent(value)).toBeNull();
  });

  it('rejects non-string input', () => {
    expect(parseTraceparent(undefined as unknown as string)).toBeNull();
    expect(parseTraceparent(null as unknown as string)).toBeNull();
  });
});

describe('formatTraceparent', () => {
  it('round-trips valid contexts (format ∘ parse = id)', () => {
    const ctx = parseTraceparent(VALID)!;
    expect(formatTraceparent(ctx)).toBe(VALID);
  });

  it('round-trips across a range of valid ids', () => {
    const traceIds = [
      '4bf92f3577b34da6a3ce929d0e0e4736',
      '00000000000000000000000000000001',
      'ffffffffffffffffffffffffffffffff',
      '0123456789abcdef0123456789abcdef',
    ];
    const parentIds = [
      '00f067aa0ba902b7',
      '0000000000000001',
      'ffffffffffffffff',
      '0123456789abcdef',
    ];
    for (const traceId of traceIds) {
      for (const parentId of parentIds) {
        const input = `00-${traceId}-${parentId}-01`;
        const ctx = parseTraceparent(input);
        expect(ctx).not.toBeNull();
        expect(formatTraceparent(ctx!)).toBe(input);
      }
    }
  });
});

describe('resolveParentContext', () => {
  it('returns null for malformed traceparent', () => {
    expect(resolveParentContext(`00-${'0'.repeat(32)}-${VALID_PARENT_ID}-01`)).toBeNull();
  });

  it('resolves a valid traceparent', () => {
    const ctx = resolveParentContext(VALID);
    expect(ctx).not.toBeNull();
    expect(ctx!.traceId).toBe(VALID_TRACE_ID);
  });
});

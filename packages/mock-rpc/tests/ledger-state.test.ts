import { describe, it, expect, beforeEach } from 'vitest';
import { LedgerState } from '../src/ledger-state';

describe('LedgerState', () => {
  let ledger: LedgerState;

  beforeEach(() => {
    ledger = new LedgerState();
  });

  describe('addEntry', () => {
    it('stores an entry with no TTL by default', () => {
      ledger.addEntry('key1', 'value1');
      expect(ledger.getEntry('key1')).toBe('value1');
    });

    it('stores an entry with an explicit TTL', () => {
      ledger.addEntry('key1', 'value1', 100);
      expect(ledger.getEntry('key1')).toBe('value1');
    });

    it('expires an entry once its TTL has elapsed', () => {
      ledger.addEntry('key1', 'value1', 10);
      ledger.setCurrentLedgerSeq(11);
      expect(ledger.getEntry('key1')).toBeUndefined();
    });

    it('keeps an entry alive while within its TTL window', () => {
      ledger.addEntry('key1', 'value1', 10);
      ledger.setCurrentLedgerSeq(5);
      expect(ledger.getEntry('key1')).toBe('value1');
    });

    it('overwrites an existing entry', () => {
      ledger.addEntry('key1', 'value1');
      ledger.addEntry('key1', 'value2');
      expect(ledger.getEntry('key1')).toBe('value2');
    });
  });

  describe('archiveAll', () => {
    it('archives entries whose TTL has elapsed', () => {
      ledger.addEntry('key1', 'value1', 10);
      ledger.addEntry('key2', 'value2', 100);
      ledger.setCurrentLedgerSeq(50);
      ledger.archiveAll();
      expect(ledger.getEntry('key1')).toBeUndefined();
      expect(ledger.getEntry('key2')).toBe('value2');
    });

    it('does not archive entries without a TTL', () => {
      ledger.addEntry('key1', 'value1');
      ledger.setCurrentLedgerSeq(1000);
      ledger.archiveAll();
      expect(ledger.getEntry('key1')).toBe('value1');
    });
  });

  describe('getArchivedCount', () => {
    it('starts at zero', () => {
      expect(ledger.getArchivedCount()).toBe(0);
    });

    it('increments as entries are archived', () => {
      ledger.addEntry('key1', 'value1', 10);
      ledger.addEntry('key2', 'value2', 10);
      ledger.setCurrentLedgerSeq(50);
      ledger.archiveAll();
      expect(ledger.getArchivedCount()).toBe(2);
    });
  });
});

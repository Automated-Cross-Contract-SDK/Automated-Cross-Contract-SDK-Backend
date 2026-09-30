import { describe, it, expect, beforeEach } from 'vitest';
import { SequenceManager } from '../src/sequence-manager';

describe('SequenceManager', () => {
  let manager: SequenceManager;

  beforeEach(() => {
    manager = new SequenceManager();
  });

  describe('set', () => {
    it('stores the sequence for an account', () => {
      manager.set('GABC', 42);
      expect(manager.get('GABC')).toBe(42);
    });

    it('overwrites a previously stored sequence', () => {
      manager.set('GABC', 1);
      manager.set('GABC', 99);
      expect(manager.get('GABC')).toBe(99);
    });
  });

  describe('get', () => {
    it('returns undefined for an unknown account', () => {
      expect(manager.get('GUNKNOWN')).toBeUndefined();
    });
  });

  describe('getAndIncrement', () => {
    it('returns the current sequence and increments it', () => {
      manager.set('GABC', 10);
      expect(manager.getAndIncrement('GABC')).toBe(10);
      expect(manager.get('GABC')).toBe(11);
    });

    it('increments monotonically across successive calls', () => {
      manager.set('GABC', 0);
      expect(manager.getAndIncrement('GABC')).toBe(0);
      expect(manager.getAndIncrement('GABC')).toBe(1);
      expect(manager.getAndIncrement('GABC')).toBe(2);
      expect(manager.get('GABC')).toBe(3);
    });

    it('tracks sequences independently per account', () => {
      manager.set('GA', 5);
      manager.set('GB', 100);
      expect(manager.getAndIncrement('GA')).toBe(5);
      expect(manager.getAndIncrement('GB')).toBe(100);
      expect(manager.get('GA')).toBe(6);
      expect(manager.get('GB')).toBe(101);
    });

    it('handles unknown accounts deterministically', () => {
      const first = manager.getAndIncrement('GUNKNOWN');
      const second = manager.getAndIncrement('GUNKNOWN');
      expect(second).toBe(first + 1);
    });
  });
});

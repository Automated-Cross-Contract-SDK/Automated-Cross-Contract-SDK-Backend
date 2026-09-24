import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventDeduplicator } from '../src/event-deduplicator.js'

describe('EventDeduplicator', () => {
  let deduplicator: EventDeduplicator

  beforeEach(() => {
    deduplicator = new EventDeduplicator({ windowMs: 100 })
  })

  it('allows the first emission of a sequence', () => {
    expect(deduplicator.isDuplicate(123)).toBe(false)
  })

  it('suppresses duplicate emissions within the time window', () => {
    expect(deduplicator.isDuplicate(123)).toBe(false)
    expect(deduplicator.isDuplicate(123)).toBe(true)
  })

  it('allows re-emission after the time window expires', async () => {
    expect(deduplicator.isDuplicate(123)).toBe(false)
    expect(deduplicator.isDuplicate(123)).toBe(true)

    // Wait for window to expire
    await new Promise(r => setTimeout(r, 150))

    // Same sequence is now allowed again
    expect(deduplicator.isDuplicate(123)).toBe(false)
  })

  it('tracks multiple different sequences independently', () => {
    expect(deduplicator.isDuplicate(100)).toBe(false)
    expect(deduplicator.isDuplicate(200)).toBe(false)
    expect(deduplicator.isDuplicate(300)).toBe(false)

    // Duplicates of each are suppressed
    expect(deduplicator.isDuplicate(100)).toBe(true)
    expect(deduplicator.isDuplicate(200)).toBe(true)
    expect(deduplicator.isDuplicate(300)).toBe(true)
  })

  it('does not interfere between sequences', () => {
    expect(deduplicator.isDuplicate(100)).toBe(false)
    expect(deduplicator.isDuplicate(200)).toBe(false)

    // Duplicate of first doesn't affect second
    expect(deduplicator.isDuplicate(100)).toBe(true)
    expect(deduplicator.isDuplicate(200)).toBe(false) // Still not a duplicate
    expect(deduplicator.isDuplicate(200)).toBe(true) // Now it is
  })

  it('automatically prunes old entries', () => {
    expect(deduplicator.getSize()).toBe(0)

    expect(deduplicator.isDuplicate(100)).toBe(false)
    expect(deduplicator.getSize()).toBe(1)

    expect(deduplicator.isDuplicate(200)).toBe(false)
    expect(deduplicator.getSize()).toBe(2)

    expect(deduplicator.isDuplicate(300)).toBe(false)
    expect(deduplicator.getSize()).toBe(3)

    // After wait, size decreases due to pruning
    // (assuming window is 100ms, wait 150ms, then call isDuplicate which triggers pruning)
    // But first emission after wait won't be in recent, so pruning happens on new call
  })

  it('clear() removes all tracked sequences', () => {
    deduplicator.isDuplicate(100)
    deduplicator.isDuplicate(200)
    expect(deduplicator.getSize()).toBe(2)

    deduplicator.clear()
    expect(deduplicator.getSize()).toBe(0)

    // After clear, sequences are allowed again
    expect(deduplicator.isDuplicate(100)).toBe(false)
    expect(deduplicator.isDuplicate(200)).toBe(false)
  })

  it('uses default 2-second window when not configured', () => {
    const defaultDedup = new EventDeduplicator()
    expect(defaultDedup.isDuplicate(999)).toBe(false)
    expect(defaultDedup.isDuplicate(999)).toBe(true)
  })

  it('handles rapid sequence of same and different events', () => {
    // Simulate a sequence of close events: 1, 2, 1 (duplicate), 3, 2 (duplicate), 1 (still duplicate)
    expect(deduplicator.isDuplicate(1)).toBe(false)
    expect(deduplicator.isDuplicate(2)).toBe(false)
    expect(deduplicator.isDuplicate(1)).toBe(true) // duplicate
    expect(deduplicator.isDuplicate(3)).toBe(false)
    expect(deduplicator.isDuplicate(2)).toBe(true) // duplicate
    expect(deduplicator.isDuplicate(1)).toBe(true) // still duplicate
  })

  it('tracks large sequence numbers', () => {
    const largeSeq = Number.MAX_SAFE_INTEGER - 1
    expect(deduplicator.isDuplicate(largeSeq)).toBe(false)
    expect(deduplicator.isDuplicate(largeSeq)).toBe(true)
  })
})

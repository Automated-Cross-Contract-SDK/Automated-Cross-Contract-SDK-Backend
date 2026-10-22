/**
 * Event deduplicator for preventing duplicate emissions of the same event
 * (identified by sequence number) within a specified time window.
 *
 * Motivation: WebSocket reconnections or event re-delivery can cause the same
 * ledger-close event (same sequence) to be emitted multiple times. This utility
 * tracks recently-emitted sequence numbers and suppresses duplicates arriving
 * within a configurable window.
 */

export interface EventDeduplicatorConfig {
  /** Time window in milliseconds within which duplicates are suppressed (default: 2000). */
  windowMs?: number
}

/**
 * Tracks recently-emitted event sequences and suppresses duplicates within a
 * time window. Old entries outside the window are automatically pruned.
 */
export class EventDeduplicator {
  private recentSequences: Map<number, number> = new Map()
  private readonly windowMs: number

  constructor(config: EventDeduplicatorConfig = {}) {
    this.windowMs = config.windowMs ?? 2000
  }

  /**
   * Check if a sequence number is a duplicate (already emitted recently).
   * If not a duplicate, record it as recently emitted and return false.
   * If a duplicate, return true (event should be suppressed).
   *
   * Automatically prunes entries older than the configured window.
   */
  isDuplicate(sequence: number): boolean {
    const now = Date.now()
    this.pruneOldEntries(now)

    if (this.recentSequences.has(sequence)) {
      const emittedAt = this.recentSequences.get(sequence)!
      // If still within window, it's a duplicate
      if (now - emittedAt < this.windowMs) {
        return true
      }
      // Outside window, it's a new emission of the same sequence
    }

    // Record this sequence as newly emitted
    this.recentSequences.set(sequence, now)
    return false
  }

  /**
   * Remove entries outside the configured time window.
   * Called automatically by isDuplicate but exposed for testing.
   */
  private pruneOldEntries(now: number = Date.now()): void {
    for (const [sequence, emittedAt] of this.recentSequences.entries()) {
      if (now - emittedAt >= this.windowMs) {
        this.recentSequences.delete(sequence)
      }
    }
  }

  /**
   * Clear all tracked sequences. Useful for testing or explicit reset.
   */
  clear(): void {
    this.recentSequences.clear()
  }

  /**
   * Get the number of currently tracked sequences (for monitoring).
   */
  getSize(): number {
    this.pruneOldEntries()
    return this.recentSequences.size
  }
}

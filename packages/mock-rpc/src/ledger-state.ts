import type { SimulatedLedgerEntry, LedgerStateOptions } from './types.js'
import { xdr } from '@stellar/stellar-sdk'

/**
 * Manages a simulated ledger state with configurable TTL expiry.
 *
 * Entries can be pre-loaded, added dynamically, and queried.  The "archived"
 * status of an entry is determined by comparing the entry's
 * `lastLiveLedgerSeq + ttl` against the current ledger sequence.
 */
export class MockLedgerState {
  private entries: Map<string, SimulatedLedgerEntry> = new Map()
  private currentLedgerSeq: number
  private defaultTtl: number

  /** Default TTL: ~30 days of ledgers (5s per ledger). */
  static DEFAULT_TTL = 4_095_360

  constructor(options: LedgerStateOptions = {}, currentLedgerSeq = 1) {
    this.currentLedgerSeq = currentLedgerSeq
    this.defaultTtl = options.defaultTtl ?? MockLedgerState.DEFAULT_TTL

    if (options.entries) {
      for (const entry of options.entries) {
        this.addEntry(entry)
      }
    }
  }

  /** Set the current ledger sequence (advances time for TTL calculations). */
  setCurrentLedgerSeq(seq: number): void {
    this.currentLedgerSeq = seq
  }

  /** Get the current ledger sequence. */
  getCurrentLedgerSeq(): number {
    return this.currentLedgerSeq
  }

  /** Add or update a ledger entry. */
  addEntry(entry: SimulatedLedgerEntry): void {
    const key = entry.keyBase64 || this.encodeKey(entry.key)
    this.entries.set(key, { ...entry, keyBase64: key })
  }

  /** Remove a ledger entry by its base64 key. */
  removeEntry(keyBase64: string): boolean {
    return this.entries.delete(keyBase64)
  }

  /** Get a single entry by base64 key. Returns undefined if not found. */
  getEntry(keyBase64: string): SimulatedLedgerEntry | undefined {
    return this.entries.get(keyBase64)
  }

  /**
   * Query multiple entries.  Returns only entries that are NOT archived
   * (i.e. still live at the current ledger sequence).
   */
  getLiveEntries(keys: xdr.LedgerKey[]): SimulatedLedgerEntry[] {
    const result: SimulatedLedgerEntry[] = []
    for (const key of keys) {
      const keyB64 = this.encodeKey(key)
      const entry = this.entries.get(keyB64)
      if (entry !== undefined && !this.isArchived(entry)) {
        result.push(entry)
      }
    }
    return result
  }

  /**
   * Returns entries that are archived (expired) at the current ledger sequence.
   */
  getArchivedEntries(keys?: xdr.LedgerKey[]): SimulatedLedgerEntry[] {
    if (keys) {
      const result: SimulatedLedgerEntry[] = []
      for (const key of keys) {
        const keyB64 = this.encodeKey(key)
        const entry = this.entries.get(keyB64)
        if (entry !== undefined && this.isArchived(entry)) {
          result.push(entry)
        }
      }
      return result
    }

    // Return all archived entries
    return Array.from(this.entries.values()).filter(e => this.isArchived(e))
  }

  /** Check if an entry is archived (TTL expired). */
  isArchived(entry: SimulatedLedgerEntry): boolean {
    const expiryLedger = entry.lastLiveLedgerSeq + (entry.ttl || this.defaultTtl)
    return this.currentLedgerSeq > expiryLedger
  }

  /** Get the expiry ledger for an entry. */
  getExpiryLedger(entry: SimulatedLedgerEntry): number {
    return entry.lastLiveLedgerSeq + (entry.ttl || this.defaultTtl)
  }

  /** Get all entries (archived and live). */
  getAllEntries(): SimulatedLedgerEntry[] {
    return Array.from(this.entries.values())
  }

  /** Get the count of all entries. */
  getEntryCount(): number {
    return this.entries.size
  }

  /** Get the count of archived entries. */
  getArchivedCount(): number {
    return Array.from(this.entries.values()).filter(e => this.isArchived(e)).length
  }

  /** Clear all entries. */
  clear(): void {
    this.entries.clear()
  }

  /** Generate a deterministic base64 key from an LedgerKey. */
  encodeKey(key: xdr.LedgerKey): string {
    try {
      return key.toXDR('base64')
    } catch {
      // Fallback: JSON-serialise
      return Buffer.from(JSON.stringify(key)).toString('base64')
    }
  }

  /**
   * Build a getLedgerEntries response from a set of ledger keys.
   * Returns only live (non-archived) entries.
   */
  buildGetLedgerEntriesResponse(keys: xdr.LedgerKey[]): {
    entries: Array<{ key: xdr.LedgerKey; xdr: string; lastModifiedLedgerSeq: number }>
  } {
    const liveEntries = this.getLiveEntries(keys)
    return {
      entries: liveEntries.map(entry => ({
        key: entry.key,
        xdr: entry.data,
        lastModifiedLedgerSeq: entry.lastLiveLedgerSeq,
      })),
    }
  }

  /**
   * Bulk-configure entries to be archived by advancing ledger past their TTL.
   * If no entries are provided, advances past all entries' TTL.
   */
  archiveAll(entries?: SimulatedLedgerEntry[]): void {
    const targets = entries ?? Array.from(this.entries.values())
    if (targets.length === 0) return

    let maxExpiry = 0
    for (const entry of targets) {
      const expiry = this.getExpiryLedger(entry)
      if (expiry > maxExpiry) maxExpiry = expiry
    }
    this.currentLedgerSeq = maxExpiry + 1
  }

  /**
   * Configure specific entries by advancing the ledger to their TTL + 1.
   */
  archiveEntries(entries: SimulatedLedgerEntry[]): void {
    this.archiveAll(entries)
  }
}

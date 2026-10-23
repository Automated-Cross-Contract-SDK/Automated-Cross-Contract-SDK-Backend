import type { xdr, SorobanRpc } from '@stellar/stellar-sdk'
import { encodeLedgerKey } from './footprint-parser.js'

type LedgerEntry = SorobanRpc.Api.LedgerEntryResult
type Fetcher = (keys: xdr.LedgerKey[]) => Promise<LedgerEntry[]>

/**
 * Label-free counters for ledger-read coalescing. Contains only aggregate
 * numbers — never ledger keys, contract ids, accounts or RPC URLs.
 */
export interface CoalescingStatistics {
  /** Keys requested by callers (after per-call de-duplication). */
  keysRequested: number
  /** Keys served by joining an already in-flight read. */
  keysCoalesced: number
  /** Duplicate keys removed within a single call. */
  duplicateKeysSkipped: number
  /** Underlying `getLedgerEntries` RPC calls issued. */
  rpcCalls: number
  /** Keys currently awaiting an in-flight read. */
  inFlight: number
}

/**
 * Coalesces identical ledger-entry reads issued by concurrent transactions.
 * A key that is already being fetched is awaited instead of re-requested;
 * remaining keys are fetched in a single RPC call. Results are not cached
 * once the read settles, so callers always observe fresh ledger state.
 * A failed read rejects every caller waiting on it.
 */
export class LedgerReadCoalescer {
  private inFlight = new Map<string, Promise<LedgerEntry | undefined>>()
  private stats = { keysRequested: 0, keysCoalesced: 0, duplicateKeysSkipped: 0, rpcCalls: 0 }

  /**
   * @param keys Keys to read. Pass `encoded` (same order) to reuse
   *   pre-computed base64 encodings and avoid re-encoding.
   */
  async getLedgerEntries(keys: xdr.LedgerKey[], fetcher: Fetcher, encoded?: string[]): Promise<LedgerEntry[]> {
    const unique = new Map<string, xdr.LedgerKey>()
    keys.forEach((k, i) => {
      const id = encoded?.[i] ?? encodeLedgerKey(k)
      if (unique.has(id)) this.stats.duplicateKeysSkipped++
      else unique.set(id, k)
    })
    this.stats.keysRequested += unique.size

    const waits: Promise<LedgerEntry | undefined>[] = []
    const toFetch: [string, xdr.LedgerKey][] = []
    for (const [id, key] of unique) {
      const pending = this.inFlight.get(id)
      if (pending) {
        this.stats.keysCoalesced++
        waits.push(pending)
      } else {
        toFetch.push([id, key])
      }
    }

    if (toFetch.length > 0) {
      this.stats.rpcCalls++
      const batch = fetcher(toFetch.map(([, k]) => k)).then(entries => {
        const byId = new Map<string, LedgerEntry>()
        for (const e of entries) byId.set(encodeLedgerKey(e.key), e)
        return byId
      })
      for (const [id] of toFetch) {
        const p = batch.then(m => m.get(id))
        p.catch(() => {})
        this.inFlight.set(id, p)
        waits.push(p)
        void p.then(
          () => this.release(id, p),
          () => this.release(id, p),
        )
      }
    }

    const results = await Promise.all(waits)
    return results.filter((e): e is LedgerEntry => e !== undefined)
  }

  getStatistics(): CoalescingStatistics {
    return { ...this.stats, inFlight: this.inFlight.size }
  }

  private release(id: string, p: Promise<LedgerEntry | undefined>): void {
    if (this.inFlight.get(id) === p) this.inFlight.delete(id)
  }
}

/**
 * Deterministic sequence number manager for mock RPC testing.
 *
 * Provides predictable, incrementing sequence numbers for accounts without
 * needing to interact with a real Stellar network.
 */
export class SequenceManager {
  private sequences: Map<string, bigint> = new Map()
  private defaultStart: bigint

  constructor(defaultStartSeq: bigint | string = '1') {
    this.defaultStart = BigInt(defaultStartSeq)
  }

  /** Set the sequence number for a specific account. */
  setSequence(accountId: string, seq: bigint | string): void {
    this.sequences.set(accountId, BigInt(seq))
  }

  /** Get the current sequence number for an account. */
  getSequence(accountId: string): bigint {
    const current = this.sequences.get(accountId) ?? this.defaultStart
    return current
  }

  /** Get the current sequence number as a string and increment it. */
  getAndIncrement(accountId: string): string {
    const current = this.sequences.get(accountId) ?? this.defaultStart
    const seqStr = current.toString()
    this.sequences.set(accountId, current + 1n)
    return seqStr
  }

  /**
   * Peek at the current sequence number without incrementing.
   * Returns the sequence as a string for compatibility with the SDK's Account constructor.
   */
  peek(accountId: string): string {
    return this.getSequence(accountId).toString()
  }

  /** Increment the sequence number for an account by the given amount. */
  increment(accountId: string, by: bigint | string = 1n): bigint {
    const current = this.sequences.get(accountId) ?? this.defaultStart
    const next = current + BigInt(by)
    this.sequences.set(accountId, next)
    return next
  }

  /** Reset an account's sequence back to the default start. */
  reset(accountId: string): void {
    this.sequences.set(accountId, this.defaultStart)
  }

  /** Reset all accounts. */
  resetAll(): void {
    this.sequences.clear()
  }

  /** Get a snapshot of all managed sequences. */
  getAllSequences(): Record<string, string> {
    const result: Record<string, string> = {}
    for (const [accountId, seq] of this.sequences.entries()) {
      result[accountId] = seq.toString()
    }
    return result
  }

  /** Build a mock Account object that the Stellar SDK's TransactionBuilder can use. */
  buildMockAccount(accountId: string): {
    accountId: () => string
    sequenceNumber: () => string
    incrementSequenceNumber: () => void
  } {
    const seqStr = this.sequences.get(accountId)?.toString() ?? this.defaultStart.toString()
    return {
      accountId: () => accountId,
      sequenceNumber: () => seqStr,
      incrementSequenceNumber: () => {
        this.increment(accountId)
      },
    }
  }
}

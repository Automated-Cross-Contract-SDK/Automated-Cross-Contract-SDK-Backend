# Episode 1: What is TTL Expiration and Why It Matters

**Duration:** 3-4 minutes (~500-600 words)

## Narration

Welcome to the Soroban Resurrect series. In this first episode, we're going to answer a fundamental question: what is TTL expiration, and why should you care about it when building on Soroban?

### What is TTL?

TTL stands for "Time To Live." In Soroban, every piece of data stored on the ledger has an expiration time. Unlike traditional blockchains where data is permanent, Soroban data decays over time to keep the ledger size manageable.

Think of it like this: every ledger entry—whether it's contract state, account balances, or code itself—has an invisible countdown timer. When that timer reaches zero, the entry becomes archived. Once archived, the data is no longer directly accessible on-chain.

### Why Does Soroban Have TTL?

Soroban adopted this design for a specific reason: **sustainable scaling**. Traditional blockchains accumulate data indefinitely. Over years and years, the full node data storage grows exponentially. Soroban solves this with automatic archival: old, unused data is moved off-chain, keeping the ledger trim and fast for all participants.

Without TTL, a node storing every piece of contract state from genesis would eventually require terabytes of storage. With TTL, Soroban keeps only the recently-used data hot, making it practical to run validators on modest hardware.

### What Happens When Data Expires?

When a ledger entry's TTL expires, Soroban archives it. The data doesn't disappear—it's still provable and recoverable. But it's no longer in the on-chain state.

Here's the critical part for developers: **if your transaction tries to touch an archived entry, the transaction will fail**. For example, if you call a contract function that reads a user's balance, and that balance entry was archived, the contract call will encounter a restore footprint error.

### How to Extend TTL

The good news is that TTL can be extended. Every time a ledger entry is accessed, its expiration timer can be reset. The Soroban SDK provides a `RestorFootprint` operation that re-archives entries before they're touched, effectively renewing their TTL.

This is where Soroban Resurrect comes in.

### Real-World Example

Imagine you're building a DeFi app. A user hasn't interacted with your contract for months. Their account state entry has expired. The user comes back and tries to execute a trade. Without intervention, that transaction fails.

Soroban Resurrect detects this failure, automatically submits a restore operation to bring the expired entries back on-chain, and then retries the user's transaction. All of this happens transparently, so the user just sees their transaction eventually succeed.

### Why This Matters for Your App

**Performance:** Soroban's TTL means the ledger stays small and fast for everyone.

**User Experience:** Apps using Soroban Resurrect shield users from the complexity of TTL. Transactions "just work" even if data has expired.

**Cost:** Restoring data requires fee, but by batching restorations and extending TTL intelligently, you can minimize the cost overhead.

### What's Next?

Now that you understand the problem TTL expiration solves, in the next episode we'll look at how to use Soroban Resurrect to handle this automatically in your code. We'll do a quickstart: installing the SDK, checking whether a transaction needs restoration, and letting the SDK handle the rest.

Thanks for watching!

---

## On-Screen Elements

- **Title card:** "What is TTL Expiration?"
- **Diagram (animated):** Simple timeline showing ledger entry → TTL countdown → archived
- **Example visual:** Account state entry with TTL timer ticking down
- **Key points (text overlay):**
  - "TTL = Time To Live"
  - "Old data is archived, not deleted"
  - "Archived data makes transactions fail"
  - "Restoration brings data back on-chain"

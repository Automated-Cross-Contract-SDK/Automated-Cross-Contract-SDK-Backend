# ADR-002: Batch Size Selection (50 keys / 100KB)

## Status
Accepted

## Context
The restoration service processes keys in batches to optimize network requests and handle rate limiting. We needed to determine appropriate batch sizes for efficient processing.

## Decision
We will use a batch size of 50 keys per batch, with a maximum payload size of 100KB per batch.

## Rationale
1. **Network Efficiency**: 50 keys balances throughput with single-request overhead
2. **RPC Limits**: Most Soroban RPC providers have response size limits around 1MB; 100KB per batch provides safety margin
3. **Memory Usage**: Keeping batches reasonably sized prevents excessive memory consumption
4. **Tested Performance**: Empirical testing showed this size provides good throughput without causing timeouts
5. **Wallet Compatibility**: 50 keys remains manageable for wallet implementations during transaction signing

## Consequences
- Positive: Optimal balance between throughput and reliability
- Negative: May not be optimal for all network conditions
- Mitigation: Configuration parameters allow adjustment for specific use cases

## Alternatives Considered
1. Smaller batches (10-20 keys) - rejected for being too conservative
2. Larger batches (100+ keys) - rejected for RPC payload limits
3. Dynamic batching based on network conditions - deferred for future implementation

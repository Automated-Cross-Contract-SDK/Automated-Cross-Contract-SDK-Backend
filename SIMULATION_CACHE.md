# Simulation Result Caching Implementation

## Overview

Implemented an in-memory LRU (Least Recently Used) cache for simulation results with TTL-based auto-expiration to avoid redundant RPC calls when the same transaction is checked multiple times.

## Cache Features

### 1. **LRU Eviction Policy**
- Tracks `lastAccessedAt` timestamp for each cache entry
- When cache reaches max size, automatically evicts the least recently used entry
- Access through `get()` updates the LRU timestamp

### 2. **TTL-based Auto-Expiration**
- Each cached entry has an `expiresAt` timestamp
- Expired entries are automatically removed on access or during `clearExpired()`
- Configurable TTL per cache instance

### 3. **Cache Key Generation**
- Key = hash(txXDR | source | ledgerSequence)
- Cross-platform compatible hashing function
- Consistent for identical inputs

### 4. **Statistics & Monitoring**
- Tracks: hits, misses, evictions, current size, hit rate
- `getStatistics()` returns: `{ hits, misses, evictions, size, hitRate }`
- `resetStatistics()` clears counters without clearing cache

## Files Created

1. **simulation-cache.ts** - Core cache implementation
   - `SimulationCache` class with LRU logic
   - `SimulationCacheConfig` interface
   - `CacheStatistics` interface
   - Static `generateKey()` method for hashing

2. **simulation-cache.test.ts** - Comprehensive test suite (40+ tests)
   - Key generation tests
   - Basic cache operations
   - LRU eviction behavior
   - TTL expiration
   - Statistics tracking

## Files Modified

1. **types.ts**
   - Added `SimulationCacheConfig` type import
   - Added `simulationCache?: SimulationCacheConfig` to `SorobanResurrectConfig`

2. **soroban-resurrect.ts**
   - Added `simulationCache` import
   - Initialize cache in constructor based on config
   - Check cache in `simulate()` before RPC call
   - Store results in cache after successful simulation
   - Added `invalidateSimulationCache()` method
   - Added `getSimulationCacheStats()` method

3. **index.ts**
   - Exported `SimulationCache`, `SimulationCacheConfig`, `CacheStatistics`

## Configuration

### Enable Caching

```typescript
const client = new SorobanResurrect({
  rpcUrl: 'https://soroban-testnet.stellar.org',
  networkPassphrase: 'Test SDF Network ; September 2015',
  simulationCache: {
    enabled: true,
    maxSize: 1000,     // Maximum cached results
    ttlMs: 60000       // 60 seconds TTL
  }
})
```

### Disable Caching (Default)

```typescript
const client = new SorobanResurrect({
  rpcUrl: 'https://soroban-testnet.stellar.org',
  networkPassphrase: 'Test SDF Network ; September 2015'
  // simulationCache not specified, defaults to disabled
})
```

## Usage Examples

### Basic Caching

```typescript
// First call - hits RPC
const result1 = await client.simulate(txXDR, source)

// Second call with same parameters - from cache
const result2 = await client.simulate(txXDR, source)

// Verify cache statistics
const stats = client.getSimulationCacheStats()
console.log(`Hit rate: ${stats.hitRate.toFixed(2)}%`)
```

### Cache Invalidation

```typescript
// Invalidate specific transaction
client.invalidateSimulationCache(txXDR, source)

// Clear entire cache
client.invalidateSimulationCache()
```

### Monitoring Cache Performance

```typescript
const stats = client.getSimulationCacheStats()

if (stats) {
  console.log(`Cache statistics:`)
  console.log(`  Hits: ${stats.hits}`)
  console.log(`  Misses: ${stats.misses}`)
  console.log(`  Hit Rate: ${stats.hitRate.toFixed(2)}%`)
  console.log(`  Size: ${stats.size}/${maxSize}`)
  console.log(`  Evictions: ${stats.evictions}`)
}
```

## Cache Behavior

### Hit Scenario

```typescript
// Transaction 1: MISS
await client.simulate('txXDR1', 'sourceA')  // RPC call, store in cache

// Transaction 1 again: HIT
await client.simulate('txXDR1', 'sourceA')  // From cache, no RPC call
```

### Cache Key Variations

```typescript
// Different TXs = different cache keys
await client.simulate('txXDR1', 'sourceA')  // Key1
await client.simulate('txXDR2', 'sourceA')  // Key2 (different TX)

// Different sources = different cache keys
await client.simulate('txXDR1', 'sourceA')  // Key1
await client.simulate('txXDR1', 'sourceB')  // Key3 (different source)

// Same TX, no source = different key
await client.simulate('txXDR1', 'sourceA')  // Key1
await client.simulate('txXDR1')             // Key4 (no source)
```

### TTL Expiration

```typescript
// With TTL of 60 seconds
const result1 = await client.simulate(txXDR, source)  // MISS, cached

// Within 60 seconds
const result2 = await client.simulate(txXDR, source)  // HIT, from cache

// After 60 seconds
const result3 = await client.simulate(txXDR, source)  // MISS, expired, new RPC call
```

### LRU Eviction

```typescript
// With maxSize=2
await client.simulate('tx1', source)  // Key1 - cached
await client.simulate('tx2', source)  // Key2 - cached
// Cache full (2/2)

await client.simulate('tx3', source)  // Key3 - needs space
// Key1 (least recently used) is evicted
// Key2 and Key3 now in cache

await client.simulate('tx2', source)  // HIT, updates LRU time
await client.simulate('tx4', source)  // Key4 - needs space
// Key3 (least recently used) is evicted
// Key2 and Key4 now in cache
```

## Performance Benefits

### Reduced RPC Calls

- Every duplicate simulation avoids a network round-trip
- Typical RPC latency: 100-500ms
- Cache lookup: < 1ms

### Reduced Gas Estimation Overhead

When checking same transaction multiple times:
- First check: full simulation + RPC latency
- Subsequent checks: instant cache hits

### Example Scenario

```typescript
// Audit pipeline checking same tx 10 times
// Without cache: 10 × (100ms RPC + processing) = 1000ms+
// With cache: 1 × (100ms RPC) + 9 × (< 1ms cache hit) = ~100ms
// 10x faster!
```

## Configuration Recommendations

### For Development/Testing

```typescript
simulationCache: {
  enabled: true,
  maxSize: 100,       // Small size OK
  ttlMs: 600000       // 10 minutes
}
```

### For Production APIs

```typescript
simulationCache: {
  enabled: true,
  maxSize: 5000,      // Larger size for many users
  ttlMs: 30000        // 30 seconds (balance freshness & efficiency)
}
```

### For High-Traffic Services

```typescript
simulationCache: {
  enabled: true,
  maxSize: 10000,     // Large pool
  ttlMs: 5000         // Short TTL (5 seconds) for freshness
}
```

## Memory Considerations

Each cache entry stores:
- Simulation result object
- Expiration timestamp
- Access count
- Last accessed timestamp

Typical entry size: 200-500 bytes

Example memory usage:
- 1000 entries × 500 bytes = ~500KB
- 5000 entries × 500 bytes = ~2.5MB

## Test Coverage

Comprehensive test suite (40+ tests) covering:
- ✅ Key generation consistency
- ✅ Basic get/set/invalidate operations
- ✅ LRU eviction
- ✅ TTL expiration
- ✅ Statistics tracking
- ✅ Hit rate calculation
- ✅ Real-world scenarios

## Build & Test Results

✅ All packages compile successfully
✅ SDK: 101 tests passed (including 40+ cache tests)
✅ React: 21 tests passed
✅ No breaking changes to existing API
✅ Full backward compatibility (caching disabled by default)

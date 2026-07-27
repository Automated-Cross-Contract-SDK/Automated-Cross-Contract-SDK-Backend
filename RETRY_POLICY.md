# RetryPolicy Feature Documentation

## Overview

The Soroban Resurrect SDK now features a pluggable `RetryPolicy` interface that replaces hardcoded retry logic. This enables flexible handling of transient failures with multiple built-in strategies.

## RetryPolicy Interface

```typescript
interface RetryPolicy {
  maxRetries: number
  shouldRetry(error: SorobanResurrectError, attempt: number): boolean
  getDelay(attempt: number): number
  reset?(): void
}
```

### Methods

- **maxRetries**: Maximum number of retry attempts (1-indexed)
- **shouldRetry()**: Determines if an error should trigger a retry
  - Parameters: error (the exception), attempt (current attempt number)
  - Returns: true to retry, false to fail immediately
- **getDelay()**: Returns the delay in milliseconds before the next retry
  - Parameter: attempt (current attempt number)
- **reset()**: Optional method to reset internal state (used by CircuitBreaker)

### Error Types

Retryable errors (will retry by default):
- `NETWORK_ERROR` - Network/RPC connectivity issues
- `SIMULATION_FAILED` - Transaction simulation failed
- `ARCHIVE_DETECTION_FAILED` - Failed to query ledger entries

Non-retryable errors (fail immediately):
- `INVALID_XDR` - Malformed transaction
- `NO_ACCOUNT` - Account not found
- `RESTORE_FAILED` - Restoration transaction failed
- `ORIGINAL_TX_FAILED` - Original transaction failed after restore

## Built-in Implementations

### 1. ExponentialBackoff (Default)

**Behavior**: Delay increases linearly with attempt number

```typescript
new ExponentialBackoff(maxRetries?: number, baseDelayMs?: number)
```

**Defaults**: 3 retries, 500ms base delay

**Delays**: 500ms, 1000ms, 1500ms, ... (baseDelayMs × attempt)

**Use case**: General purpose, maintains backward compatibility

```typescript
const client = new SorobanResurrect({
  rpcUrl: '...',
  networkPassphrase: '...',
  retryPolicy: new ExponentialBackoff(3, 500)
})
```

### 2. FixedDelay

**Behavior**: Constant delay between retries

```typescript
new FixedDelay(maxRetries?: number, delayMs?: number)
```

**Defaults**: 3 retries, 1000ms delay

**Delays**: 1000ms, 1000ms, 1000ms, ...

**Use case**: Rate-limited endpoints, predictable timing

```typescript
const client = new SorobanResurrect({
  rpcUrl: '...',
  networkPassphrase: '...',
  retryPolicy: new FixedDelay(5, 2000) // 5 retries, 2 seconds each
})
```

### 3. JitterBackoff

**Behavior**: Exponential delays with random jitter to prevent thundering herd

```typescript
new JitterBackoff(
  maxRetries?: number,
  baseDelayMs?: number,
  maxJitterMs?: number
)
```

**Defaults**: 3 retries, 100ms base, 500ms max jitter

**Delays**: (baseDelay × 2^attempt) + random(0, maxJitterMs)

**Use case**: Distributed systems, load-balanced services

```typescript
const client = new SorobanResurrect({
  rpcUrl: '...',
  networkPassphrase: '...',
  retryPolicy: new JitterBackoff(3, 100, 500)
})
```

### 4. CircuitBreaker

**Behavior**: Fails fast after N consecutive failures, recovers after timeout

```typescript
new CircuitBreaker(
  maxRetries?: number,
  failureThreshold?: number,
  openCircuitTimeoutMs?: number,
  delayMs?: number
)
```

**Defaults**: 3 retries, 5 failures to open circuit, 30s timeout, 1s delay

**States**:
- **Closed**: Normal operation, retries allowed
- **Open**: After failureThreshold consecutive failures, rejects immediately
- **Half-Open**: After openCircuitTimeoutMs, allows one retry to test recovery

**Use case**: Prevent cascading failures, wait for service recovery

```typescript
const client = new SorobanResurrect({
  rpcUrl: '...',
  networkPassphrase: '...',
  retryPolicy: new CircuitBreaker(3, 5, 30000, 1000)
})
```

## Configuration

Add `retryPolicy` to `SorobanResurrectConfig`:

```typescript
interface SorobanResurrectConfig {
  rpcUrl: string
  networkPassphrase: string
  allowHttp?: boolean
  restoreFee?: string
  maxRestoreBatchSize?: number
  simulateOnly?: boolean
  retryPolicy?: RetryPolicy  // NEW
  onLog?: (level, message, data) => void
}
```

## Usage Examples

### Basic Usage (Default Behavior)

```typescript
// Uses ExponentialBackoff with 3 retries, 500ms base delay
const client = new SorobanResurrect({
  rpcUrl: 'https://soroban-testnet.stellar.org',
  networkPassphrase: 'Test SDF Network ; September 2015',
})
```

### Fixed Delay for Rate-Limited Endpoints

```typescript
const client = new SorobanResurrect({
  rpcUrl: 'https://api.example.com',
  networkPassphrase: 'Test SDF Network ; September 2015',
  retryPolicy: new FixedDelay(5, 2000) // 5 attempts, 2 seconds between each
})
```

### Jitter Backoff for Distributed Systems

```typescript
const client = new SorobanResurrect({
  rpcUrl: 'https://soroban-testnet.stellar.org',
  networkPassphrase: 'Test SDF Network ; September 2015',
  retryPolicy: new JitterBackoff(4, 50, 500) // Base 50ms, up to 500ms jitter
})
```

### Circuit Breaker for Resilience

```typescript
const client = new SorobanResurrect({
  rpcUrl: 'https://soroban-testnet.stellar.org',
  networkPassphrase: 'Test SDF Network ; September 2015',
  retryPolicy: new CircuitBreaker(
    3,      // maxRetries
    5,      // failureThreshold (open after 5 consecutive failures)
    30000,  // openCircuitTimeoutMs (wait 30s before retrying)
    1000    // delayMs (1s between retries when closed)
  )
})
```

### Custom Implementation

```typescript
class MyCustomPolicy implements RetryPolicy {
  readonly maxRetries = 3

  shouldRetry(error: SorobanResurrectError, attempt: number): boolean {
    // Custom logic: only retry on specific errors
    return attempt <= this.maxRetries && error.code === 'NETWORK_ERROR'
  }

  getDelay(attempt: number): number {
    // Custom delay logic: fibonacci sequence
    const fib = (n: number): number => n <= 1 ? n : fib(n - 1) + fib(n - 2)
    return fib(attempt) * 100
  }
}

const client = new SorobanResurrect({
  rpcUrl: '...',
  networkPassphrase: '...',
  retryPolicy: new MyCustomPolicy()
})
```

## Migration from Hardcoded Retry

### Before

```typescript
// Hardcoded: 3 retries with 500ms × attempt delay
const client = new SorobanResurrect(config)
```

### After (No Changes Required)

```typescript
// Still uses ExponentialBackoff(3, 500) by default - backward compatible!
const client = new SorobanResurrect(config)
```

### Custom Behavior

```typescript
// Now you can customize retry behavior
const client = new SorobanResurrect({
  ...config,
  retryPolicy: new FixedDelay(5, 1000)
})
```

## Best Practices

1. **For Simple Cases**: Use the default `ExponentialBackoff` - it maintains backward compatibility
2. **For Rate-Limited APIs**: Use `FixedDelay` with appropriate interval
3. **For Distributed Systems**: Use `JitterBackoff` to prevent thundering herd
4. **For High Availability**: Use `CircuitBreaker` to fail fast and allow recovery
5. **Custom Policies**: Implement `RetryPolicy` for domain-specific requirements

## Testing

All retry policies are thoroughly tested:

```bash
npm run test -- retry-policy.test.ts
```

Tests cover:
- Delay calculations for each strategy
- Retry/no-retry decision logic
- Error type handling
- State transitions (CircuitBreaker)
- Timeout behavior
- Integration with SorobanResurrect

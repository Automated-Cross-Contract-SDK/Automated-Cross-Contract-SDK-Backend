import type { xdr, SorobanRpc } from '@stellar/stellar-sdk'

/**
 * Network condition to simulate for an RPC endpoint.
 */
export type NetworkCondition = 'healthy' | 'timeout' | 'error' | 'slow'

/**
 * A simulated ledger entry with optional TTL metadata used to determine
 * whether the entry should be considered "archived" (expired).
 */
export interface SimulatedLedgerEntry {
  key: xdr.LedgerKey
  keyBase64: string
  /** The XDR-encoded ledger entry data. */
  data: string
  /** The ledger sequence at which this entry was last live. */
  lastLiveLedgerSeq: number
  /** TTL (in ledgers) for this entry. Defaults to 4_095_360 (30 days). */
  ttl: number
  /** The entry type classification. */
  entryType: 'contractData' | 'contractCode' | 'contractInstance' | 'ttlEntry' | 'unknown'
  /** Optional contract ID when applicable. */
  contractId?: string
}

/**
 * A single recorded RPC interaction that can be replayed.
 */
export interface RecordedInteraction {
  /** The RPC method name (e.g. 'simulateTransaction', 'getLedgerEntries'). */
  method: string
  /** The serialised request params. */
  requestParams: unknown[]
  /** The serialised response to return. */
  response: unknown
  /** The network condition to simulate for this interaction. */
  networkCondition: NetworkCondition
  /** Artificial delay in milliseconds (only applied when condition is 'slow'). */
  delayMs: number
}

/**
 * Configuration for the MockRpcServer.
 */
export interface MockRpcConfig {
  /** Initial network condition for all methods. Defaults to 'healthy'. */
  networkCondition?: NetworkCondition
  /** Delay in ms for 'slow' condition. Defaults to 2000. */
  slowDelayMs?: number
  /** Error message to throw for 'error' condition. */
  errorMessage?: string
  /** The current ledger sequence (affects TTL expiry calculations). */
  currentLedgerSeq?: number
  /** Whether to allow HTTP (non-HTTPS) URLs. */
  allowHttp?: boolean
  /** Network passphrase returned by getNetwork(). Defaults to testnet passphrase. */
  networkPassphrase?: string
  /** Protocol version returned by getNetwork(). Defaults to 22. */
  protocolVersion?: number
}

/**
 * Options for pre-loading ledger entries into the mock.
 */
export interface LedgerStateOptions {
  /** Initial list of ledger entries. */
  entries?: SimulatedLedgerEntry[]
  /** Default TTL (in ledgers) for entries that don't specify one. */
  defaultTtl?: number
}

/**
 * Options for network condition simulation at a per-method level.
 */
export interface NetworkSimulationOptions {
  /** Condition to simulate. */
  condition: NetworkCondition
  /** Delay in ms for 'slow' condition. */
  delayMs?: number
  /** Custom error message for 'error' condition. */
  errorMessage?: string
}

/**
 * A fixture file containing recorded RPC interactions.
 */
export interface RpcFixture {
  /** Human-readable name for the fixture. */
  name: string
  /** The recorded interactions. */
  interactions: RecordedInteraction[]
  /** Optional metadata about when/where the fixture was recorded. */
  metadata?: {
    recordedAt?: string
    rpcUrl?: string
    networkPassphrase?: string
    description?: string
  }
}

/**
 * Statistics gathered by the mock RPC server for test assertions.
 */
export interface MockRpcStats {
  /** Total number of RPC calls made. */
  totalCalls: number
  /** Calls broken down by method name. */
  callsByMethod: Record<string, number>
  /** Number of calls that resulted in a timeout. */
  timeouts: number
  /** Number of calls that resulted in an error. */
  errors: number
  /** Number of 'slow' responses returned. */
  slowResponses: number
  /** Total artificial delay added (ms). */
  totalDelayMs: number
}

/**
 * Override for a specific RPC method's behaviour.
 */
export interface MethodOverride {
  /** The method to override. */
  method: string
  /** A function returning the response to return instead of the normal logic. */
  handler: (params: unknown[]) => unknown | Promise<unknown>
}

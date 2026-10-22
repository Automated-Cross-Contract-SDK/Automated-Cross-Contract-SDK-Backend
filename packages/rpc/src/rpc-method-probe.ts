/**
 * RPC method availability probe.
 *
 * Stellar RPC does not publish a method list, so the probe sends each method
 * an empty-params JSON-RPC request. A `-32601` ("method not found") error
 * marks the method as missing. Any other response, including an invalid-params
 * error, shows the method exists. Empty params never submit or mutate anything.
 */

/** Methods a restore flow cannot run without. */
export const RESTORE_REQUIRED_METHODS = [
  'getLedgerEntries',
  'simulateTransaction',
  'sendTransaction',
  'getTransaction',
] as const

export type RestoreRequiredMethod = (typeof RESTORE_REQUIRED_METHODS)[number]

/** JSON-RPC 2.0 error code for an unknown method. */
export const JSON_RPC_METHOD_NOT_FOUND = -32601

export interface RpcMethodProbeResult {
  /** Methods the endpoint answered as existing. */
  available: string[]
  /** Methods the endpoint reported as not found. */
  missing: string[]
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

interface JsonRpcResponse {
  result?: unknown
  error?: { code?: number; message?: string }
}

/**
 * Probes each method on the endpoint and classifies it as available or missing.
 *
 * Throws if the endpoint cannot be reached or does not return a JSON-RPC
 * body. Callers should treat a throw as a transport failure, not as a
 * missing method.
 */
export async function probeRpcMethods(
  url: string,
  methods: readonly string[],
  fetchImpl: FetchLike = fetch,
): Promise<RpcMethodProbeResult> {
  const available: string[] = []
  const missing: string[] = []

  for (const [index, method] of methods.entries()) {
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: index + 1, method, params: [] }),
    })
    if (!response.ok) {
      throw new Error(`RPC probe for ${method} returned HTTP ${response.status}`)
    }

    const body = (await response.json()) as JsonRpcResponse
    if (body.error?.code === JSON_RPC_METHOD_NOT_FOUND) {
      missing.push(method)
    } else {
      available.push(method)
    }
  }

  return { available, missing }
}

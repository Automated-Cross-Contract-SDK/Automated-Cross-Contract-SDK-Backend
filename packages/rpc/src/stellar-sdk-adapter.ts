import { SorobanRpc, Account, Transaction, xdr } from '@stellar/stellar-sdk'
import type {
  SorobanRpcClient,
  SorobanRpcApiSimulateTransactionResponse,
  SorobanRpcApiSendTransactionResponse,
  SorobanRpcApiGetTransactionResponse,
  SorobanRpcApiGetLedgerEntriesResponse,
  SorobanRpcApiNetworkInfo,
} from '@soroban-resurrect/types'

/**
 * Adapter that wraps @stellar/stellar-sdk's SorobanRpc.Server to implement
 * the SorobanRpcClient interface.
 *
 * This allows SorobanResurrect to work with the standard Stellar SDK while
 * maintaining flexibility to use alternative implementations.
 */
export class StellarSdkRpcAdapter implements SorobanRpcClient {
  private server: SorobanRpc.Server

  constructor(server: SorobanRpc.Server) {
    this.server = server
  }

  async getAccount(publicKey: string): Promise<Account> {
    return this.server.getAccount(publicKey)
  }

  async simulateTransaction(tx: Transaction): Promise<SorobanRpcApiSimulateTransactionResponse> {
    const result = await this.server.simulateTransaction(tx)
    // Convert Stellar SDK types to our interface types
    return this.convertSimulateResponse(result)
  }

  async sendTransaction(tx: Transaction): Promise<SorobanRpcApiSendTransactionResponse> {
    const result = await this.server.sendTransaction(tx)
    return this.convertSendResponse(result)
  }

  async getTransaction(hash: string): Promise<SorobanRpcApiGetTransactionResponse> {
    const result = await this.server.getTransaction(hash)
    return this.convertGetTransactionResponse(result)
  }

  async getLedgerEntries(...keys: xdr.LedgerKey[]): Promise<SorobanRpcApiGetLedgerEntriesResponse> {
    const result = await this.server.getLedgerEntries(...keys)
    return this.convertGetLedgerEntriesResponse(result)
  }

  async getNetwork(): Promise<SorobanRpcApiNetworkInfo> {
    const result = await this.server.getNetwork()
    return this.convertNetworkInfo(result)
  }

  /**
   * Get the underlying SorobanRpc.Server instance.
   * This is useful for accessing SDK-specific features not covered by the interface.
   */
  getUnderlyingServer(): SorobanRpc.Server {
    return this.server
  }

  // --- Private conversion methods ---

  private convertSimulateResponse(
    response: SorobanRpc.Api.SimulateTransactionResponse
  ): SorobanRpcApiSimulateTransactionResponse {
    // The SDK response types are compatible with our interface types
    return response as unknown as SorobanRpcApiSimulateTransactionResponse
  }

  private convertSendResponse(
    response: SorobanRpc.Api.SendTransactionResponse
  ): SorobanRpcApiSendTransactionResponse {
    return response as unknown as SorobanRpcApiSendTransactionResponse
  }

  private convertGetTransactionResponse(
    response: SorobanRpc.Api.GetTransactionResponse
  ): SorobanRpcApiGetTransactionResponse {
    return response as unknown as SorobanRpcApiGetTransactionResponse
  }

  private convertGetLedgerEntriesResponse(
    response: SorobanRpc.Api.GetLedgerEntriesResponse
  ): SorobanRpcApiGetLedgerEntriesResponse {
    return response as unknown as SorobanRpcApiGetLedgerEntriesResponse
  }

  private convertNetworkInfo(
    response: SorobanRpc.Api.NetworkInfo
  ): SorobanRpcApiNetworkInfo {
    return response as unknown as SorobanRpcApiNetworkInfo
  }
}

/**
 * Create a StellarSdkRpcAdapter from an RPC URL and options.
 * This is a convenience function for quick instantiation.
 */
export function createStellarSdkAdapter(
  rpcUrl: string,
  options?: SorobanRpc.Server.Options
): StellarSdkRpcAdapter {
  const server = new SorobanRpc.Server(rpcUrl, options)
  return new StellarSdkRpcAdapter(server)
}

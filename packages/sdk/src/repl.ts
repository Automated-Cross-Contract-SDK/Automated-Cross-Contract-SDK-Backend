import repl from 'repl'

// Pre-import common modules for REPL convenience
import {
  SorobanResurrect,
  extractKeysFromFootprint,
  classifyLedgerKey,
  classifySacKey,
  encodeLedgerKey,
  extractFootprintFromTransaction,
  FootprintCache,
  SimulationCache,
  RpcFailoverManager,
  VersionNegotiator,
} from './index.js'

// Create REPL server with pre-imported modules
const replServer = repl.start({
  prompt: 'soroban-resurrect> ',
  useColors: true,
})

// Make common imports available in REPL context
replServer.context.SorobanResurrect = SorobanResurrect
replServer.context.extractKeysFromFootprint = extractKeysFromFootprint
replServer.context.classifyLedgerKey = classifyLedgerKey
replServer.context.classifySacKey = classifySacKey
replServer.context.encodeLedgerKey = encodeLedgerKey
replServer.context.extractFootprintFromTransaction = extractFootprintFromTransaction
replServer.context.FootprintCache = FootprintCache
replServer.context.SimulationCache = SimulationCache
replServer.context.RpcFailoverManager = RpcFailoverManager
replServer.context.VersionNegotiator = VersionNegotiator

// Add helper function for XDR generation testing
replServer.context.createTestConfig = (rpcUrl?: string, networkPassphrase?: string) => ({
  rpcUrl: rpcUrl || 'https://soroban-testnet.stellar.org',
  networkPassphrase: networkPassphrase || 'Test SDF Network ; September 2015',
})

// Add helper for mock server setup
replServer.context.help = () => {
  console.log(`
Available functions and modules:
  - SorobanResurrect: Main SDK class for state restoration
  - extractKeysFromFootprint: Extract keys from transaction footprint
  - classifyLedgerKey: Classify ledger key types
  - FootprintCache: Cache for footprint operations
  - SimulationCache: Cache for simulation results
  - RpcFailoverManager: Manage multiple RPC endpoints
  - VersionNegotiator: Handle protocol version compatibility
  - createTestConfig(rpcUrl, networkPassphrase): Helper to create test config
  - help(): Display this message

Example:
  const sdk = new SorobanResurrect(createTestConfig())
  await sdk.checkTransaction(xdrString)
  `)
}

console.log('Soroban Resurrect REPL - type help() for available functions')

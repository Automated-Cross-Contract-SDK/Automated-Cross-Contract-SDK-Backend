/**
 * Integration tests for SAC (Stellar Asset Contract) support.
 *
 * These tests run against the Soroban testnet and are gated by the
 * `RUN_INTEGRATION_TESTS=true` environment variable.  They verify that the
 * SDK can detect and classify archived entries produced by the native XLM SAC
 * (`CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC` on testnet)
 * as well as custom fungible-token SAC instances.
 *
 * SAC contracts store the following `ContractData` entry types that the SDK
 * must handle (issue #47):
 *
 *   - `Balance`    – per-account token balance
 *   - `Allowance`  – delegated spend allowance
 *   - `Admin`      – administrator address
 *   - `Nonce`      – replay-protection counter
 *   - `Name` / `Symbol` / `Decimals` – token metadata
 *
 * The contract's own instance entry (`ContractInstance`) must also be detected
 * and prioritised during restoration (issue #48).
 *
 * Restoration requirements:
 *
 * 1. If a SAC's `ContractInstance` entry is archived, it **must** be restored
 *    first — before any `ContractData` entries for that contract.  The Soroban
 *    VM refuses to access `ContractData` belonging to an archived instance.
 *
 * 2. SAC `ContractData` entries share the same ledger TTL mechanics as
 *    ordinary Soroban data entries.  They are restored using the standard
 *    `RestoreFootprint` operation.
 *
 * 3. The SDK surfaces a `sacKeyType` field on each archived key to help
 *    callers understand which SAC storage slot is affected.
 */
import { describe, it, expect } from 'vitest'
import { SorobanResurrect } from '../src/soroban-resurrect.js'
import { classifyLedgerKey, classifySacKey } from '../src/footprint-parser.js'
import { SorobanResurrectError } from '../src/types.js'

const RPC_URL = process.env.SOROBAN_RPC_URL ?? 'https://soroban-testnet.stellar.org'
const NETWORK_PASSPHRASE =
  process.env.SOROBAN_NETWORK_PASSPHRASE ?? 'Test SDF Network ; September 2015'
const RUN_INTEGRATION = process.env.RUN_INTEGRATION_TESTS === 'true'

/**
 * Well-known testnet SAC contract ID for the native XLM asset.
 * This contract is deployed on every Soroban testnet reset.
 */
const NATIVE_XLM_SAC = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC'

const itIf = RUN_INTEGRATION ? it : it.skip

describe('SAC Integration Tests [integration]', () => {
  const client = new SorobanResurrect({
    rpcUrl: RPC_URL,
    networkPassphrase: NETWORK_PASSPHRASE,
    allowHttp: true,
  })

  itIf('can query ContractInstance entry for the native XLM SAC', async () => {
    const { xdr, StrKey } = await import('@stellar/stellar-sdk')

    // Build the LedgerKey for the ContractInstance entry of the native SAC
    const contractIdBytes = StrKey.decodeContract(NATIVE_XLM_SAC)
    const instanceKey = xdr.LedgerKey.contractData(
      new xdr.LedgerKeyContractData({
        contract: xdr.ScAddress.scAddressTypeContract(contractIdBytes),
        key: xdr.ScVal.scvLedgerKeyContractInstance(),
        durability: xdr.ContractDataDurability.persistent(),
      }),
    )

    const response = await client.getRpcServer().getLedgerEntries(instanceKey)

    // The native SAC's instance entry should always be live on testnet
    expect(response.entries.length).toBeGreaterThanOrEqual(1)

    // Classify the key and verify it's recognised as contractInstance
    const classification = classifyLedgerKey(instanceKey)
    expect(classification.keyType).toBe('contractInstance')
    expect(classification.restorePriority).toBe(0)
  })

  itIf('classifies SAC Balance ledger key correctly', async () => {
    const { xdr, Keypair } = await import('@stellar/stellar-sdk')

    const accountId = Keypair.random().publicKey()
    const { StrKey } = await import('@stellar/stellar-sdk')
    const contractIdBytes = StrKey.decodeContract(NATIVE_XLM_SAC)

    const balanceKey = xdr.LedgerKey.contractData(
      new xdr.LedgerKeyContractData({
        contract: xdr.ScAddress.scAddressTypeContract(contractIdBytes),
        key: xdr.ScVal.scvVec([
          xdr.ScVal.scvSymbol('Balance'),
          xdr.ScVal.scvAddress(
            xdr.ScAddress.scAddressTypeAccount(
              xdr.AccountID.publicKeyTypeEd25519(StrKey.decodeEd25519PublicKey(accountId)),
            ),
          ),
        ]),
        durability: xdr.ContractDataDurability.persistent(),
      }),
    )

    const classification = classifyLedgerKey(balanceKey)
    expect(classification.keyType).toBe('contractData')
    expect(classification.sacKeyType).toBe('sacBalance')
    expect(classification.restorePriority).toBe(2)
  })

  itIf('prioritises ContractInstance before ContractData in restoration order', async () => {
    // Simulate a mixed archived-key set and verify priority ordering
    const { xdr, StrKey } = await import('@stellar/stellar-sdk')
    const contractIdBytes = StrKey.decodeContract(NATIVE_XLM_SAC)

    const instanceKey = xdr.LedgerKey.contractData(
      new xdr.LedgerKeyContractData({
        contract: xdr.ScAddress.scAddressTypeContract(contractIdBytes),
        key: xdr.ScVal.scvLedgerKeyContractInstance(),
        durability: xdr.ContractDataDurability.persistent(),
      }),
    )

    const adminKey = xdr.LedgerKey.contractData(
      new xdr.LedgerKeyContractData({
        contract: xdr.ScAddress.scAddressTypeContract(contractIdBytes),
        key: xdr.ScVal.scvSymbol('Admin'),
        durability: xdr.ContractDataDurability.persistent(),
      }),
    )

    const instanceClass = classifyLedgerKey(instanceKey)
    const adminClass = classifyLedgerKey(adminKey)

    expect(instanceClass.restorePriority).toBeLessThan(adminClass.restorePriority)
  })

  itIf('throws SorobanResurrectError for invalid XDR', async () => {
    await expect(client.simulate('not-valid-xdr')).rejects.toThrow(SorobanResurrectError)
  })
})

/**
 * Pre-built multi-contract restoration scenarios.
 *
 * Each entry documents a cross-contract call graph, the transaction XDR that
 * triggers it, the ledger keys expected to be archived at simulation time, and
 * the outcome once Soroban-Resurrect restores them ahead of execution.
 *
 * The XDR strings are illustrative fixtures for the example dApp. Replace them
 * with freshly built envelopes for your own network before executing.
 */

export type ArchivedKeyKind = 'contract_code' | 'contract_data' | 'sac_balance'

export interface ScenarioArchivedKey {
  kind: ArchivedKeyKind
  /** Human-readable description of the entry that is archived. */
  description: string
}

export interface RestorationScenario {
  id: string
  title: string
  /** Contract call graph, e.g. "A → B → C". */
  callGraph: string
  description: string
  /** Illustrative transaction XDR (base64). */
  xdr: string
  expectedArchivedKeys: ScenarioArchivedKey[]
  /** What happens after Soroban-Resurrect runs the restore flow. */
  restorationOutcome: string
}

export const scenarios: RestorationScenario[] = [
  {
    id: 'two-contract-simple',
    title: '2-contract simple call',
    callGraph: 'A → B',
    description:
      'Contract A invokes a single method on Contract B. B has been idle long enough that its instance storage entry is archived.',
    xdr: 'AAAAAgAAAAA2Contract2SimpleCallExampleXDRPayloadPlaceholder0001==',
    expectedArchivedKeys: [
      { kind: 'contract_data', description: 'Contract B instance storage entry' },
    ],
    restorationOutcome:
      'One RestoreFootprintOp bumps Contract B’s instance entry back to a live TTL; the original A → B call then simulates and executes normally.',
  },
  {
    id: 'three-contract-chain',
    title: '3-contract chain',
    callGraph: 'A → B → C',
    description:
      'A calls B, which in turn calls C. Both B and C have archived contract-data entries discovered only after the first archived layer is restored.',
    xdr: 'AAAAAgAAAAA3ContractChainABCExampleXDRPayloadPlaceholder0002======',
    expectedArchivedKeys: [
      { kind: 'contract_data', description: 'Contract B persistent storage entry' },
      { kind: 'contract_data', description: 'Contract C persistent storage entry' },
    ],
    restorationOutcome:
      'Iterative restoration: the first pass restores B, re-simulation reveals C, a second RestoreFootprintOp restores C, and the chain executes.',
  },
  {
    id: 'five-contract-fan-out',
    title: '5-contract fan-out',
    callGraph: 'A → (B, C, D, E)',
    description:
      'Contract A dispatches to four sibling contracts in a single transaction. Three of the four targets have archived code entries.',
    xdr: 'AAAAAgAAAAA5ContractFanOutABCDEExampleXDRPayloadPlaceholder0003==',
    expectedArchivedKeys: [
      { kind: 'contract_code', description: 'Contract C Wasm code entry' },
      { kind: 'contract_code', description: 'Contract D Wasm code entry' },
      { kind: 'contract_data', description: 'Contract E instance storage entry' },
    ],
    restorationOutcome:
      'A single RestoreFootprintOp batches all three archived keys into one footprint; the fan-out then executes in one transaction.',
  },
  {
    id: 'code-and-data-expiry-combo',
    title: 'Contract code + data expiry combo',
    callGraph: 'A → B',
    description:
      'Contract B has both its Wasm code entry and its instance storage entry archived at the same time (deployed once, never re-used).',
    xdr: 'AAAAAgAAAAACodeAndDataExpiryComboExampleXDRPayloadPlaceholder0004=',
    expectedArchivedKeys: [
      { kind: 'contract_code', description: 'Contract B Wasm code (ContractCode ledger entry)' },
      { kind: 'contract_data', description: 'Contract B instance storage (ContractData ledger entry)' },
    ],
    restorationOutcome:
      'Both keys are restored together in one footprint. Order is irrelevant — the RestoreFootprintOp treats them as a set.',
  },
  {
    id: 'sac-transfer-expired-entries',
    title: 'SAC token transfer with expired entries',
    callGraph: 'A → SAC',
    description:
      'A transfers a Stellar Asset Contract token. Both the sender and receiver balance entries have been archived through inactivity.',
    xdr: 'AAAAAgAAAAAASACTokenTransferExpiredEntriesExampleXDRPayload0005==',
    expectedArchivedKeys: [
      { kind: 'sac_balance', description: 'SAC sender Balance persistent entry' },
      { kind: 'sac_balance', description: 'SAC receiver Balance persistent entry' },
    ],
    restorationOutcome:
      'Both Balance entries are restored, preserving their stored amounts; the transfer then debits and credits as usual.',
  },
  {
    id: 'complex-with-auth-entries',
    title: 'Complex scenario with auth entries',
    callGraph: 'A → B → C  (+ SorobanAuthorization)',
    description:
      'A multi-hop call that also carries signed Soroban authorization entries. Restoration must not invalidate the auth nonce footprint.',
    xdr: 'AAAAAgAAAAAAComplexScenarioWithAuthEntriesExampleXDRPayload0006==',
    expectedArchivedKeys: [
      { kind: 'contract_data', description: 'Contract B persistent storage entry' },
      { kind: 'contract_data', description: 'Contract C persistent storage entry' },
      { kind: 'contract_data', description: 'Nonce entry referenced by the auth footprint' },
    ],
    restorationOutcome:
      'The restore flow bumps the storage and nonce entries without consuming the nonce, so the original signed auth entries remain valid and the call executes.',
  },
]

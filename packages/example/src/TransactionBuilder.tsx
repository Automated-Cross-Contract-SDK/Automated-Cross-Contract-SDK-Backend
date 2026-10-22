/**
 * Visual transaction builder — constructs Soroban invoke-contract transactions
 * through a step-by-step wizard instead of hand-editing XDR.
 *
 * Steps: 1) target & network → 2) method & typed args → 3) review & build XDR →
 * 4) check with SorobanResurrect & execute.
 */

import { useCallback, useMemo, useState } from 'react'
import {
  Account,
  BASE_FEE,
  Contract,
  nativeToScVal,
  Networks,
  TransactionBuilder as StellarTxBuilder,
} from '@stellar/stellar-sdk'
import { useSorobanResurrect } from '@soroban-resurrect/react'
import { Button, Card, Field, inputStyle, useToast } from './components'
import { scenarios } from './scenarios'
import { tokens } from './theme'

type ArgType = 'address' | 'u64' | 'i128' | 'bytes' | 'string'
interface ArgRow {
  type: ArgType
  value: string
}

const ARG_TYPES: ArgType[] = ['address', 'u64', 'i128', 'bytes', 'string']

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/^0x/, '').replace(/\s+/g, '')
  const out = new Uint8Array(Math.floor(clean.length / 2))
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.substr(i * 2, 2), 16)
  }
  return out
}

const NETWORKS = {
  testnet: {
    label: 'Testnet',
    rpcUrl: 'https://soroban-testnet.stellar.org',
    passphrase: Networks.TESTNET,
  },
  futurenet: {
    label: 'Futurenet',
    rpcUrl: 'https://rpc-futurenet.stellar.org',
    passphrase: Networks.FUTURENET,
  },
} as const

type NetworkId = keyof typeof NETWORKS | 'custom'

// Known contract IDs offered in the dropdown (dApp-configured + scenario targets).
const KNOWN_CONTRACTS: string[] = [
  'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC',
  'CA3D5KRYM6CB7OWQ6TWYRR3Z4T7GNZLKERYNZGGA5SOAOPIFY6YQGAXE',
  ...scenarios.map((s) => s.id),
]

function toScVal(row: ArgRow) {
  switch (row.type) {
    case 'address':
      return nativeToScVal(row.value.trim(), { type: 'address' })
    case 'u64':
      return nativeToScVal(BigInt(row.value.trim() || '0'), { type: 'u64' })
    case 'i128':
      return nativeToScVal(BigInt(row.value.trim() || '0'), { type: 'i128' })
    case 'bytes':
      return nativeToScVal(hexToBytes(row.value), { type: 'bytes' })
    case 'string':
      return nativeToScVal(row.value, { type: 'string' })
  }
}

export function TransactionBuilder({ sourceAccount }: { sourceAccount: string | null }) {
  const toast = useToast()
  const [step, setStep] = useState(1)

  const [network, setNetwork] = useState<NetworkId>('testnet')
  const [customRpc, setCustomRpc] = useState('')
  const [customPassphrase, setCustomPassphrase] = useState('')
  const [contractId, setContractId] = useState(KNOWN_CONTRACTS[0])
  const [method, setMethod] = useState('')
  const [args, setArgs] = useState<ArgRow[]>([])
  const [feeOverride, setFeeOverride] = useState('')
  const [xdrOut, setXdrOut] = useState('')
  const [buildError, setBuildError] = useState<string | null>(null)

  const resolved = useMemo(() => {
    if (network === 'custom') {
      return { rpcUrl: customRpc, passphrase: customPassphrase }
    }
    return { rpcUrl: NETWORKS[network].rpcUrl, passphrase: NETWORKS[network].passphrase }
  }, [network, customRpc, customPassphrase])

  const fee = feeOverride.trim() || BASE_FEE

  const { checkTransaction, executeWithRestore, isChecking, isExecuting, needsRestore, archivedKeys } =
    useSorobanResurrect({ rpcUrl: resolved.rpcUrl, networkPassphrase: resolved.passphrase })

  const buildXdr = useCallback(() => {
    setBuildError(null)
    if (!sourceAccount) {
      setBuildError('Connect Freighter first to set the transaction source account.')
      return
    }
    try {
      const source = new Account(sourceAccount, '0')
      const contract = new Contract(contractId)
      const op = contract.call(method.trim(), ...args.map(toScVal))
      const tx = new StellarTxBuilder(source, { fee, networkPassphrase: resolved.passphrase })
        .addOperation(op)
        .setTimeout(30)
        .build()
      const built = tx.toXDR()
      setXdrOut(built)
      setStep(3)
    } catch (err) {
      setBuildError(err instanceof Error ? err.message : String(err))
    }
  }, [sourceAccount, contractId, method, args, fee, resolved.passphrase])

  const signWithFreighter = useCallback(
    async (unsignedXdr: string) => {
      if (!window.freighter) throw new Error('Freighter not connected')
      return window.freighter.signTransaction(unsignedXdr, { networkPassphrase: resolved.passphrase })
    },
    [resolved.passphrase],
  )

  const runCheck = useCallback(async () => {
    try {
      const result = await checkTransaction(xdrOut)
      toast(
        result.needsRestoration
          ? `Restoration needed: ${result.archivedKeys.length} archived key(s)`
          : 'No restoration needed — ready to execute',
        result.needsRestoration ? 'info' : 'success',
      )
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Check failed', 'error')
    }
  }, [checkTransaction, xdrOut, toast])

  const runExecute = useCallback(async () => {
    if (!sourceAccount) {
      toast('Connect Freighter before executing', 'error')
      return
    }
    try {
      const result = await executeWithRestore(xdrOut, signWithFreighter)
      toast(
        result.success
          ? `Executed. Restored ${result.entriesRestored} entr${result.entriesRestored === 1 ? 'y' : 'ies'}.`
          : 'Execution reported failure',
        result.success ? 'success' : 'error',
      )
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Execution failed', 'error')
    }
  }, [executeWithRestore, xdrOut, signWithFreighter, sourceAccount, toast])

  return (
    <Card style={{ marginTop: tokens.space.xl }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h2 style={{ margin: 0, fontSize: tokens.font.size.lg }}>Transaction Builder</h2>
        <span style={{ color: 'var(--text-muted)', fontSize: tokens.font.size.sm }}>Step {step} of 3</span>
      </div>

      {step === 1 && (
        <div style={{ marginTop: tokens.space.md }}>
          <Field label="Network" htmlFor="tb-network">
            <select
              id="tb-network"
              value={network}
              onChange={(e) => setNetwork(e.target.value as NetworkId)}
              style={inputStyle}
            >
              <option value="testnet">Testnet</option>
              <option value="futurenet">Futurenet</option>
              <option value="custom">Custom…</option>
            </select>
          </Field>
          {network === 'custom' && (
            <>
              <Field label="Custom RPC URL" htmlFor="tb-rpc">
                <input id="tb-rpc" style={inputStyle} value={customRpc} onChange={(e) => setCustomRpc(e.target.value)} />
              </Field>
              <Field label="Custom network passphrase" htmlFor="tb-pass">
                <input
                  id="tb-pass"
                  style={inputStyle}
                  value={customPassphrase}
                  onChange={(e) => setCustomPassphrase(e.target.value)}
                />
              </Field>
            </>
          )}
          <Field label="Contract ID" htmlFor="tb-contract">
            <input
              id="tb-contract"
              list="tb-known-contracts"
              style={inputStyle}
              value={contractId}
              onChange={(e) => setContractId(e.target.value)}
            />
            <datalist id="tb-known-contracts">
              {KNOWN_CONTRACTS.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>
          <Button onClick={() => setStep(2)} disabled={!contractId.trim()}>
            Next
          </Button>
        </div>
      )}

      {step === 2 && (
        <div style={{ marginTop: tokens.space.md }}>
          <Field label="Method name" htmlFor="tb-method">
            <input id="tb-method" style={inputStyle} value={method} onChange={(e) => setMethod(e.target.value)} />
          </Field>

          <div style={{ marginBottom: tokens.space.md }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: tokens.space.xs }}>
              <span style={{ fontWeight: 600 }}>Arguments</span>
              <Button variant="ghost" onClick={() => setArgs((a) => [...a, { type: 'address', value: '' }])}>
                + Add arg
              </Button>
            </div>
            {args.map((row, i) => (
              <div key={i} style={{ display: 'flex', gap: tokens.space.sm, marginBottom: tokens.space.sm }}>
                <select
                  aria-label={`Argument ${i + 1} type`}
                  value={row.type}
                  onChange={(e) =>
                    setArgs((a) => a.map((r, j) => (j === i ? { ...r, type: e.target.value as ArgType } : r)))
                  }
                  style={{ ...inputStyle, width: 120 }}
                >
                  {ARG_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <input
                  aria-label={`Argument ${i + 1} value`}
                  style={inputStyle}
                  value={row.value}
                  placeholder={row.type === 'bytes' ? 'hex' : row.type}
                  onChange={(e) => setArgs((a) => a.map((r, j) => (j === i ? { ...r, value: e.target.value } : r)))}
                />
                <Button variant="secondary" onClick={() => setArgs((a) => a.filter((_, j) => j !== i))}>
                  ✕
                </Button>
              </div>
            ))}
          </div>

          <Field label="Fee (stroops, optional override)" htmlFor="tb-fee">
            <input
              id="tb-fee"
              style={inputStyle}
              value={feeOverride}
              placeholder={BASE_FEE}
              onChange={(e) => setFeeOverride(e.target.value)}
            />
          </Field>
          <div style={{ color: 'var(--text-muted)', fontSize: tokens.font.size.sm, marginBottom: tokens.space.md }}>
            Effective fee: {fee} stroops
          </div>

          {buildError && (
            <div style={{ color: 'var(--danger-text)', marginBottom: tokens.space.sm }}>{buildError}</div>
          )}
          <div style={{ display: 'flex', gap: tokens.space.sm }}>
            <Button variant="secondary" onClick={() => setStep(1)}>
              Back
            </Button>
            <Button onClick={buildXdr} disabled={!method.trim()}>
              Generate XDR
            </Button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div style={{ marginTop: tokens.space.md }}>
          <Field label="Generated transaction XDR" htmlFor="tb-xdr">
            <textarea id="tb-xdr" readOnly rows={5} style={{ ...inputStyle, fontFamily: tokens.font.mono }} value={xdrOut} />
          </Field>

          {archivedKeys.length > 0 && (
            <div
              style={{
                padding: tokens.space.md,
                background: 'var(--warning-bg)',
                color: 'var(--warning-text)',
                borderRadius: tokens.radius.md,
                marginBottom: tokens.space.md,
                fontSize: tokens.font.size.sm,
              }}
            >
              {archivedKeys.length} archived key(s) detected — execution will restore them first.
            </div>
          )}

          <div style={{ display: 'flex', gap: tokens.space.sm, flexWrap: 'wrap' }}>
            <Button variant="secondary" onClick={() => setStep(2)}>
              Back
            </Button>
            <Button variant="ghost" loading={isChecking} onClick={runCheck}>
              Check with SorobanResurrect
            </Button>
            <Button loading={isExecuting} onClick={runExecute}>
              {needsRestore ? 'Execute with Restoration' : 'Execute'}
            </Button>
          </div>
        </div>
      )}
    </Card>
  )
}

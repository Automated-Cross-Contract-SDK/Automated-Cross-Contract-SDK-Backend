import { Fragment, useMemo, useState } from 'react'
import type { TransactionRecord } from '@soroban-resurrect/react'

/**
 * Restoration history viewer panel.
 *
 * Renders the list of past restoration operations tracked by
 * `useSorobanResurrect({ persistHistory: true })` (persisted to localStorage by
 * the hook). Supports status filtering, row expansion for archived-key details,
 * StellarExpert links, CSV/JSON export, and clearing the log.
 */

type StatusFilter = 'all' | 'success' | 'failed'

const STELLAR_EXPERT: Record<string, string> = {
  testnet: 'https://stellar.expert/explorer/testnet',
  public: 'https://stellar.expert/explorer/public',
}

function fmtTimestamp(ms: number): string {
  return new Date(ms).toLocaleString()
}

function fmtDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(2)} s`
  const m = Math.floor(ms / 60_000)
  const s = Math.round((ms % 60_000) / 1000)
  return `${m}m ${s}s`
}

function shortHash(hash?: string): string {
  if (!hash) return '—'
  return `${hash.slice(0, 8)}…${hash.slice(-6)}`
}

function download(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function toCSV(records: TransactionRecord[]): string {
  const header = [
    'timestamp_iso',
    'status',
    'entries_restored',
    'duration_ms',
    'original_tx_hash',
    'restore_tx_hash',
    'error',
  ]
  const rows = records.map((r) => [
    new Date(r.timestamp).toISOString(),
    r.status,
    String(r.archivedKeys?.length ?? 0),
    String(r.durationMs),
    r.originalTxHash ?? '',
    r.restoreTxHash ?? '',
    (r.error ?? '').replace(/"/g, '""'),
  ])
  return [header, ...rows]
    .map((cols) => cols.map((c) => (/[",\n]/.test(c) ? `"${c}"` : c)).join(','))
    .join('\n')
}

function StatusBadge({ status }: { status: TransactionRecord['status'] }) {
  const ok = status === 'success'
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '0.1rem 0.5rem',
        borderRadius: 999,
        fontSize: '0.75rem',
        fontWeight: 600,
        background: ok ? '#d4edda' : '#f8d7da',
        color: ok ? '#155724' : '#721c24',
      }}
    >
      {ok ? 'success' : 'failed'}
    </span>
  )
}

export function RestorationHistoryViewer({
  records,
  onClear,
  network = 'testnet',
}: {
  records: TransactionRecord[]
  onClear: () => void
  network?: 'testnet' | 'public'
}) {
  const [filter, setFilter] = useState<StatusFilter>('all')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const explorerBase = STELLAR_EXPERT[network] ?? STELLAR_EXPERT.testnet

  const filtered = useMemo(() => {
    const list = filter === 'all' ? records : records.filter((r) => r.status === filter)
    return [...list].sort((a, b) => b.timestamp - a.timestamp)
  }, [records, filter])

  const counts = useMemo(
    () => ({
      all: records.length,
      success: records.filter((r) => r.status === 'success').length,
      failed: records.filter((r) => r.status === 'failed').length,
    }),
    [records],
  )

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const handleClear = () => {
    if (window.confirm(`Clear all ${records.length} restoration history entries? This cannot be undone.`)) {
      onClear()
      setExpanded(new Set())
    }
  }

  return (
    <div
      style={{
        border: '1px solid #dee2e6',
        borderRadius: 10,
        background: 'white',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 8,
          padding: '0.9rem 1rem',
          borderBottom: '1px solid #eee',
        }}
      >
        <h3 style={{ margin: 0, fontSize: '1rem' }}>Restoration History</h3>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {(['all', 'success', 'failed'] as StatusFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                padding: '0.25rem 0.6rem',
                borderRadius: 6,
                border: '1px solid #ced4da',
                background: filter === f ? '#0d6efd' : 'white',
                color: filter === f ? 'white' : '#495057',
                fontSize: '0.78rem',
                cursor: 'pointer',
              }}
            >
              {f} ({counts[f]})
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, padding: '0.6rem 1rem', flexWrap: 'wrap' }}>
        <button
          onClick={() => download(`restoration-history-${Date.now()}.json`, JSON.stringify(records, null, 2), 'application/json')}
          disabled={records.length === 0}
          style={smallBtn(records.length === 0)}
        >
          Export JSON
        </button>
        <button
          onClick={() => download(`restoration-history-${Date.now()}.csv`, toCSV(records), 'text/csv')}
          disabled={records.length === 0}
          style={smallBtn(records.length === 0)}
        >
          Export CSV
        </button>
        <button
          onClick={handleClear}
          disabled={records.length === 0}
          style={{ ...smallBtn(records.length === 0), color: '#721c24', borderColor: '#f5c6cb' }}
        >
          Clear history
        </button>
      </div>

      {filtered.length === 0 ? (
        <p style={{ padding: '1.5rem 1rem', margin: 0, color: '#6c757d', fontSize: '0.9rem', textAlign: 'center' }}>
          {records.length === 0 ? 'No restoration operations recorded yet.' : 'No entries match this filter.'}
        </p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
            <thead>
              <tr style={{ textAlign: 'left', color: '#6c757d', background: '#f8f9fa' }}>
                <th style={th}></th>
                <th style={th}>Timestamp</th>
                <th style={th}>Status</th>
                <th style={th}>Entries Restored</th>
                <th style={th}>Duration</th>
                <th style={th}>Tx Hash</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const isOpen = expanded.has(r.id)
                const txHash = r.originalTxHash ?? r.restoreTxHash
                return (
                  <Fragment key={r.id}>
                    <tr
                      onClick={() => toggle(r.id)}
                      style={{ borderTop: '1px solid #eee', cursor: 'pointer' }}
                    >
                      <td style={{ ...td, width: 24, color: '#adb5bd' }}>{isOpen ? '▾' : '▸'}</td>
                      <td style={td}>{fmtTimestamp(r.timestamp)}</td>
                      <td style={td}>
                        <StatusBadge status={r.status} />
                      </td>
                      <td style={td}>{r.archivedKeys?.length ?? 0}</td>
                      <td style={td}>{fmtDuration(r.durationMs)}</td>
                      <td style={{ ...td, fontFamily: 'ui-monospace, monospace' }}>
                        {txHash ? (
                          <a
                            href={`${explorerBase}/tx/${txHash}`}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            style={{ color: '#0d6efd' }}
                          >
                            {shortHash(txHash)}
                          </a>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                    {isOpen && (
                      <tr style={{ background: '#f8f9fa' }}>
                        <td />
                        <td colSpan={5} style={{ padding: '0.75rem 0.6rem' }}>
                          <div style={{ display: 'grid', gap: 6 }}>
                            <DetailRow label="Operation ID" value={r.id} mono />
                            <DetailRow
                              label="Original tx"
                              value={r.originalTxHash}
                              link={r.originalTxHash ? `${explorerBase}/tx/${r.originalTxHash}` : undefined}
                              mono
                            />
                            <DetailRow
                              label="Restore tx"
                              value={r.restoreTxHash}
                              link={r.restoreTxHash ? `${explorerBase}/tx/${r.restoreTxHash}` : undefined}
                              mono
                            />
                            {r.error && <DetailRow label="Error" value={r.error} />}
                            <div>
                              <div style={{ fontWeight: 600, marginBottom: 4 }}>
                                Archived keys ({r.archivedKeys?.length ?? 0})
                              </div>
                              {r.archivedKeys && r.archivedKeys.length > 0 ? (
                                <ul style={{ margin: 0, paddingLeft: '1.1rem', fontFamily: 'ui-monospace, monospace' }}>
                                  {r.archivedKeys.map((k, i) => (
                                    <li key={i}>
                                      [{k.keyType}
                                      {k.sacKeyType ? `/${k.sacKeyType}` : ''}]{' '}
                                      {k.contractId ? `${k.contractId.slice(0, 18)}…` : ''}
                                      {typeof k.restorePriority === 'number' ? ` · p${k.restorePriority}` : ''}
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                <span style={{ color: '#6c757d' }}>None recorded.</span>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function DetailRow({
  label,
  value,
  link,
  mono,
}: {
  label: string
  value?: string
  link?: string
  mono?: boolean
}) {
  if (!value) return null
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <span style={{ color: '#6c757d', minWidth: 96 }}>{label}</span>
      {link ? (
        <a href={link} target="_blank" rel="noreferrer" style={{ color: '#0d6efd', fontFamily: mono ? 'ui-monospace, monospace' : undefined, wordBreak: 'break-all' }}>
          {value}
        </a>
      ) : (
        <span style={{ fontFamily: mono ? 'ui-monospace, monospace' : undefined, wordBreak: 'break-all' }}>{value}</span>
      )}
    </div>
  )
}

const th: React.CSSProperties = { padding: '0.5rem 0.6rem', fontWeight: 600 }
const td: React.CSSProperties = { padding: '0.5rem 0.6rem', verticalAlign: 'top' }

function smallBtn(disabled: boolean): React.CSSProperties {
  return {
    padding: '0.3rem 0.7rem',
    borderRadius: 6,
    border: '1px solid #ced4da',
    background: 'white',
    color: '#495057',
    fontSize: '0.78rem',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
  }
}

/**
 * Renders the pre-built multi-contract restoration scenarios as a reference
 * gallery: call graph, explanation, XDR payload, expected archived keys and the
 * restoration outcome for each.
 */

import { useState } from 'react'
import { Button, Card } from './components'
import { scenarios } from './scenarios'
import { tokens } from './theme'

export function Scenarios() {
  const [openId, setOpenId] = useState<string | null>(scenarios[0]?.id ?? null)

  return (
    <Card style={{ marginTop: tokens.space.xl }}>
      <h2 style={{ margin: 0, fontSize: tokens.font.size.lg }}>Multi-Contract Scenarios</h2>
      <p style={{ color: 'var(--text-muted)', fontSize: tokens.font.size.sm, marginTop: tokens.space.xs }}>
        Reference cross-contract restoration cases with example XDR payloads.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: tokens.space.sm, marginTop: tokens.space.md }}>
        {scenarios.map((s) => {
          const open = openId === s.id
          return (
            <div key={s.id} style={{ border: '1px solid var(--border)', borderRadius: tokens.radius.md }}>
              <button
                type="button"
                aria-expanded={open}
                onClick={() => setOpenId(open ? null : s.id)}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  padding: tokens.space.md,
                  background: 'transparent',
                  color: 'var(--text)',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: tokens.space.md,
                }}
              >
                <span style={{ fontWeight: 600 }}>{s.title}</span>
                <code style={{ color: 'var(--text-muted)', fontFamily: tokens.font.mono }}>{s.callGraph}</code>
              </button>

              {open && (
                <div style={{ padding: `0 ${tokens.space.md} ${tokens.space.md}`, fontSize: tokens.font.size.sm }}>
                  <p style={{ marginTop: 0 }}>{s.description}</p>

                  <strong>Expected archived keys</strong>
                  <ul style={{ marginTop: tokens.space.xs }}>
                    {s.expectedArchivedKeys.map((k, i) => (
                      <li key={i}>
                        <code style={{ fontFamily: tokens.font.mono }}>{k.kind}</code> — {k.description}
                      </li>
                    ))}
                  </ul>

                  <strong>Restoration outcome</strong>
                  <p style={{ marginTop: tokens.space.xs }}>{s.restorationOutcome}</p>

                  <details>
                    <summary style={{ cursor: 'pointer' }}>XDR payload</summary>
                    <pre
                      style={{
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-all',
                        background: 'var(--bg)',
                        border: '1px solid var(--border)',
                        borderRadius: tokens.radius.sm,
                        padding: tokens.space.sm,
                        fontFamily: tokens.font.mono,
                      }}
                    >
                      {s.xdr}
                    </pre>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        void navigator.clipboard?.writeText(s.xdr)
                      }}
                    >
                      Copy XDR
                    </Button>
                  </details>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </Card>
  )
}

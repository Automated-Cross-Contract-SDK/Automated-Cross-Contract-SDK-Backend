import { useEffect, useMemo, useRef } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'

/**
 * Animated flow diagram of the state-restoration lifecycle.
 *
 * The component is fully controlled: the parent advances `activeStep` and feeds
 * per-step counters/timings as the real SDK flow progresses (simulate -> detect
 * -> build -> execute restore -> execute original). It renders the six canonical
 * phases with framer-motion transitions, pulse animation while restoring, and a
 * confetti burst on success.
 */

export type FlowPhase =
  | 'idle'
  | 'input'
  | 'simulate'
  | 'detect'
  | 'build'
  | 'restore'
  | 'original'
  | 'done'
  | 'error'

export interface FlowStepTiming {
  /** Wall-clock ms spent in this step, filled once the step completes. */
  durationMs?: number
}

export interface RestorationFlowState {
  phase: FlowPhase
  /** Total ledger entries seen in the simulated footprint. */
  totalKeys: number
  /** Entries detected as archived / expired. */
  archivedKeys: number
  /** Entries queued into the restore transaction(s). */
  keysToRestore: number
  /** Entries confirmed restored so far. */
  keysRestored: number
  /** Restore batches: completed / total. */
  batchesDone: number
  batchesTotal: number
  /** Per-phase timings, keyed by phase name. */
  timings: Partial<Record<FlowPhase, FlowStepTiming>>
  /** Set when the flow failed; `phase` still points at the step that was running. */
  failed?: boolean
  /** Failure message, shown on the failed step. */
  error?: string
}

export const INITIAL_FLOW_STATE: RestorationFlowState = {
  phase: 'idle',
  totalKeys: 0,
  archivedKeys: 0,
  keysToRestore: 0,
  keysRestored: 0,
  batchesDone: 0,
  batchesTotal: 0,
  timings: {},
}

const STEPS: Array<{ phase: FlowPhase; title: string; blurb: string }> = [
  { phase: 'input', title: 'Original Transaction', blurb: 'Input XDR received' },
  { phase: 'simulate', title: 'Simulate', blurb: 'Scanning ledger entries' },
  { phase: 'detect', title: 'Detect Archived', blurb: 'Flagging expired entries' },
  { phase: 'build', title: 'Build Restore', blurb: 'Queuing entries to restore' },
  { phase: 'restore', title: 'Execute Restore', blurb: 'Submitting restore batches' },
  { phase: 'original', title: 'Execute Original', blurb: 'Replaying the user transaction' },
]

const PHASE_ORDER: FlowPhase[] = ['idle', 'input', 'simulate', 'detect', 'build', 'restore', 'original', 'done']

function phaseIndex(phase: FlowPhase): number {
  if (phase === 'error' || phase === 'done') return PHASE_ORDER.length - 1
  return Math.max(0, PHASE_ORDER.indexOf(phase))
}

type StepStatus = 'pending' | 'active' | 'complete' | 'error'

function stepStatus(stepPhase: FlowPhase, current: FlowPhase, failed: boolean): StepStatus {
  const si = PHASE_ORDER.indexOf(stepPhase)
  const ci = phaseIndex(current)
  if (si < ci) return 'complete'
  if (si === ci) {
    if (failed) return 'error'
    if (current === 'done') return 'complete'
    return 'active'
  }
  return 'pending'
}

function fmtMs(ms?: number): string {
  if (ms == null) return '--'
  if (ms < 1000) return `${Math.round(ms)} ms`
  return `${(ms / 1000).toFixed(2)} s`
}

/* ------------------------------------------------------------------ */
/* Confetti (dependency-free canvas burst)                              */
/* ------------------------------------------------------------------ */

function ConfettiBurst({ fire }: { fire: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const rafRef = useRef<number | null>(null)
  const reduce = useReducedMotion()

  useEffect(() => {
    if (!fire || reduce) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    ctx.scale(dpr, dpr)

    const colors = ['#0d6efd', '#198754', '#ffc107', '#dc3545', '#6f42c1', '#20c997']
    const particles = Array.from({ length: 140 }, () => ({
      x: rect.width / 2,
      y: rect.height / 3,
      vx: (Math.random() - 0.5) * 12,
      vy: Math.random() * -12 - 4,
      size: Math.random() * 6 + 3,
      color: colors[(Math.random() * colors.length) | 0],
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.4,
      life: 1,
    }))

    const start = performance.now()
    const tick = (now: number) => {
      const elapsed = now - start
      ctx.clearRect(0, 0, rect.width, rect.height)
      for (const p of particles) {
        p.vy += 0.35
        p.x += p.vx
        p.y += p.vy
        p.rot += p.vr
        p.life = Math.max(0, 1 - elapsed / 1600)
        ctx.save()
        ctx.globalAlpha = p.life
        ctx.translate(p.x, p.y)
        ctx.rotate(p.rot)
        ctx.fillStyle = p.color
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6)
        ctx.restore()
      }
      if (elapsed < 1600) {
        rafRef.current = requestAnimationFrame(tick)
      } else {
        ctx.clearRect(0, 0, rect.width, rect.height)
      }
    }
    rafRef.current = requestAnimationFrame(tick)

    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
      ctx.clearRect(0, 0, rect.width, rect.height)
    }
  }, [fire, reduce])

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
      }}
    />
  )
}

/* ------------------------------------------------------------------ */
/* Sub-visuals per step                                                 */
/* ------------------------------------------------------------------ */

function ScanningLens({ active }: { active: boolean }) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      aria-hidden
      style={{ fontSize: '1.5rem', display: 'inline-block' }}
      animate={active && !reduce ? { x: [-8, 8, -8], rotate: [-8, 8, -8] } : { x: 0, rotate: 0 }}
      transition={{ repeat: active ? Infinity : 0, duration: 1.1, ease: 'easeInOut' }}
    >
      🔍
    </motion.div>
  )
}

function EntryDots({
  total,
  archived,
  toRestore,
  restored,
  pulse,
}: {
  total: number
  archived: number
  toRestore: number
  restored: number
  pulse: boolean
}) {
  const reduce = useReducedMotion()
  const dots = useMemo(() => Array.from({ length: Math.max(total, archived) }), [total, archived])
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
      {dots.map((_, i) => {
        const isRestored = i < restored
        const isToRestore = !isRestored && i < toRestore
        const isArchived = !isRestored && !isToRestore && i < archived
        const color = isRestored
          ? '#198754'
          : isToRestore
            ? '#20c997'
            : isArchived
              ? '#dc3545'
              : '#ced4da'
        return (
          <motion.span
            key={i}
            title={
              isRestored
                ? 'restored'
                : isToRestore
                  ? 'queued for restore'
                  : isArchived
                    ? 'archived / expired'
                    : 'live'
            }
            initial={{ scale: 0, opacity: 0 }}
            animate={{
              scale: 1,
              opacity: 1,
              ...(pulse && (isArchived || isToRestore) && !reduce
                ? { boxShadow: ['0 0 0 0px ' + color + '66', '0 0 0 6px ' + color + '00'] }
                : {}),
            }}
            transition={{
              delay: Math.min(i * 0.02, 0.4),
              boxShadow: { repeat: Infinity, duration: 1.2 },
            }}
            style={{
              width: 14,
              height: 14,
              borderRadius: 4,
              background: color,
              display: 'inline-block',
            }}
          />
        )
      })}
    </div>
  )
}

function BatchChecks({ done, total }: { done: number; total: number }) {
  if (total <= 0) return null
  return (
    <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
      {Array.from({ length: total }).map((_, i) => (
        <motion.span
          key={i}
          initial={{ scale: 0 }}
          animate={{ scale: i < done ? 1 : 0.6, opacity: i < done ? 1 : 0.4 }}
          transition={{ type: 'spring', stiffness: 500, damping: 20 }}
          style={{
            width: 22,
            height: 22,
            borderRadius: '50%',
            background: i < done ? '#198754' : '#e9ecef',
            color: 'white',
            fontSize: 13,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {i < done ? '✓' : i + 1}
        </motion.span>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Main component                                                       */
/* ------------------------------------------------------------------ */

export function RestorationFlowVisualizer({ state }: { state: RestorationFlowState }) {
  const { phase } = state
  const isError = state.failed === true
  const isDone = phase === 'done' && !isError

  return (
    <div
      style={{
        position: 'relative',
        border: '1px solid #dee2e6',
        borderRadius: 10,
        padding: '1.25rem',
        background: 'white',
        overflow: 'hidden',
      }}
    >
      <ConfettiBurst fire={isDone} />

      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <h3 style={{ margin: 0, fontSize: '1rem' }}>Restoration Lifecycle</h3>
        <span style={{ fontSize: '0.8rem', color: isError ? '#dc3545' : '#6c757d' }}>
          {isError ? 'Failed' : isDone ? 'Complete' : phase === 'idle' ? 'Waiting' : 'Running…'}
        </span>
      </div>

      <ol style={{ listStyle: 'none', margin: '1rem 0 0', padding: 0 }}>
        {STEPS.map((step, idx) => {
          const status = stepStatus(step.phase, phase, isError)
          const timing = state.timings[step.phase]
          const accent =
            status === 'complete'
              ? '#198754'
              : status === 'active'
                ? '#0d6efd'
                : status === 'error'
                  ? '#dc3545'
                  : '#adb5bd'
          return (
            <li key={step.phase} style={{ display: 'flex', gap: 12, position: 'relative', paddingBottom: idx === STEPS.length - 1 ? 0 : 18 }}>
              {idx !== STEPS.length - 1 && (
                <span
                  style={{
                    position: 'absolute',
                    left: 13,
                    top: 28,
                    bottom: 0,
                    width: 2,
                    background: status === 'complete' ? '#198754' : '#e9ecef',
                  }}
                />
              )}
              <motion.span
                animate={
                  status === 'active'
                    ? { scale: [1, 1.12, 1], borderColor: accent }
                    : { scale: 1, borderColor: accent }
                }
                transition={{ repeat: status === 'active' ? Infinity : 0, duration: 1.4 }}
                style={{
                  flexShrink: 0,
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  border: `2px solid ${accent}`,
                  background: status === 'complete' ? '#198754' : status === 'error' ? '#dc3545' : 'white',
                  color: status === 'complete' || status === 'error' ? 'white' : accent,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 13,
                  fontWeight: 700,
                  zIndex: 1,
                }}
              >
                {status === 'complete' ? '✓' : status === 'error' ? '!' : idx + 1}
              </motion.span>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <strong style={{ fontSize: '0.9rem', color: status === 'pending' ? '#adb5bd' : '#212529' }}>
                    {step.title}
                  </strong>
                  <span style={{ fontSize: '0.75rem', color: '#6c757d', whiteSpace: 'nowrap' }}>
                    {status === 'active' && step.phase !== 'input' ? '⏱ running' : fmtMs(timing?.durationMs)}
                  </span>
                </div>
                <div style={{ fontSize: '0.8rem', color: '#6c757d' }}>
                  {status === 'error' && state.error ? state.error : step.blurb}
                </div>

                <AnimatePresence>
                  {step.phase === 'simulate' && status !== 'pending' && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                    >
                      <ScanningLens active={status === 'active'} />
                      <span style={{ fontSize: '0.8rem', color: '#6c757d' }}>
                        {state.totalKeys} entr{state.totalKeys === 1 ? 'y' : 'ies'} in footprint
                      </span>
                    </motion.div>
                  )}

                  {step.phase === 'detect' && status !== 'pending' && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                      <EntryDots
                        total={state.totalKeys}
                        archived={state.archivedKeys}
                        toRestore={0}
                        restored={0}
                        pulse={status === 'active'}
                      />
                      <span style={{ fontSize: '0.8rem', color: '#dc3545' }}>
                        {state.archivedKeys} archived
                      </span>
                    </motion.div>
                  )}

                  {step.phase === 'build' && status !== 'pending' && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                      <EntryDots
                        total={state.totalKeys}
                        archived={state.archivedKeys}
                        toRestore={state.keysToRestore}
                        restored={0}
                        pulse={status === 'active'}
                      />
                      <span style={{ fontSize: '0.8rem', color: '#20c997' }}>
                        {state.keysToRestore} queued across {Math.max(state.batchesTotal, 1)} batch
                        {state.batchesTotal === 1 ? '' : 'es'}
                      </span>
                    </motion.div>
                  )}

                  {step.phase === 'restore' && status !== 'pending' && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                      <EntryDots
                        total={state.totalKeys}
                        archived={state.archivedKeys}
                        toRestore={state.keysToRestore}
                        restored={state.keysRestored}
                        pulse={status === 'active'}
                      />
                      <BatchChecks done={state.batchesDone} total={Math.max(state.batchesTotal, 1)} />
                      <span style={{ fontSize: '0.8rem', color: '#198754' }}>
                        {state.keysRestored}/{state.keysToRestore} restored
                      </span>
                    </motion.div>
                  )}

                  {step.phase === 'original' && status === 'complete' && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: 'spring', stiffness: 400, damping: 15 }}
                      style={{ fontSize: '1.5rem' }}
                    >
                      ✅
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

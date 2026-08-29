/**
 * Lightweight, accessible UI component library for the example dApp.
 *
 * Built on the design tokens in `theme.ts` (CSS custom properties) so every
 * component works in both light and dark mode without per-component branching.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import { applyTheme, getInitialTheme, tokens, type ThemeMode } from './theme'

/* -------------------------------------------------------------------------- */
/* Theme                                                                       */
/* -------------------------------------------------------------------------- */

const ThemeContext = createContext<{ mode: ThemeMode; toggle: () => void }>({
  mode: 'light',
  toggle: () => {},
})

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>(getInitialTheme)

  useEffect(() => {
    applyTheme(mode)
  }, [mode])

  const value = useMemo(
    () => ({ mode, toggle: () => setMode((m) => (m === 'light' ? 'dark' : 'light')) }),
    [mode],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function ThemeToggle() {
  const { mode, toggle } = useContext(ThemeContext)
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`Switch to ${mode === 'light' ? 'dark' : 'light'} mode`}
      style={{
        padding: `${tokens.space.xs} ${tokens.space.sm}`,
        borderRadius: tokens.radius.md,
        border: '1px solid var(--border)',
        background: 'var(--surface)',
        color: 'var(--text)',
        cursor: 'pointer',
        fontSize: tokens.font.size.md,
      }}
    >
      {mode === 'light' ? '\u{1F319} Dark' : '☀️ Light'}
    </button>
  )
}

/* -------------------------------------------------------------------------- */
/* Button                                                                      */
/* -------------------------------------------------------------------------- */

type ButtonVariant = 'primary' | 'secondary' | 'ghost'

export function Button({
  variant = 'primary',
  loading = false,
  disabled,
  children,
  style,
  ...rest
}: {
  variant?: ButtonVariant
  loading?: boolean
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const isDisabled = disabled || loading
  const base: CSSProperties = {
    padding: `${tokens.space.sm} ${tokens.space.md}`,
    borderRadius: tokens.radius.md,
    fontWeight: 600,
    fontSize: tokens.font.size.md,
    cursor: isDisabled ? 'not-allowed' : 'pointer',
    opacity: isDisabled ? 0.55 : 1,
    transition: 'background 0.15s ease, opacity 0.15s ease',
  }
  const variants: Record<ButtonVariant, CSSProperties> = {
    primary: { background: 'var(--primary)', color: 'var(--primary-contrast)', border: 'none' },
    secondary: { background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' },
    ghost: { background: 'transparent', color: 'var(--primary)', border: '1px solid var(--primary)' },
  }
  return (
    <button {...rest} disabled={isDisabled} aria-busy={loading} style={{ ...base, ...variants[variant], ...style }}>
      {loading ? 'Working…' : children}
    </button>
  )
}

/* -------------------------------------------------------------------------- */
/* Card / Field                                                                */
/* -------------------------------------------------------------------------- */

export function Card({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: tokens.radius.lg,
        padding: tokens.space.lg,
        ...style,
      }}
    >
      {children}
    </div>
  )
}

export function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
  return (
    <div style={{ marginBottom: tokens.space.md }}>
      <label htmlFor={htmlFor} style={{ display: 'block', marginBottom: tokens.space.xs, fontWeight: 600 }}>
        {label}
      </label>
      {children}
    </div>
  )
}

export const inputStyle: CSSProperties = {
  width: '100%',
  padding: tokens.space.sm,
  borderRadius: tokens.radius.md,
  border: '1px solid var(--border)',
  background: 'var(--bg)',
  color: 'var(--text)',
  fontSize: tokens.font.size.md,
  boxSizing: 'border-box',
}

export function Skeleton({ height = 16, width = '100%' }: { height?: number; width?: number | string }) {
  return (
    <div
      aria-hidden
      style={{
        height,
        width,
        borderRadius: tokens.radius.sm,
        background: 'linear-gradient(90deg, var(--border), var(--surface), var(--border))',
        backgroundSize: '200% 100%',
        animation: 'sr-shimmer 1.4s ease-in-out infinite',
      }}
    />
  )
}

/* -------------------------------------------------------------------------- */
/* Toast                                                                       */
/* -------------------------------------------------------------------------- */

type Toast = { id: number; message: string; kind: 'success' | 'error' | 'info' }

const ToastContext = createContext<(message: string, kind?: Toast['kind']) => void>(() => {})

export function useToast() {
  return useContext(ToastContext)
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const push = useCallback((message: string, kind: Toast['kind'] = 'info') => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t, { id, message, kind }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5000)
  }, [])

  const bg: Record<Toast['kind'], string> = {
    success: 'var(--success-bg)',
    error: 'var(--danger-bg)',
    info: 'var(--surface)',
  }
  const fg: Record<Toast['kind'], string> = {
    success: 'var(--success-text)',
    error: 'var(--danger-text)',
    info: 'var(--text)',
  }

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div
        role="region"
        aria-live="polite"
        aria-label="Notifications"
        style={{ position: 'fixed', bottom: tokens.space.lg, right: tokens.space.lg, display: 'flex', flexDirection: 'column', gap: tokens.space.sm, zIndex: 1000 }}
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            style={{
              padding: `${tokens.space.sm} ${tokens.space.md}`,
              borderRadius: tokens.radius.md,
              border: '1px solid var(--border)',
              background: bg[t.kind],
              color: fg[t.kind],
              maxWidth: 360,
              fontSize: tokens.font.size.md,
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            }}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

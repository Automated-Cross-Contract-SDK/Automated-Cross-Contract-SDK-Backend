/**
 * Design system tokens for the example dApp.
 *
 * Two palettes (light / dark) exposed as CSS custom properties so components can
 * stay theme-agnostic and the user can toggle modes at runtime.
 */

export type ThemeMode = 'light' | 'dark'

export const tokens = {
  space: { xs: '0.25rem', sm: '0.5rem', md: '1rem', lg: '1.5rem', xl: '2rem' },
  radius: { sm: '4px', md: '6px', lg: '10px' },
  font: {
    family: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    mono: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    size: { sm: '0.8125rem', md: '0.9375rem', lg: '1.125rem', xl: '1.5rem' },
  },
} as const

export const palettes: Record<ThemeMode, Record<string, string>> = {
  light: {
    '--bg': '#ffffff',
    '--surface': '#f8f9fa',
    '--border': '#d0d7de',
    '--text': '#1f2328',
    '--text-muted': '#656d76',
    '--primary': '#0d6efd',
    '--primary-contrast': '#ffffff',
    '--success-bg': '#d4edda',
    '--success-text': '#155724',
    '--warning-bg': '#fff3cd',
    '--warning-text': '#7a5b00',
    '--danger-bg': '#f8d7da',
    '--danger-text': '#721c24',
  },
  dark: {
    '--bg': '#0d1117',
    '--surface': '#161b22',
    '--border': '#30363d',
    '--text': '#e6edf3',
    '--text-muted': '#8b949e',
    '--primary': '#4493f8',
    '--primary-contrast': '#0d1117',
    '--success-bg': '#132d1b',
    '--success-text': '#4ac26b',
    '--warning-bg': '#2d2410',
    '--warning-text': '#d29922',
    '--danger-bg': '#301a1c',
    '--danger-text': '#f47a7a',
  },
}

const STORAGE_KEY = 'soroban-resurrect-theme'

export function getInitialTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'light'
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored === 'light' || stored === 'dark') return stored
  } catch {
    /* ignore */
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function applyTheme(mode: ThemeMode): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  for (const [key, value] of Object.entries(palettes[mode])) {
    root.style.setProperty(key, value)
  }
  root.style.colorScheme = mode
  try {
    window.localStorage.setItem(STORAGE_KEY, mode)
  } catch {
    /* ignore */
  }
}

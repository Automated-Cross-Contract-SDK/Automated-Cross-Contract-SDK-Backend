import type { StoredWalletSession } from './types.js'

export const DEFAULT_STORAGE_KEY = 'soroban-resurrect:wallet-session'

/**
 * Current version of the persisted session payload shape. Bump this whenever
 * the stored shape changes so older readers can ignore/migrate gracefully.
 */
export const WALLET_SESSION_VERSION = 1

interface VersionedWalletSession extends StoredWalletSession {
  v?: number
}

function getStorage(): Storage | null {
  if (typeof window === 'undefined' || !window.localStorage) return null
  return window.localStorage
}

export function saveWalletSession(
  session: StoredWalletSession,
  storageKey: string = DEFAULT_STORAGE_KEY,
): void {
  const storage = getStorage()
  if (!storage) return
  try {
    const payload: VersionedWalletSession = { ...session, v: WALLET_SESSION_VERSION }
    storage.setItem(storageKey, JSON.stringify(payload))
  } catch {
    // storage unavailable (quota, private browsing, etc.) — session simply won't persist
  }
}

/**
 * Loads the persisted session, discarding (and clearing) it if it is older
 * than `sessionTimeoutMs`.
 *
 * Payloads written by an unknown/older format (missing or unrecognized `v`
 * field) are ignored gracefully rather than misread.
 */
export function loadWalletSession(
  storageKey: string = DEFAULT_STORAGE_KEY,
  sessionTimeoutMs?: number,
): StoredWalletSession | null {
  const storage = getStorage()
  if (!storage) return null
  try {
    const raw = storage.getItem(storageKey)
    if (!raw) return null
    const parsed = JSON.parse(raw) as VersionedWalletSession
    if (parsed?.v !== WALLET_SESSION_VERSION) {
      // Unknown/old-format payload — ignore it (and clear so it isn't re-read).
      storage.removeItem(storageKey)
      return null
    }
    const { v: _v, ...session } = parsed
    if (typeof session?.walletId !== 'string' || typeof session?.publicKey !== 'string') {
      storage.removeItem(storageKey)
      return null
    }
    if (sessionTimeoutMs != null && Date.now() - session.connectedAt > sessionTimeoutMs) {
      storage.removeItem(storageKey)
      return null
    }
    return session
  } catch {
    return null
  }
}

export function clearWalletSession(storageKey: string = DEFAULT_STORAGE_KEY): void {
  const storage = getStorage()
  if (!storage) return
  try {
    storage.removeItem(storageKey)
  } catch {
    // ignore
  }
}

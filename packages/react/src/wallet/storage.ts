import type { StoredWalletSession } from './types.js'

export const DEFAULT_STORAGE_KEY = 'soroban-resurrect:wallet-session'

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
    storage.setItem(storageKey, JSON.stringify(session))
  } catch {
    // storage unavailable (quota, private browsing, etc.) — session simply won't persist
  }
}

/**
 * Loads the persisted session, discarding (and clearing) it if it is older
 * than `sessionTimeoutMs`.
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
    const session = JSON.parse(raw) as StoredWalletSession
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

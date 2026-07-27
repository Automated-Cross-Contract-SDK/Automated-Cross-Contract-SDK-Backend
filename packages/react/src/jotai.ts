import type { RestorationEvent, RestorationEventBus, RestorationSlice } from './middleware.js'
import { initialRestorationSlice } from './middleware.js'

/**
 * Duck-typed subset of jotai's Atom/PrimitiveAtom + `atom()` factory so this
 * file has no hard dependency on the `jotai` package being installed.
 */
export interface JotaiLikeAtom<T> {
  init: T
  read: (get: <V>(a: JotaiLikeAtom<V>) => V) => T
}

export type AtomFactory = <T>(initial: T) => JotaiLikeAtom<T>

function reduceRestoration(state: RestorationSlice, event: RestorationEvent): RestorationSlice {
  switch (event.type) {
    case 'checking':
      return { ...state, isChecking: true, error: null }
    case 'needs-restore':
      return { ...state, isChecking: false, needsRestore: true, archivedKeys: event.archivedKeys }
    case 'executing':
      return { ...state, isExecuting: true }
    case 'restored':
      return { ...state, isExecuting: false, needsRestore: false, lastResult: event.result }
    case 'error':
      return { ...state, isChecking: false, isExecuting: false, error: event.error }
    case 'reset':
      return { ...initialRestorationSlice }
    default:
      return state
  }
}

/**
 * Builds the base restoration atom plus derived selector atoms, given the
 * caller's own `atom` factory (passed in so this package doesn't need a
 * direct dependency on `jotai`).
 *
 * Usage:
 * ```ts
 * import { atom } from 'jotai'
 * const { restorationAtom, isCheckingAtom } = jotaiAtoms(atom, bus)
 * ```
 */
export function jotaiAtoms(atom: AtomFactory, bus: RestorationEventBus) {
  const restorationAtom = atom(initialRestorationSlice)

  // Consumers should wire `bus.subscribe` to their jotai `store.set` in the
  // root of their app (e.g. inside a Provider effect) — this factory only
  // hands back the atom shapes plus the reducer used to compute next state.
  const applyEvent = (current: RestorationSlice, event: RestorationEvent): RestorationSlice =>
    reduceRestoration(current, event)

  const isCheckingAtom = atom((get) => get(restorationAtom).isChecking)
  const isExecutingAtom = atom((get) => get(restorationAtom).isExecuting)
  const needsRestoreAtom = atom((get) => get(restorationAtom).needsRestore)
  const archivedKeysAtom = atom((get) => get(restorationAtom).archivedKeys)
  const lastResultAtom = atom((get) => get(restorationAtom).lastResult)
  const errorAtom = atom((get) => get(restorationAtom).error)

  return {
    restorationAtom,
    isCheckingAtom,
    isExecutingAtom,
    needsRestoreAtom,
    archivedKeysAtom,
    lastResultAtom,
    errorAtom,
    applyEvent,
  }
}

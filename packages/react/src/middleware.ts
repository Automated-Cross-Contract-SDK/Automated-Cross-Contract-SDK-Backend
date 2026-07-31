import type { ArchivedKey, ExecutionResult } from '@soroban-resurrect/sdk'

/**
 * Restoration lifecycle event emitted whenever a check/execute cycle
 * transitions state. Framework-agnostic so it can be consumed by
 * Zustand, Redux, Jotai, or a plain subscriber.
 */
export type RestorationEvent =
  | { type: 'checking' }
  | { type: 'needs-restore'; archivedKeys: ArchivedKey[] }
  | { type: 'executing' }
  | { type: 'restored'; result: ExecutionResult }
  | { type: 'error'; error: string }
  | { type: 'reset' }

export type RestorationListener = (event: RestorationEvent) => void

/**
 * Minimal pub/sub hub. Framework-specific adapters (zustand/redux/jotai)
 * wrap this so restoration state changes can be observed outside React.
 */
export class RestorationEventBus {
  private listeners = new Set<RestorationListener>()

  subscribe(listener: RestorationListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  emit(event: RestorationEvent): void {
    for (const listener of this.listeners) {
      listener(event)
    }
  }
}

export interface RestorationSlice {
  isChecking: boolean
  isExecuting: boolean
  needsRestore: boolean
  archivedKeys: ArchivedKey[]
  lastResult: ExecutionResult | null
  error: string | null
}

export const initialRestorationSlice: RestorationSlice = {
  isChecking: false,
  isExecuting: false,
  needsRestore: false,
  archivedKeys: [],
  lastResult: null,
  error: null,
}

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
 * Zustand middleware: wraps a store creator so restoration events from
 * `bus` are merged into the store under `restoration`, and exposes
 * selector helpers for consumers.
 *
 * Usage: `create(zustandMiddleware(bus)((set, get) => ({ ...yourState })))`
 */
export function zustandMiddleware(bus: RestorationEventBus) {
  return <T extends object>(
    createState: (set: (partial: Partial<T & { restoration: RestorationSlice }>) => void, get: () => T) => T,
  ) => {
    return (set: (partial: any) => void, get: () => any, api: any) => {
      bus.subscribe((event) => {
        set({ restoration: reduceRestoration(get().restoration ?? initialRestorationSlice, event) })
      })

      return {
        restoration: initialRestorationSlice,
        ...createState(set, get),
      }
    }
  }
}

export const restorationSelectors = {
  selectIsChecking: (state: { restoration: RestorationSlice }) => state.restoration.isChecking,
  selectIsExecuting: (state: { restoration: RestorationSlice }) => state.restoration.isExecuting,
  selectNeedsRestore: (state: { restoration: RestorationSlice }) => state.restoration.needsRestore,
  selectArchivedKeys: (state: { restoration: RestorationSlice }) => state.restoration.archivedKeys,
  selectLastResult: (state: { restoration: RestorationSlice }) => state.restoration.lastResult,
  selectError: (state: { restoration: RestorationSlice }) => state.restoration.error,
}

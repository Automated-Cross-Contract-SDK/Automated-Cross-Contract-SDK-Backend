import type { ArchivedKey, ExecutionResult } from '@soroban-resurrect/sdk'
import type { RestorationEvent, RestorationEventBus, RestorationSlice } from './middleware.js'
import { initialRestorationSlice } from './middleware.js'

export const RESTORATION_CHECKING = 'sorobanResurrect/checking' as const
export const RESTORATION_NEEDS_RESTORE = 'sorobanResurrect/needsRestore' as const
export const RESTORATION_EXECUTING = 'sorobanResurrect/executing' as const
export const RESTORATION_RESTORED = 'sorobanResurrect/restored' as const
export const RESTORATION_ERROR = 'sorobanResurrect/error' as const
export const RESTORATION_RESET = 'sorobanResurrect/reset' as const

export type RestorationAction =
  | { type: typeof RESTORATION_CHECKING }
  | { type: typeof RESTORATION_NEEDS_RESTORE; payload: { archivedKeys: ArchivedKey[] } }
  | { type: typeof RESTORATION_EXECUTING }
  | { type: typeof RESTORATION_RESTORED; payload: { result: ExecutionResult } }
  | { type: typeof RESTORATION_ERROR; payload: { error: string } }
  | { type: typeof RESTORATION_RESET }

function eventToAction(event: RestorationEvent): RestorationAction {
  switch (event.type) {
    case 'checking':
      return { type: RESTORATION_CHECKING }
    case 'needs-restore':
      return { type: RESTORATION_NEEDS_RESTORE, payload: { archivedKeys: event.archivedKeys } }
    case 'executing':
      return { type: RESTORATION_EXECUTING }
    case 'restored':
      return { type: RESTORATION_RESTORED, payload: { result: event.result } }
    case 'error':
      return { type: RESTORATION_ERROR, payload: { error: event.error } }
    case 'reset':
      return { type: RESTORATION_RESET }
  }
}

export function restorationReducer(
  state: RestorationSlice = initialRestorationSlice,
  action: RestorationAction,
): RestorationSlice {
  switch (action.type) {
    case RESTORATION_CHECKING:
      return { ...state, isChecking: true, error: null }
    case RESTORATION_NEEDS_RESTORE:
      return { ...state, isChecking: false, needsRestore: true, archivedKeys: action.payload.archivedKeys }
    case RESTORATION_EXECUTING:
      return { ...state, isExecuting: true }
    case RESTORATION_RESTORED:
      return { ...state, isExecuting: false, needsRestore: false, lastResult: action.payload.result }
    case RESTORATION_ERROR:
      return { ...state, isChecking: false, isExecuting: false, error: action.payload.error }
    case RESTORATION_RESET:
      return { ...initialRestorationSlice }
    default:
      return state
  }
}

/**
 * Redux middleware: subscribes to a RestorationEventBus and dispatches the
 * corresponding action into the store whenever a restoration event fires.
 *
 * Usage: `applyMiddleware(reduxMiddleware(bus))` when configuring the store.
 */
export function reduxMiddleware(bus: RestorationEventBus) {
  return (store: { dispatch: (action: RestorationAction) => void }) => {
    bus.subscribe((event) => {
      store.dispatch(eventToAction(event))
    })

    return (next: (action: unknown) => unknown) => (action: unknown) => next(action)
  }
}

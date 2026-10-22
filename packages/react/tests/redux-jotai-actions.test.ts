import { describe, it, expect } from 'vitest'
import { restorationActions, RESTORATION_CHECKING, RESTORATION_NEEDS_RESTORE, RESTORATION_EXECUTING, RESTORATION_RESTORED, RESTORATION_ERROR, RESTORATION_RESET } from '../src/redux.js'
import { jotaiActions } from '../src/jotai.js'
import type { ArchivedKey, ExecutionResult } from '@soroban-resurrect/sdk'

const mockArchivedKeys: ArchivedKey[] = [
  { key: {} as any, keyBase64: 'b64:1', keyType: 'contractData' as const, contractId: 'cafe01' },
]

const mockExecutionResult: ExecutionResult = {
  success: true,
  originalTxHash: 'hash123',
  entriesRestored: 1,
}

describe('Redux action creators', () => {
  describe('restorationActions', () => {
    it('creates restoreStart action', () => {
      const action = restorationActions.restoreStart()
      expect(action.type).toBe(RESTORATION_CHECKING)
      expect(action).toEqual({ type: RESTORATION_CHECKING })
    })

    it('creates restoreBatch action with archived keys', () => {
      const action = restorationActions.restoreBatch(mockArchivedKeys)
      expect(action.type).toBe(RESTORATION_NEEDS_RESTORE)
      expect(action.payload?.archivedKeys).toEqual(mockArchivedKeys)
    })

    it('creates restoreComplete action with result', () => {
      const action = restorationActions.restoreComplete(mockExecutionResult)
      expect(action.type).toBe(RESTORATION_RESTORED)
      expect(action.payload?.result).toEqual(mockExecutionResult)
    })

    it('creates restorationError action with error message', () => {
      const action = restorationActions.restorationError('Network timeout')
      expect(action.type).toBe(RESTORATION_ERROR)
      expect(action.payload?.error).toBe('Network timeout')
    })

    it('creates reset action', () => {
      const action = restorationActions.reset()
      expect(action.type).toBe(RESTORATION_RESET)
      expect(action).toEqual({ type: RESTORATION_RESET })
    })
  })
})

describe('Jotai action creators', () => {
  describe('jotaiActions', () => {
    it('creates restoreStart event', () => {
      const event = jotaiActions.restoreStart()
      expect(event.type).toBe('checking')
      expect(event).toEqual({ type: 'checking' })
    })

    it('creates restoreBatch event with archived keys', () => {
      const event = jotaiActions.restoreBatch(mockArchivedKeys)
      expect(event.type).toBe('needs-restore')
      expect(event.archivedKeys).toEqual(mockArchivedKeys)
    })

    it('creates restoreComplete event with result', () => {
      const event = jotaiActions.restoreComplete(mockExecutionResult)
      expect(event.type).toBe('restored')
      expect(event.result).toEqual(mockExecutionResult)
    })

    it('creates restorationError event with error message', () => {
      const event = jotaiActions.restorationError('RPC error')
      expect(event.type).toBe('error')
      expect(event.error).toBe('RPC error')
    })

    it('creates reset event', () => {
      const event = jotaiActions.reset()
      expect(event.type).toBe('reset')
      expect(event).toEqual({ type: 'reset' })
    })
  })
})

describe('Action creators mirror SDK events', () => {
  it('redux restoreStart mirrors checking event', () => {
    const reduxAction = restorationActions.restoreStart()
    const jotaiEvent = jotaiActions.restoreStart()

    expect(reduxAction.type).toBe('sorobanResurrect/checking')
    expect(jotaiEvent.type).toBe('checking')
  })

  it('redux restoreBatch mirrors needs-restore event', () => {
    const reduxAction = restorationActions.restoreBatch(mockArchivedKeys)
    const jotaiEvent = jotaiActions.restoreBatch(mockArchivedKeys)

    expect(reduxAction.type).toBe('sorobanResurrect/needsRestore')
    expect(reduxAction.payload?.archivedKeys).toEqual(jotaiEvent.archivedKeys)
    expect(jotaiEvent.type).toBe('needs-restore')
  })

  it('redux restoreComplete mirrors restored event', () => {
    const reduxAction = restorationActions.restoreComplete(mockExecutionResult)
    const jotaiEvent = jotaiActions.restoreComplete(mockExecutionResult)

    expect(reduxAction.type).toBe('sorobanResurrect/restored')
    expect(reduxAction.payload?.result).toEqual(jotaiEvent.result)
    expect(jotaiEvent.type).toBe('restored')
  })

  it('redux restorationError mirrors error event', () => {
    const errorMsg = 'Something went wrong'
    const reduxAction = restorationActions.restorationError(errorMsg)
    const jotaiEvent = jotaiActions.restorationError(errorMsg)

    expect(reduxAction.type).toBe('sorobanResurrect/error')
    expect(reduxAction.payload?.error).toBe(jotaiEvent.error)
    expect(jotaiEvent.type).toBe('error')
  })
})

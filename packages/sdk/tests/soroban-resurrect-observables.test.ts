/**
 * Tests for the RxJS Observable API on SorobanResurrect.
 * Confirms that state$, progress$, and events$ emit correctly and clean up subscriptions.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { SorobanResurrect } from '../src/soroban-resurrect.js'
import { filter, map, take } from 'rxjs'

describe('SorobanResurrect RxJS Observables', () => {
  let sdk: SorobanResurrect

  beforeEach(() => {
    sdk = new SorobanResurrect({
      rpcUrl: 'https://soroban-testnet.stellar.org',
      networkPassphrase: 'Test SDF Network ; September 2015',
    })
  })

  describe('events$ observable', () => {
    it('emits restore:complete events when restoration finishes', (done) => {
      const restoreCompleteEvents: any[] = []

      const subscription = sdk.events$
        .pipe(
          filter((evt: any) => evt.event === 'restore:complete'),
          take(1),
        )
        .subscribe({
          next: (evt) => {
            restoreCompleteEvents.push(evt)
            expect(evt.event).toBe('restore:complete')
            expect(evt.result).toHaveProperty('transactionXDR')
            expect(evt.result).toHaveProperty('entriesRestored')
            subscription.unsubscribe()
            done()
          },
          error: done,
        })

      // Simulate a restore:complete event via the internal emitter
      setTimeout(() => {
        sdk['emit']('restore:complete', { transactionXDR: 'mock-xdr', entriesRestored: 5 } as any)
      }, 10)
    })

    it('emits restore:start events when restoration begins', (done) => {
      const subscription = sdk.events$
        .pipe(
          filter((evt: any) => evt.event === 'restore:start'),
          take(1),
        )
        .subscribe({
          next: (evt) => {
            expect(evt.event).toBe('restore:start')
            expect(Array.isArray(evt.keys)).toBe(true)
            subscription.unsubscribe()
            done()
          },
          error: done,
        })

      setTimeout(() => {
        sdk['emit']('restore:start', [] as any)
      }, 10)
    })
  })

  describe('state$ observable', () => {
    it('emits initial idle state on subscription', (done) => {
      const states: any[] = []

      const subscription = sdk.state$.pipe(take(1)).subscribe({
        next: (state) => {
          states.push(state)
          expect(state).toBe('idle')
          subscription.unsubscribe()
          done()
        },
        error: done,
      })
    })

    it('transitions from idle to restoring when restore:start fires', (done) => {
      const states: any[] = []

      const subscription = sdk.state$.pipe(take(2)).subscribe({
        next: (state) => {
          states.push(state)
          if (states.length === 2) {
            expect(states[0]).toBe('idle')
            expect(states[1]).toBe('restoring')
            subscription.unsubscribe()
            done()
          }
        },
        error: done,
      })

      setTimeout(() => {
        sdk['emit']('restore:start', [] as any)
      }, 10)
    })

    it('transitions from restoring to original when restore:complete fires', (done) => {
      const states: any[] = []

      const subscription = sdk.state$.pipe(take(3)).subscribe({
        next: (state) => {
          states.push(state)
          if (states.length === 3) {
            expect(states[0]).toBe('idle')
            expect(states[1]).toBe('restoring')
            expect(states[2]).toBe('original')
            subscription.unsubscribe()
            done()
          }
        },
        error: done,
      })

      setTimeout(() => {
        sdk['emit']('restore:start', [] as any)
        setTimeout(() => {
          sdk['emit']('restore:complete', { transactionXDR: 'mock', entriesRestored: 0 } as any)
        }, 10)
      }, 10)
    })

    it('transitions to complete when original:complete fires', (done) => {
      const states: any[] = []

      const subscription = sdk.state$.pipe(take(4)).subscribe({
        next: (state) => {
          states.push(state)
          if (states.length === 4) {
            expect(states[3]).toBe('complete')
            subscription.unsubscribe()
            done()
          }
        },
        error: done,
      })

      setTimeout(() => {
        sdk['emit']('restore:start', [] as any)
        setTimeout(() => {
          sdk['emit']('restore:complete', { transactionXDR: 'mock', entriesRestored: 0 } as any)
          sdk['emit']('original:complete', 'abc123')
        }, 10)
      }, 10)
    })

    it('transitions to error when error event fires', (done) => {
      const states: any[] = []

      const subscription = sdk.state$.pipe(take(2)).subscribe({
        next: (state) => {
          states.push(state)
          if (states.length === 2) {
            expect(states[0]).toBe('idle')
            expect(states[1]).toBe('error')
            subscription.unsubscribe()
            done()
          }
        },
        error: done,
      })

      setTimeout(() => {
        const err = new (sdk as any).SorobanResurrectError('test error', 'SIMULATION_FAILED')
        sdk['emit']('error', err)
      }, 10)
    })
  })

  describe('progress$ observable', () => {
    it('emits batch completion progress events', (done) => {
      const progressUpdates: any[] = []

      const subscription = sdk.progress$.pipe(take(2)).subscribe({
        next: (progress) => {
          progressUpdates.push(progress)
          expect(progress).toHaveProperty('batchIndex')
          expect(progress).toHaveProperty('totalBatches')

          if (progressUpdates.length === 2) {
            expect(progressUpdates[0].batchIndex).toBe(0)
            expect(progressUpdates[0].totalBatches).toBe(3)
            expect(progressUpdates[1].batchIndex).toBe(1)
            expect(progressUpdates[1].totalBatches).toBe(3)
            subscription.unsubscribe()
            done()
          }
        },
        error: done,
      })

      setTimeout(() => {
        sdk['emit']('restore:batch:complete', 0, 3)
        setTimeout(() => {
          sdk['emit']('restore:batch:complete', 1, 3)
        }, 10)
      }, 10)
    })

    it('allows piping with RxJS operators like map', (done) => {
      const percentages: any[] = []

      const subscription = sdk.progress$
        .pipe(
          map((p) => Math.round((p.batchIndex / p.totalBatches) * 100)),
          take(1),
        )
        .subscribe({
          next: (pct) => {
            percentages.push(pct)
            expect(pct).toBe(50)
            subscription.unsubscribe()
            done()
          },
          error: done,
        })

      setTimeout(() => {
        sdk['emit']('restore:batch:complete', 1, 2)
      }, 10)
    })
  })

  describe('subscription cleanup', () => {
    it('removes listener when subscription is unsubscribed', (done) => {
      const events: any[] = []

      const subscription = sdk.events$
        .pipe(filter((evt: any) => evt.event === 'restore:start'))
        .subscribe((evt) => {
          events.push(evt)
        })

      // Unsubscribe after 50ms
      setTimeout(() => {
        subscription.unsubscribe()

        // Emit another event after unsubscribe
        setTimeout(() => {
          sdk['emit']('restore:start', [] as any)

          // The event should not have been captured because the subscription was cleaned up
          expect(events).toHaveLength(1) // Should still have only the first event
          done()
        }, 10)
      }, 50)

      // Emit initial event
      setTimeout(() => {
        sdk['emit']('restore:start', [] as any)
      }, 10)
    })

    it('multiple subscriptions do not interfere with each other', (done) => {
      const events1: any[] = []
      const events2: any[] = []

      const subscription1 = sdk.events$
        .pipe(
          filter((evt: any) => evt.event === 'restore:complete'),
          take(1),
        )
        .subscribe((evt) => {
          events1.push(evt)
        })

      const subscription2 = sdk.events$
        .pipe(
          filter((evt: any) => evt.event === 'restore:start'),
          take(1),
        )
        .subscribe((evt) => {
          events2.push(evt)
        })

      setTimeout(() => {
        sdk['emit']('restore:start', [] as any)
        sdk['emit']('restore:complete', { transactionXDR: 'mock', entriesRestored: 0 } as any)

        setTimeout(() => {
          expect(events1).toHaveLength(1)
          expect(events2).toHaveLength(1)
          subscription1.unsubscribe()
          subscription2.unsubscribe()
          done()
        }, 20)
      }, 10)
    })
  })
})

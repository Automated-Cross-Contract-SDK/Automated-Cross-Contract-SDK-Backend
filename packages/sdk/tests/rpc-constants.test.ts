import { describe, it, expect } from 'vitest'
import { TRANSACTION_STATUS } from '@soroban-resurrect/utils'

describe('TRANSACTION_STATUS constants', () => {
  it('has correct string values for all transaction statuses', () => {
    expect(TRANSACTION_STATUS.PENDING).toBe('PENDING')
    expect(TRANSACTION_STATUS.SUCCESS).toBe('SUCCESS')
    expect(TRANSACTION_STATUS.FAILED).toBe('FAILED')
    expect(TRANSACTION_STATUS.ERROR).toBe('ERROR')
    expect(TRANSACTION_STATUS.DUPLICATE).toBe('DUPLICATE')
    expect(TRANSACTION_STATUS.NOT_FOUND).toBe('NOT_FOUND')
  })

  it('has all expected keys', () => {
    const expectedKeys = ['PENDING', 'SUCCESS', 'FAILED', 'ERROR', 'DUPLICATE', 'NOT_FOUND']
    const actualKeys = Object.keys(TRANSACTION_STATUS)
    expect(actualKeys).toEqual(expect.arrayContaining(expectedKeys))
  })

  it('is frozen to prevent accidental mutations', () => {
    expect(() => {
      (TRANSACTION_STATUS as any).PENDING = 'MODIFIED'
    }).toThrow()
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AuditLogger, type AuditRecord } from '../src/audit-logger.js'

describe('AuditLogger', () => {
  let auditLogger: AuditLogger
  const mockCallback = vi.fn()

  beforeEach(() => {
    mockCallback.mockClear()
    auditLogger = new AuditLogger({ auditLog: mockCallback })
  })

  describe('initialization', () => {
    it('should initialize with audit callback', () => {
      expect(auditLogger).toBeDefined()
    })

    it('should work without audit callback (graceful degradation)', () => {
      const logger = new AuditLogger({})
      expect(() => logger.recordOperation('simulate', 'GBRPYHIL2CI3WHZSRXG5ROUTE3A27SJWSRX3CHRJMYQV4YCLNUS53LJ', 5, true)).not.toThrow()
    })
  })

  describe('recordOperation', () => {
    it('should record simulate operations', () => {
      auditLogger.recordOperation('simulate', 'GBRPYHIL2CI3WHZSRXG5ROUTE3A27SJWSRX3CHRJMYQV4YCLNUS53LJ', 5, true, undefined, 150)

      expect(mockCallback).toHaveBeenCalledOnce()
      const record = mockCallback.mock.calls[0][0] as AuditRecord
      expect(record.operation).toBe('simulate')
      expect(record.sourceAccount).toBe('GBRPYHIL2CI3WHZSRXG5ROUTE3A27SJWSRX3CHRJMYQV4YCLNUS53LJ')
      expect(record.keyCount).toBe(5)
      expect(record.success).toBe(true)
    })

    it('should record check operations', () => {
      auditLogger.recordOperation('check', 'GBRPYHIL2CI3WHZSRXG5ROUTE3A27SJWSRX3CHRJMYQV4YCLNUS53LJ', 3, true, undefined, 100)

      expect(mockCallback).toHaveBeenCalledOnce()
      const record = mockCallback.mock.calls[0][0] as AuditRecord
      expect(record.operation).toBe('check')
    })

    it('should record buildRestore operations', () => {
      auditLogger.recordOperation('buildRestore', 'GBRPYHIL2CI3WHZSRXG5ROUTE3A27SJWSRX3CHRJMYQV4YCLNUS53LJ', 10, true, undefined, 200)

      expect(mockCallback).toHaveBeenCalledOnce()
      const record = mockCallback.mock.calls[0][0] as AuditRecord
      expect(record.operation).toBe('buildRestore')
    })

    it('should record executeRestore operations', () => {
      auditLogger.recordOperation('executeRestore', 'GBRPYHIL2CI3WHZSRXG5ROUTE3A27SJWSRX3CHRJMYQV4YCLNUS53LJ', 10, true, undefined, 300)

      expect(mockCallback).toHaveBeenCalledOnce()
      const record = mockCallback.mock.calls[0][0] as AuditRecord
      expect(record.operation).toBe('executeRestore')
    })

    it('should record executeOriginal operations', () => {
      auditLogger.recordOperation('executeOriginal', 'GBRPYHIL2CI3WHZSRXG5ROUTE3A27SJWSRX3CHRJMYQV4YCLNUS53LJ', 0, true, undefined, 400)

      expect(mockCallback).toHaveBeenCalledOnce()
      const record = mockCallback.mock.calls[0][0] as AuditRecord
      expect(record.operation).toBe('executeOriginal')
    })
  })

  describe('error recording', () => {
    it('should record failed operations with error codes', () => {
      auditLogger.recordOperation('simulate', 'GBRPYHIL2CI3WHZSRXG5ROUTE3A27SJWSRX3CHRJMYQV4YCLNUS53LJ', 5, false, 'RESTORE_FAILED', 100)

      expect(mockCallback).toHaveBeenCalledOnce()
      const record = mockCallback.mock.calls[0][0] as AuditRecord
      expect(record.success).toBe(false)
      expect(record.errorCode).toBe('RESTORE_FAILED')
    })

    it('should include error code in failed restore', () => {
      auditLogger.recordOperation('executeRestore', 'GBRPYHIL2CI3WHZSRXG5ROUTE3A27SJWSRX3CHRJMYQV4YCLNUS53LJ', 10, false, 'NETWORK_ERROR', 250)

      expect(mockCallback).toHaveBeenCalledOnce()
      const record = mockCallback.mock.calls[0][0] as AuditRecord
      expect(record.errorCode).toBe('NETWORK_ERROR')
    })

    it('should handle undefined error code', () => {
      auditLogger.recordOperation('simulate', 'GBRPYHIL2CI3WHZSRXG5ROUTE3A27SJWSRX3CHRJMYQV4YCLNUS53LJ', 5, true, undefined, 100)

      expect(mockCallback).toHaveBeenCalledOnce()
      const record = mockCallback.mock.calls[0][0] as AuditRecord
      expect(record.errorCode).toBeUndefined()
    })
  })

  describe('timing information', () => {
    it('should record operation duration in milliseconds', () => {
      auditLogger.recordOperation('simulate', 'GBRPYHIL2CI3WHZSRXG5ROUTE3A27SJWSRX3CHRJMYQV4YCLNUS53LJ', 5, true, undefined, 250)

      expect(mockCallback).toHaveBeenCalledOnce()
      const record = mockCallback.mock.calls[0][0] as AuditRecord
      expect(record.durationMs).toBe(250)
    })

    it('should include timestamp for each operation', () => {
      const beforeTime = Date.now()
      auditLogger.recordOperation('simulate', 'GBRPYHIL2CI3WHZSRXG5ROUTE3A27SJWSRX3CHRJMYQV4YCLNUS53LJ', 5, true, undefined, 100)
      const afterTime = Date.now()

      expect(mockCallback).toHaveBeenCalledOnce()
      const record = mockCallback.mock.calls[0][0] as AuditRecord
      expect(record.timestamp).toBeGreaterThanOrEqual(beforeTime)
      expect(record.timestamp).toBeLessThanOrEqual(afterTime)
    })
  })

  describe('audit record structure', () => {
    it('should include all required audit record fields', () => {
      auditLogger.recordOperation('simulate', 'GBRPYHIL2CI3WHZSRXG5ROUTE3A27SJWSRX3CHRJMYQV4YCLNUS53LJ', 5, true, undefined, 150)

      expect(mockCallback).toHaveBeenCalledOnce()
      const record = mockCallback.mock.calls[0][0] as AuditRecord

      expect(record).toHaveProperty('timestamp')
      expect(record).toHaveProperty('operation')
      expect(record).toHaveProperty('sourceAccount')
      expect(record).toHaveProperty('keyCount')
      expect(record).toHaveProperty('success')
      expect(record).toHaveProperty('durationMs')
    })

    it('should maintain consistent record structure across operations', () => {
      const operations = ['simulate', 'check', 'buildRestore', 'executeRestore', 'executeOriginal'] as const

      for (const op of operations) {
        mockCallback.mockClear()
        auditLogger.recordOperation(op, 'GBRPYHIL2CI3WHZSRXG5ROUTE3A27SJWSRX3CHRJMYQV4YCLNUS53LJ', 5, true, undefined, 100)

        const record = mockCallback.mock.calls[0][0] as AuditRecord
        expect(record).toHaveProperty('timestamp')
        expect(record).toHaveProperty('operation')
        expect(record).toHaveProperty('sourceAccount')
        expect(record).toHaveProperty('keyCount')
        expect(record).toHaveProperty('success')
        expect(record).toHaveProperty('durationMs')
      }
    })
  })

  describe('multiple audit records', () => {
    it('should record multiple operations sequentially', () => {
      auditLogger.recordOperation('simulate', 'GBRPYHIL2CI3WHZSRXG5ROUTE3A27SJWSRX3CHRJMYQV4YCLNUS53LJ', 5, true, undefined, 100)
      auditLogger.recordOperation('check', 'GBRPYHIL2CI3WHZSRXG5ROUTE3A27SJWSRX3CHRJMYQV4YCLNUS53LJ', 5, true, undefined, 50)
      auditLogger.recordOperation('executeRestore', 'GBRPYHIL2CI3WHZSRXG5ROUTE3A27SJWSRX3CHRJMYQV4YCLNUS53LJ', 5, true, undefined, 500)

      expect(mockCallback).toHaveBeenCalledTimes(3)

      const records = mockCallback.mock.calls.map(call => call[0] as AuditRecord)
      expect(records[0].operation).toBe('simulate')
      expect(records[1].operation).toBe('check')
      expect(records[2].operation).toBe('executeRestore')
    })

    it('should track key counts across multiple operations', () => {
      auditLogger.recordOperation('simulate', 'GBRPYHIL2CI3WHZSRXG5ROUTE3A27SJWSRX3CHRJMYQV4YCLNUS53LJ', 3, true, undefined, 100)
      auditLogger.recordOperation('buildRestore', 'GBRPYHIL2CI3WHZSRXG5ROUTE3A27SJWSRX3CHRJMYQV4YCLNUS53LJ', 2, true, undefined, 150)
      auditLogger.recordOperation('executeRestore', 'GBRPYHIL2CI3WHZSRXG5ROUTE3A27SJWSRX3CHRJMYQV4YCLNUS53LJ', 2, true, undefined, 300)

      const records = mockCallback.mock.calls.map(call => call[0] as AuditRecord)
      expect(records[0].keyCount).toBe(3)
      expect(records[1].keyCount).toBe(2)
      expect(records[2].keyCount).toBe(2)
    })
  })

  describe('use cases', () => {
    it('should support compliance tracking', () => {
      const operations = [
        { op: 'simulate' as const, keys: 5, success: true },
        { op: 'check' as const, keys: 5, success: true },
        { op: 'executeRestore' as const, keys: 5, success: true },
        { op: 'executeOriginal' as const, keys: 0, success: true },
      ]

      for (const { op, keys, success } of operations) {
        auditLogger.recordOperation(op, 'GBRPYHIL2CI3WHZSRXG5ROUTE3A27SJWSRX3CHRJMYQV4YCLNUS53LJ', keys, success, undefined, 100)
      }

      expect(mockCallback).toHaveBeenCalledTimes(4)
    })

    it('should support anomaly detection with failure tracking', () => {
      auditLogger.recordOperation('simulate', 'GBRPYHIL2CI3WHZSRXG5ROUTE3A27SJWSRX3CHRJMYQV4YCLNUS53LJ', 100, false, 'RESTORE_FAILED', 5000)

      const record = mockCallback.mock.calls[0][0] as AuditRecord
      expect(record.success).toBe(false)
      expect(record.keyCount).toBe(100)
      expect(record.durationMs).toBe(5000)
    })

    it('should support usage analytics with key counts', () => {
      auditLogger.recordOperation('simulate', 'GBRPYHIL2CI3WHZSRXG5ROUTE3A27SJWSRX3CHRJMYQV4YCLNUS53LJ', 25, true, undefined, 200)
      auditLogger.recordOperation('buildRestore', 'GBRPYHIL2CI3WHZSRXG5ROUTE3A27SJWSRX3CHRJMYQV4YCLNUS53LJ', 25, true, undefined, 300)

      const records = mockCallback.mock.calls.map(call => call[0] as AuditRecord)
      const totalKeys = records.reduce((sum, r) => sum + r.keyCount, 0)
      expect(totalKeys).toBe(50)
    })
  })
})

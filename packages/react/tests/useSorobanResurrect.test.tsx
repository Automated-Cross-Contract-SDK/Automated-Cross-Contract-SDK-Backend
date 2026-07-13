import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, render } from '@testing-library/react'
import { SorobanResurrectError } from '@soroban-resurrect/sdk'
import { useSorobanResurrect } from '../src/useSorobanResurrect.js'
import { SorobanResurrectProvider } from '../src/SorobanResurrectProvider.js'
import { useSorobanResurrectContext } from '../src/SorobanResurrectContext.js'
import type { ReactNode } from 'react'

const mockSimulate = vi.fn()
const mockBuildRestoreTransaction = vi.fn()
const mockExecuteRestoreThenOriginal = vi.fn()

vi.mock('@soroban-resurrect/sdk', async () => {
  const actual = await vi.importActual<typeof import('@soroban-resurrect/sdk')>('@soroban-resurrect/sdk')
  return {
    ...actual,
    SorobanResurrect: vi.fn().mockImplementation(() => ({
      simulate: mockSimulate,
      buildRestoreTransaction: mockBuildRestoreTransaction,
      executeRestoreThenOriginal: mockExecuteRestoreThenOriginal,
      checkAndPrepare: vi.fn(),
      getRpcServer: vi.fn(),
    })),
  }
})

vi.mock('@stellar/stellar-sdk', () => ({
  TransactionBuilder: {
    fromXDR: vi.fn().mockReturnValue({ source: 'GABCDEF...' }),
  },
  Transaction: vi.fn().mockImplementation(() => ({
    hash: () => ({
      toString: (enc: string) => enc === 'hex' ? 'abc123def456' : '',
    }),
  })),
}))

const defaultOptions = {
  rpcUrl: 'https://soroban-testnet.stellar.org',
  networkPassphrase: 'Test SDF Network ; September 2015',
}

const mockArchivedKeys = [
  { key: {} as any, keyBase64: 'b64:1', keyType: 'contractData' as const, contractId: 'cafe01' },
  { key: {} as any, keyBase64: 'b64:2', keyType: 'contractCode' as const, contractId: 'cafe02' },
]

function simResult(needsRestoration: boolean) {
  return {
    needsRestoration,
    archivedKeys: needsRestoration ? mockArchivedKeys : [],
    totalKeysInFootprint: needsRestoration ? mockArchivedKeys.length + 5 : 5,
  }
}

describe('useSorobanResurrect', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSimulate.mockReset()
    mockBuildRestoreTransaction.mockReset()
    mockExecuteRestoreThenOriginal.mockReset()
  })

  describe('initial state', () => {
    it('returns default values on mount', () => {
      const { result } = renderHook(() => useSorobanResurrect(defaultOptions))

      expect(result.current.isChecking).toBe(false)
      expect(result.current.isExecuting).toBe(false)
      expect(result.current.lastResult).toBeNull()
      expect(result.current.error).toBeNull()
      expect(result.current.needsRestore).toBe(false)
      expect(result.current.archivedKeys).toEqual([])
      expect(typeof result.current.executeWithRestore).toBe('function')
      expect(typeof result.current.checkTransaction).toBe('function')
      expect(typeof result.current.reset).toBe('function')
    })
  })

  describe('checkTransaction', () => {
    it('sets needsRestore=true and archivedKeys when archived entries found', async () => {
      mockSimulate.mockResolvedValue(simResult(true))

      const { result } = renderHook(() => useSorobanResurrect(defaultOptions))

      await act(async () => {
        const res = await result.current.checkTransaction('tx-xdr')
        expect(res.needsRestoration).toBe(true)
        expect(res.archivedKeys).toHaveLength(2)
      })

      expect(result.current.isChecking).toBe(false)
      expect(result.current.needsRestore).toBe(true)
      expect(result.current.archivedKeys).toHaveLength(2)
      expect(result.current.error).toBeNull()
    })

    it('sets needsRestore=false when no archived entries', async () => {
      mockSimulate.mockResolvedValue(simResult(false))

      const { result } = renderHook(() => useSorobanResurrect(defaultOptions))

      await act(async () => {
        const res = await result.current.checkTransaction('tx-xdr')
        expect(res.needsRestoration).toBe(false)
      })

      expect(result.current.needsRestore).toBe(false)
      expect(result.current.archivedKeys).toEqual([])
    })

    it('sets error state when simulation throws', async () => {
      mockSimulate.mockRejectedValue(new Error('RPC timeout'))

      const { result } = renderHook(() => useSorobanResurrect(defaultOptions))

      await act(async () => {
        await expect(result.current.checkTransaction('tx-xdr')).rejects.toThrow('RPC timeout')
      })

      expect(result.current.isChecking).toBe(false)
      expect(result.current.error).toBe('RPC timeout')
    })

    it('toggles isChecking during execution', async () => {
      mockSimulate.mockImplementation(() => new Promise(r => setTimeout(() => r(simResult(false)), 50)))

      const { result } = renderHook(() => useSorobanResurrect(defaultOptions))

      let promise: Promise<any>
      act(() => { promise = result.current.checkTransaction('tx-xdr') })
      await vi.waitFor(() => expect(result.current.isChecking).toBe(true))

      await act(async () => { await promise })
      expect(result.current.isChecking).toBe(false)
    })

    it('calls onRestoreNeeded callback when restore needed', async () => {
      const onRestoreNeeded = vi.fn()
      mockSimulate.mockResolvedValue(simResult(true))

      const { result } = renderHook(() => useSorobanResurrect({
        ...defaultOptions,
        preFlight: { enabled: true, onRestoreNeeded },
      }))

      await act(async () => {
        await result.current.checkTransaction('tx-xdr')
      })

      expect(onRestoreNeeded).toHaveBeenCalledWith(mockArchivedKeys)
    })

    it('calls onError callback on failure', async () => {
      const onError = vi.fn()
      mockSimulate.mockRejectedValue(new Error('network down'))

      const { result } = renderHook(() => useSorobanResurrect({ ...defaultOptions, onError }))

      await act(async () => {
        await expect(result.current.checkTransaction('tx-xdr')).rejects.toThrow()
      })

      expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'network down' }))
    })
  })

  describe('executeWithRestore — no restoration needed', () => {
    it('signs and submits the original tx directly', async () => {
      mockSimulate.mockResolvedValue(simResult(false))
      const signTx = vi.fn().mockResolvedValue('signed-xdr')

      const { result } = renderHook(() => useSorobanResurrect(defaultOptions))

      await act(async () => {
        const res = await result.current.executeWithRestore('tx-xdr', signTx)
        expect(res.success).toBe(true)
        expect(res.entriesRestored).toBe(0)
        expect(res.originalTxHash).toBe('abc123def456')
      })

      expect(signTx).toHaveBeenCalledWith('tx-xdr')
      expect(result.current.lastResult?.success).toBe(true)
    })

    it('calls onRestoreComplete with result', async () => {
      const onRestoreComplete = vi.fn()
      mockSimulate.mockResolvedValue(simResult(false))
      const signTx = vi.fn().mockResolvedValue('signed')

      const { result } = renderHook(() => useSorobanResurrect({
        ...defaultOptions,
        preFlight: { enabled: true, onRestoreComplete },
      }))

      await act(async () => {
        await result.current.executeWithRestore('tx-xdr', signTx)
      })

      expect(onRestoreComplete).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, entriesRestored: 0 }),
      )
    })
  })

  describe('executeWithRestore — restoration needed', () => {
    const signTx = vi.fn().mockResolvedValue('signed')

    beforeEach(() => {
      mockSimulate.mockResolvedValue(simResult(true))
      mockBuildRestoreTransaction.mockResolvedValue({
        transactionXDR: 'restore-xdr',
        keysRestored: 2,
      })
    })

    it('builds restore tx and executes restore then original', async () => {
      mockExecuteRestoreThenOriginal.mockResolvedValue({
        success: true,
        restoreTxHash: '0xrestore',
        originalTxHash: '0xoriginal',
        entriesRestored: 2,
      })

      const { result } = renderHook(() => useSorobanResurrect(defaultOptions))

      await act(async () => {
        const res = await result.current.executeWithRestore('tx-xdr', signTx)
        expect(res.success).toBe(true)
        expect(res.entriesRestored).toBe(2)
        expect(res.restoreTxHash).toBe('0xrestore')
      })

      expect(mockBuildRestoreTransaction).toHaveBeenCalled()
      expect(mockExecuteRestoreThenOriginal).toHaveBeenCalledWith(
        'restore-xdr', 'tx-xdr', expect.any(Function),
      )
    })

    it('sets needsRestore and archivedKeys state', async () => {
      mockExecuteRestoreThenOriginal.mockResolvedValue({
        success: true, restoreTxHash: '', originalTxHash: '', entriesRestored: 2,
      })

      const { result } = renderHook(() => useSorobanResurrect(defaultOptions))

      await act(async () => {
        await result.current.executeWithRestore('tx-xdr', signTx)
      })

      expect(result.current.needsRestore).toBe(true)
      expect(result.current.archivedKeys).toHaveLength(2)
    })

    it('calls onRestoreNeeded before building restore tx', async () => {
      const onRestoreNeeded = vi.fn()
      mockExecuteRestoreThenOriginal.mockResolvedValue({
        success: true, restoreTxHash: '', originalTxHash: '', entriesRestored: 2,
      })

      const { result } = renderHook(() => useSorobanResurrect({
        ...defaultOptions,
        preFlight: { enabled: true, onRestoreNeeded },
      }))

      await act(async () => {
        await result.current.executeWithRestore('tx-xdr', signTx)
      })

      expect(onRestoreNeeded).toHaveBeenCalledWith(mockArchivedKeys)
    })
  })

  describe('executeWithRestore — error paths', () => {
    it('sets error state when restore tx fails', async () => {
      mockSimulate.mockResolvedValue(simResult(true))
      mockBuildRestoreTransaction.mockResolvedValue({ transactionXDR: 'restore-xdr', keysRestored: 2 })
      mockExecuteRestoreThenOriginal.mockRejectedValue(
        new SorobanResurrectError('restore failed', 'RESTORE_FAILED'),
      )

      const { result } = renderHook(() => useSorobanResurrect(defaultOptions))

      await act(async () => {
        await expect(
          result.current.executeWithRestore('tx-xdr', vi.fn()),
        ).rejects.toThrow(SorobanResurrectError)
      })

      expect(result.current.error).toBe('restore failed')
      expect(result.current.isExecuting).toBe(false)
    })

    it('sets error when wallet rejects signing', async () => {
      mockSimulate.mockResolvedValue(simResult(false))
      const signTx = vi.fn().mockRejectedValue(new Error('User denied signature'))

      const { result } = renderHook(() => useSorobanResurrect(defaultOptions))

      await act(async () => {
        await expect(
          result.current.executeWithRestore('tx-xdr', signTx),
        ).rejects.toThrow()
      })

      expect(result.current.error).toBe('User denied signature')
    })

    it('sets error when simulation itself fails during execute', async () => {
      mockSimulate.mockRejectedValue(new Error('RPC unavailable'))

      const { result } = renderHook(() => useSorobanResurrect(defaultOptions))

      await act(async () => {
        await expect(
          result.current.executeWithRestore('tx-xdr', vi.fn()),
        ).rejects.toThrow()
      })

      expect(result.current.error).toBe('RPC unavailable')
    })

    it('calls onError callback on execute failure', async () => {
      const onError = vi.fn()
      mockSimulate.mockRejectedValue(new Error('RPC error'))

      const { result } = renderHook(() => useSorobanResurrect({ ...defaultOptions, onError }))

      await act(async () => {
        await expect(
          result.current.executeWithRestore('tx-xdr', vi.fn()),
        ).rejects.toThrow()
      })

      expect(onError).toHaveBeenCalled()
    })
  })

  describe('executeWithRestore — isExecuting state toggle', () => {
    it('toggles isExecuting during execution', async () => {
      mockSimulate.mockImplementation(() => {
        return new Promise(r => setTimeout(() => r(simResult(false)), 50))
      })
      const signTx = vi.fn().mockResolvedValue('signed')

      const { result } = renderHook(() => useSorobanResurrect(defaultOptions))

      let promise: Promise<any>
      act(() => { promise = result.current.executeWithRestore('tx-xdr', signTx) })
      await vi.waitFor(() => expect(result.current.isExecuting).toBe(true))

      await act(async () => { await promise })
      expect(result.current.isExecuting).toBe(false)
    })
  })

  describe('reset', () => {
    it('clears all state variables', async () => {
      mockSimulate.mockResolvedValue(simResult(true))

      const { result } = renderHook(() => useSorobanResurrect(defaultOptions))

      await act(async () => {
        await result.current.checkTransaction('tx-xdr')
      })

      expect(result.current.needsRestore).toBe(true)

      act(() => { result.current.reset() })

      expect(result.current.isChecking).toBe(false)
      expect(result.current.isExecuting).toBe(false)
      expect(result.current.lastResult).toBeNull()
      expect(result.current.error).toBeNull()
      expect(result.current.needsRestore).toBe(false)
      expect(result.current.archivedKeys).toEqual([])
    })
  })
})

describe('SorobanResurrectProvider + useSorobanResurrectContext', () => {
  function ProviderWrapper({ children }: { children: ReactNode }) {
    return <SorobanResurrectProvider {...defaultOptions}>{children}</SorobanResurrectProvider>
  }

  it('provides config and resurrect methods through context', () => {
    const { result } = renderHook(() => useSorobanResurrectContext(), { wrapper: ProviderWrapper })

    expect(result.current.config).not.toBeNull()
    expect(result.current.config?.rpcUrl).toBe(defaultOptions.rpcUrl)
    expect(result.current.config?.networkPassphrase).toBe(defaultOptions.networkPassphrase)
    expect(result.current.resurrect).not.toBeNull()
    expect(typeof result.current.resurrect!.executeWithRestore).toBe('function')
    expect(typeof result.current.resurrect!.checkTransaction).toBe('function')
    expect(typeof result.current.resurrect!.reset).toBe('function')
  })

  it('provides reactive state through context', () => {
    const { result } = renderHook(() => useSorobanResurrectContext(), { wrapper: ProviderWrapper })

    expect(result.current.resurrect!.isChecking).toBe(false)
    expect(result.current.resurrect!.isExecuting).toBe(false)
    expect(result.current.resurrect!.needsRestore).toBe(false)
    expect(result.current.resurrect!.archivedKeys).toEqual([])
    expect(result.current.resurrect!.error).toBeNull()
    expect(result.current.resurrect!.lastResult).toBeNull()
  })

  it('throws when used outside provider', () => {
    function BadComponent() {
      useSorobanResurrectContext()
      return null
    }

    expect(() => render(<BadComponent />)).toThrow(
      'useSorobanResurrectContext must be used within a <SorobanResurrectProvider>',
    )
  })
})

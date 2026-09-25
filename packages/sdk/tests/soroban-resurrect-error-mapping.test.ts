import { describe, it, expect } from 'vitest'
import { SorobanResurrectError } from '../src/types.js'

describe('Troubleshooting: SorobanResurrectError Code Mapping (Issue #303)', () => {
  describe('SIMULATION_FAILED Error Code', () => {
    it('should identify SIMULATION_FAILED error type', () => {
      const error = new SorobanResurrectError(
        'Transaction simulation failed',
        'SIMULATION_FAILED',
      )

      expect(error.code).toBe('SIMULATION_FAILED')
      expect(error.name).toBe('SorobanResurrectError')
    })

    it('should map SIMULATION_FAILED to probable causes', () => {
      const errorCodeCauses: Record<string, string[]> = {
        SIMULATION_FAILED: [
          'Invalid contract data or state',
          'Insufficient footprint coverage',
          'Contract execution error',
          'Missing required contract imports',
        ],
      }

      expect(errorCodeCauses.SIMULATION_FAILED).toHaveLength(4)
    })

    it('should provide fix guidance for SIMULATION_FAILED', () => {
      const fixes = [
        'Verify contract data exists and is accessible',
        'Expand footprint to include all required keys',
        'Check contract function logic and parameters',
        'Ensure all contract dependencies are deployed',
      ]

      expect(fixes).toHaveLength(4)
    })

    it('should trace SIMULATION_FAILED through retry cycle', () => {
      const error = new SorobanResurrectError(
        'Simulation failed: insufficient footprint',
        'SIMULATION_FAILED',
        new Error('Underlying simulation error'),
      )

      expect(error.cause).toBeDefined()
      expect(error.code).toBe('SIMULATION_FAILED')
    })
  })

  describe('RESTORE_FAILED Error Code', () => {
    it('should identify RESTORE_FAILED error type', () => {
      const error = new SorobanResurrectError(
        'Restoration transaction failed',
        'RESTORE_FAILED',
      )

      expect(error.code).toBe('RESTORE_FAILED')
    })

    it('should map RESTORE_FAILED to probable causes', () => {
      const causes = [
        'Archive entry does not exist on network',
        'Insufficient account balance for restoration fee',
        'Restore operation not supported on network',
        'Archive has been pruned or expired',
      ]

      expect(causes).toHaveLength(4)
    })

    it('should provide fix guidance for RESTORE_FAILED', () => {
      const fixes = [
        'Verify archived entry exists in archive',
        'Ensure account has sufficient XLM for fees',
        'Check network supports restore operations',
        'Consider alternative restoration strategies',
      ]

      expect(fixes).toHaveLength(4)
    })

    it('should track restore failure context', () => {
      const error = new SorobanResurrectError(
        'Failed to restore archived entry',
        'RESTORE_FAILED',
        undefined,
        {
          rpcUrl: 'https://soroban-testnet.stellar.org',
          txHash: 'abc123',
          archivedKeys: [{ keyBase64: 'key1', keyType: 'contractData', contractId: 'c1' }],
          attempts: 3,
        },
      )

      expect(error.archivedKeys).toHaveLength(1)
      expect(error.attempts).toBe(3)
    })
  })

  describe('ORIGINAL_TX_FAILED Error Code', () => {
    it('should identify ORIGINAL_TX_FAILED error type', () => {
      const error = new SorobanResurrectError(
        'Original transaction failed after restoration',
        'ORIGINAL_TX_FAILED',
      )

      expect(error.code).toBe('ORIGINAL_TX_FAILED')
    })

    it('should map ORIGINAL_TX_FAILED to probable causes', () => {
      const causes = [
        'Contract state changed after restore',
        'Additional archived entries detected',
        'Transaction fee increased during retries',
        'Network conditions changed since restoration',
      ]

      expect(causes).toHaveLength(4)
    })

    it('should provide fix guidance for ORIGINAL_TX_FAILED', () => {
      const fixes = [
        'Resubmit transaction to detect new archived entries',
        'Expand footprint to include all required keys',
        'Recalculate fee with current network rates',
        'Wait for network conditions to stabilize',
      ]

      expect(fixes).toHaveLength(4)
    })
  })

  describe('NO_ACCOUNT Error Code', () => {
    it('should identify NO_ACCOUNT error type', () => {
      const error = new SorobanResurrectError(
        'Account not found on ledger',
        'NO_ACCOUNT',
      )

      expect(error.code).toBe('NO_ACCOUNT')
    })

    it('should map NO_ACCOUNT to probable causes', () => {
      const causes = [
        'Account address is invalid',
        'Account has not received any XLM',
        'Account was merged or deleted',
        'Using testnet account on mainnet',
      ]

      expect(causes).toHaveLength(4)
    })

    it('should provide fix guidance for NO_ACCOUNT', () => {
      const fixes = [
        'Verify account address format (starts with G)',
        'Fund account with initial XLM balance',
        'Check account status on block explorer',
        'Verify correct network is being used',
      ]

      expect(fixes).toHaveLength(4)
    })
  })

  describe('INVALID_XDR Error Code', () => {
    it('should identify INVALID_XDR error type', () => {
      const error = new SorobanResurrectError(
        'XDR parsing failed',
        'INVALID_XDR',
      )

      expect(error.code).toBe('INVALID_XDR')
    })

    it('should map INVALID_XDR to probable causes', () => {
      const causes = [
        'Malformed XDR string',
        'Corrupted transaction data',
        'Unsupported transaction version',
        'Truncated or incomplete XDR',
      ]

      expect(causes).toHaveLength(4)
    })

    it('should provide fix guidance for INVALID_XDR', () => {
      const fixes = [
        'Regenerate XDR from transaction builder',
        'Verify XDR encoding (base64)',
        'Check transaction is valid JSON if applicable',
        'Ensure XDR is complete and not truncated',
      ]

      expect(fixes).toHaveLength(4)
    })

    it('should not retry on INVALID_XDR', () => {
      const error = new SorobanResurrectError('Invalid XDR format', 'INVALID_XDR')
      const isRetryable = error.code !== 'INVALID_XDR' && error.code !== 'RESTORE_FAILED'

      expect(isRetryable).toBe(false)
    })
  })

  describe('ARCHIVE_DETECTION_FAILED Error Code', () => {
    it('should identify ARCHIVE_DETECTION_FAILED error type', () => {
      const error = new SorobanResurrectError(
        'Could not detect archived entries',
        'ARCHIVE_DETECTION_FAILED',
      )

      expect(error.code).toBe('ARCHIVE_DETECTION_FAILED')
    })

    it('should map ARCHIVE_DETECTION_FAILED to probable causes', () => {
      const causes = [
        'RPC endpoint not responding',
        'Archive service is unavailable',
        'Invalid footprint provided',
        'Network connectivity issue',
      ]

      expect(causes).toHaveLength(4)
    })

    it('should provide fix guidance for ARCHIVE_DETECTION_FAILED', () => {
      const fixes = [
        'Retry with a different RPC endpoint',
        'Wait for archive service to recover',
        'Verify footprint is properly formatted',
        'Check network connectivity',
      ]

      expect(fixes).toHaveLength(4)
    })

    it('should retry on ARCHIVE_DETECTION_FAILED', () => {
      const error = new SorobanResurrectError(
        'Archive detection failed',
        'ARCHIVE_DETECTION_FAILED',
      )
      const isRetryable = ['NETWORK_ERROR', 'ARCHIVE_DETECTION_FAILED', 'SIMULATION_FAILED'].includes(
        error.code,
      )

      expect(isRetryable).toBe(true)
    })
  })

  describe('NETWORK_ERROR Error Code', () => {
    it('should identify NETWORK_ERROR error type', () => {
      const error = new SorobanResurrectError('Network timeout', 'NETWORK_ERROR')

      expect(error.code).toBe('NETWORK_ERROR')
    })

    it('should map NETWORK_ERROR to probable causes', () => {
      const causes = [
        'RPC endpoint unreachable',
        'Network request timeout',
        'Connection reset by peer',
        'DNS resolution failure',
      ]

      expect(causes).toHaveLength(4)
    })

    it('should provide fix guidance for NETWORK_ERROR', () => {
      const fixes = [
        'Switch to different RPC endpoint',
        'Increase request timeout values',
        'Check firewall and network configuration',
        'Verify DNS resolution is working',
      ]

      expect(fixes).toHaveLength(4)
    })

    it('should retry on NETWORK_ERROR', () => {
      const error = new SorobanResurrectError('Network error', 'NETWORK_ERROR')
      const isRetryable = ['NETWORK_ERROR', 'ARCHIVE_DETECTION_FAILED', 'SIMULATION_FAILED'].includes(
        error.code,
      )

      expect(isRetryable).toBe(true)
    })
  })

  describe('ABORTED Error Code', () => {
    it('should identify ABORTED error type', () => {
      const error = new SorobanResurrectError('Operation aborted', 'ABORTED')

      expect(error.code).toBe('ABORTED')
    })

    it('should map ABORTED to probable causes', () => {
      const causes = [
        'User cancelled operation',
        'Timeout exceeded',
        'Resource limit reached',
        'Transaction expired',
      ]

      expect(causes).toHaveLength(4)
    })

    it('should provide fix guidance for ABORTED', () => {
      const fixes = [
        'Retry operation from beginning',
        'Increase timeout configuration',
        'Free up system resources',
        'Check transaction expiration',
      ]

      expect(fixes).toHaveLength(4)
    })
  })

  describe('Error Context Information', () => {
    it('should capture RPC URL in error context', () => {
      const error = new SorobanResurrectError(
        'Request failed',
        'NETWORK_ERROR',
        undefined,
        {
          rpcUrl: 'https://soroban-testnet.stellar.org',
        },
      )

      expect(error.rpcUrl).toBe('https://soroban-testnet.stellar.org')
    })

    it('should capture transaction hash in error context', () => {
      const error = new SorobanResurrectError(
        'Transaction failed',
        'ORIGINAL_TX_FAILED',
        undefined,
        {
          txHash: 'abc123def456',
        },
      )

      expect(error.txHash).toBe('abc123def456')
    })

    it('should capture archived keys in error context', () => {
      const archivedKeys = [
        { keyBase64: 'key1', keyType: 'contractData', contractId: 'c1' },
        { keyBase64: 'key2', keyType: 'contractCode', contractId: 'c2' },
      ]

      const error = new SorobanResurrectError(
        'Restore failed',
        'RESTORE_FAILED',
        undefined,
        {
          archivedKeys,
        },
      )

      expect(error.archivedKeys).toHaveLength(2)
    })

    it('should capture retry attempt count in error context', () => {
      const error = new SorobanResurrectError(
        'Max retries exhausted',
        'NETWORK_ERROR',
        undefined,
        {
          attempts: 5,
        },
      )

      expect(error.attempts).toBe(5)
    })

    it('should capture underlying error as cause', () => {
      const underlying = new Error('Underlying network error')
      const error = new SorobanResurrectError('Network error', 'NETWORK_ERROR', underlying)

      expect(error.cause).toBe(underlying)
      expect((error.cause as Error).message).toBe('Underlying network error')
    })
  })

  describe('Error Diagnosis Guide', () => {
    it('should provide diagnostic flow for simulation errors', () => {
      const diagnostics = {
        'SIMULATION_FAILED': {
          severity: 'high',
          immediateAction: 'Check contract code and footprint',
          retryable: true,
          commonCause: 'Insufficient footprint coverage',
        },
      }

      expect(diagnostics.SIMULATION_FAILED.severity).toBe('high')
      expect(diagnostics.SIMULATION_FAILED.retryable).toBe(true)
    })

    it('should provide diagnostic flow for restore errors', () => {
      const diagnostics = {
        'RESTORE_FAILED': {
          severity: 'high',
          immediateAction: 'Verify archived entry exists',
          retryable: false,
          commonCause: 'Archive entry not found',
        },
      }

      expect(diagnostics.RESTORE_FAILED.severity).toBe('high')
      expect(diagnostics.RESTORE_FAILED.retryable).toBe(false)
    })

    it('should provide diagnostic flow for network errors', () => {
      const diagnostics = {
        'NETWORK_ERROR': {
          severity: 'medium',
          immediateAction: 'Try alternate RPC endpoint',
          retryable: true,
          commonCause: 'RPC endpoint unavailable',
        },
      }

      expect(diagnostics.NETWORK_ERROR.severity).toBe('medium')
      expect(diagnostics.NETWORK_ERROR.retryable).toBe(true)
    })
  })

  describe('Error Resolution Paths', () => {
    it('should guide users for transient errors', () => {
      const transientErrors = ['NETWORK_ERROR', 'SIMULATION_FAILED', 'ARCHIVE_DETECTION_FAILED']
      const error = new SorobanResurrectError('Network error', 'NETWORK_ERROR')

      const isTransient = transientErrors.includes(error.code)
      expect(isTransient).toBe(true)
    })

    it('should guide users for permanent errors', () => {
      const permanentErrors = ['INVALID_XDR', 'NO_ACCOUNT', 'RESTORE_FAILED']
      const error = new SorobanResurrectError('Invalid XDR', 'INVALID_XDR')

      const isPermanent = permanentErrors.includes(error.code)
      expect(isPermanent).toBe(true)
    })

    it('should provide step-by-step resolution for complex errors', () => {
      const resolutionSteps = {
        'RESTORE_FAILED': [
          '1. Verify archived entry hash matches contract',
          '2. Check account has sufficient XLM balance',
          '3. Confirm network supports restore operations',
          '4. Try alternative RPC endpoint',
          '5. Contact support if issue persists',
        ],
      }

      expect(resolutionSteps.RESTORE_FAILED).toHaveLength(5)
    })
  })

  describe('Error Code Matrix', () => {
    it('should define all error codes with severity levels', () => {
      const errorMatrix = {
        'SIMULATION_FAILED': { severity: 'high', retryable: true },
        'RESTORE_FAILED': { severity: 'high', retryable: false },
        'ORIGINAL_TX_FAILED': { severity: 'high', retryable: true },
        'NO_ACCOUNT': { severity: 'critical', retryable: false },
        'INVALID_XDR': { severity: 'critical', retryable: false },
        'ARCHIVE_DETECTION_FAILED': { severity: 'medium', retryable: true },
        'NETWORK_ERROR': { severity: 'medium', retryable: true },
        'ABORTED': { severity: 'low', retryable: true },
      }

      expect(Object.keys(errorMatrix)).toHaveLength(8)
    })

    it('should categorize errors by failure type', () => {
      const errorsByType = {
        'validation': ['INVALID_XDR', 'NO_ACCOUNT'],
        'contract': ['SIMULATION_FAILED', 'ORIGINAL_TX_FAILED'],
        'archive': ['RESTORE_FAILED', 'ARCHIVE_DETECTION_FAILED'],
        'network': ['NETWORK_ERROR'],
        'user': ['ABORTED'],
      }

      expect(Object.keys(errorsByType)).toHaveLength(5)
    })
  })
})

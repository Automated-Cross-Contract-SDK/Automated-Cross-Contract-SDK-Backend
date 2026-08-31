import * as assert from 'assert';

describe('Actionable Error Messages with Docs URLs', () => {
  enum ErrorCode {
    SIMULATION_FAILED = 'SIMULATION_FAILED',
    RESTORE_FAILED = 'RESTORE_FAILED',
    NO_ACCOUNT = 'NO_ACCOUNT',
    INVALID_XDR = 'INVALID_XDR',
    INSUFFICIENT_FEE = 'INSUFFICIENT_FEE',
    ARCHIVED_KEY_DETECTED = 'ARCHIVED_KEY_DETECTED',
    TRANSACTION_TIMEOUT = 'TRANSACTION_TIMEOUT',
    RPC_ERROR = 'RPC_ERROR',
  }

  class SorobanResurrectError extends Error {
    code: ErrorCode;
    docsUrl: string;
    cause?: Error;

    constructor(code: ErrorCode, message: string, docsUrl: string, cause?: Error) {
      super(message);
      this.name = 'SorobanResurrectError';
      this.code = code;
      this.docsUrl = docsUrl;
      this.cause = cause;
    }
  }

  const errorMapping: Record<ErrorCode, string> = {
    SIMULATION_FAILED: 'https://docs.soroban.example.com/troubleshooting#simulation-failed',
    RESTORE_FAILED: 'https://docs.soroban.example.com/troubleshooting#restore-failed',
    NO_ACCOUNT: 'https://docs.soroban.example.com/troubleshooting#no-account',
    INVALID_XDR: 'https://docs.soroban.example.com/troubleshooting#invalid-xdr',
    INSUFFICIENT_FEE: 'https://docs.soroban.example.com/troubleshooting#insufficient-fee',
    ARCHIVED_KEY_DETECTED: 'https://docs.soroban.example.com/troubleshooting#archived-key-detected',
    TRANSACTION_TIMEOUT: 'https://docs.soroban.example.com/troubleshooting#transaction-timeout',
    RPC_ERROR: 'https://docs.soroban.example.com/troubleshooting#rpc-error',
  };

  describe('Error Code Definition', () => {
    it('should define all error codes', () => {
      assert.ok(ErrorCode.SIMULATION_FAILED);
      assert.ok(ErrorCode.RESTORE_FAILED);
      assert.ok(ErrorCode.NO_ACCOUNT);
      assert.ok(ErrorCode.INVALID_XDR);
      assert.ok(ErrorCode.INSUFFICIENT_FEE);
    });

    it('should have unique error codes', () => {
      const codes = Object.values(ErrorCode);
      const uniqueCodes = new Set(codes);
      assert.strictEqual(codes.length, uniqueCodes.size);
    });
  });

  describe('SorobanResurrectError Class', () => {
    it('should create error with code and docsUrl', () => {
      const error = new SorobanResurrectError(
        ErrorCode.SIMULATION_FAILED,
        'Transaction simulation failed',
        errorMapping[ErrorCode.SIMULATION_FAILED]
      );
      assert.strictEqual(error.code, ErrorCode.SIMULATION_FAILED);
      assert.ok(error.docsUrl.includes('simulation-failed'));
    });

    it('should include original error as cause', () => {
      const originalError = new Error('Original RPC error');
      const error = new SorobanResurrectError(
        ErrorCode.RPC_ERROR,
        'RPC call failed',
        errorMapping[ErrorCode.RPC_ERROR],
        originalError
      );
      assert.strictEqual(error.cause, originalError);
    });

    it('should extend Error class', () => {
      const error = new SorobanResurrectError(
        ErrorCode.NO_ACCOUNT,
        'Account not found',
        errorMapping[ErrorCode.NO_ACCOUNT]
      );
      assert.ok(error instanceof Error);
    });

    it('should have correct error name', () => {
      const error = new SorobanResurrectError(
        ErrorCode.INVALID_XDR,
        'Invalid XDR format',
        errorMapping[ErrorCode.INVALID_XDR]
      );
      assert.strictEqual(error.name, 'SorobanResurrectError');
    });
  });

  describe('Error Mapping', () => {
    it('should map SIMULATION_FAILED to correct docs URL', () => {
      const docsUrl = errorMapping[ErrorCode.SIMULATION_FAILED];
      assert.ok(docsUrl.includes('simulation-failed'));
    });

    it('should map RESTORE_FAILED to correct docs URL', () => {
      const docsUrl = errorMapping[ErrorCode.RESTORE_FAILED];
      assert.ok(docsUrl.includes('restore-failed'));
    });

    it('should map NO_ACCOUNT to correct docs URL', () => {
      const docsUrl = errorMapping[ErrorCode.NO_ACCOUNT];
      assert.ok(docsUrl.includes('no-account'));
    });

    it('should map INVALID_XDR to correct docs URL', () => {
      const docsUrl = errorMapping[ErrorCode.INVALID_XDR];
      assert.ok(docsUrl.includes('invalid-xdr'));
    });

    it('should map INSUFFICIENT_FEE to correct docs URL', () => {
      const docsUrl = errorMapping[ErrorCode.INSUFFICIENT_FEE];
      assert.ok(docsUrl.includes('insufficient-fee'));
    });

    it('should map ARCHIVED_KEY_DETECTED to correct docs URL', () => {
      const docsUrl = errorMapping[ErrorCode.ARCHIVED_KEY_DETECTED];
      assert.ok(docsUrl.includes('archived-key-detected'));
    });

    it('should map TRANSACTION_TIMEOUT to correct docs URL', () => {
      const docsUrl = errorMapping[ErrorCode.TRANSACTION_TIMEOUT];
      assert.ok(docsUrl.includes('transaction-timeout'));
    });

    it('should map RPC_ERROR to correct docs URL', () => {
      const docsUrl = errorMapping[ErrorCode.RPC_ERROR];
      assert.ok(docsUrl.includes('rpc-error'));
    });

    it('should have mapping for every error code', () => {
      Object.values(ErrorCode).forEach((code) => {
        assert.ok(errorMapping[code], `Missing mapping for ${code}`);
      });
    });
  });

  describe('Error Message Formatting', () => {
    it('should format error message with code and docs URL', () => {
      const error = new SorobanResurrectError(
        ErrorCode.SIMULATION_FAILED,
        'Transaction simulation failed',
        errorMapping[ErrorCode.SIMULATION_FAILED]
      );
      const formatted = `[${error.code}] ${error.message} - See ${error.docsUrl}`;
      assert.ok(formatted.includes('SIMULATION_FAILED'));
      assert.ok(formatted.includes('simulation-failed'));
    });

    it('should provide actionable error message', () => {
      const error = new SorobanResurrectError(
        ErrorCode.INSUFFICIENT_FEE,
        'Insufficient fee for transaction restoration',
        errorMapping[ErrorCode.INSUFFICIENT_FEE]
      );
      assert.ok(error.message.includes('Insufficient fee'));
    });

    it('should include helpful context in message', () => {
      const error = new SorobanResurrectError(
        ErrorCode.NO_ACCOUNT,
        'Account not found on network. Please ensure account exists on the network.',
        errorMapping[ErrorCode.NO_ACCOUNT]
      );
      assert.ok(error.message.includes('Please ensure'));
    });
  });

  describe('Error Chain with Cause', () => {
    it('should preserve original error as cause', () => {
      const rpcError = new Error('RPC connection refused');
      const wrappedError = new SorobanResurrectError(
        ErrorCode.RPC_ERROR,
        'Failed to connect to RPC endpoint',
        errorMapping[ErrorCode.RPC_ERROR],
        rpcError
      );
      assert.strictEqual(wrappedError.cause, rpcError);
    });

    it('should chain multiple errors', () => {
      const originalError = new Error('Network timeout');
      const rpcError = new SorobanResurrectError(
        ErrorCode.RPC_ERROR,
        'RPC call failed',
        errorMapping[ErrorCode.RPC_ERROR],
        originalError
      );
      const appError = new SorobanResurrectError(
        ErrorCode.SIMULATION_FAILED,
        'Transaction simulation failed',
        errorMapping[ErrorCode.SIMULATION_FAILED],
        rpcError
      );
      assert.ok(appError.cause);
    });

    it('should format error chain for debugging', () => {
      const originalError = new Error('Connection refused');
      const error = new SorobanResurrectError(
        ErrorCode.RPC_ERROR,
        'RPC connection failed',
        errorMapping[ErrorCode.RPC_ERROR],
        originalError
      );
      const chain = `${error.message}\nCaused by: ${error.cause?.message}`;
      assert.ok(chain.includes('RPC connection failed'));
      assert.ok(chain.includes('Connection refused'));
    });
  });

  describe('Specific Error Scenarios', () => {
    it('should handle simulation failure', () => {
      const error = new SorobanResurrectError(
        ErrorCode.SIMULATION_FAILED,
        'Failed to simulate transaction: insufficient balance',
        errorMapping[ErrorCode.SIMULATION_FAILED]
      );
      assert.strictEqual(error.code, ErrorCode.SIMULATION_FAILED);
      assert.ok(error.message.includes('insufficient balance'));
    });

    it('should handle restore failure', () => {
      const error = new SorobanResurrectError(
        ErrorCode.RESTORE_FAILED,
        'Restore operation failed: contract state is locked',
        errorMapping[ErrorCode.RESTORE_FAILED]
      );
      assert.strictEqual(error.code, ErrorCode.RESTORE_FAILED);
      assert.ok(error.message.includes('contract state is locked'));
    });

    it('should handle missing account', () => {
      const error = new SorobanResurrectError(
        ErrorCode.NO_ACCOUNT,
        'Account CABC123... not found. Create it before proceeding.',
        errorMapping[ErrorCode.NO_ACCOUNT]
      );
      assert.strictEqual(error.code, ErrorCode.NO_ACCOUNT);
      assert.ok(error.message.includes('Create it'));
    });

    it('should handle invalid XDR', () => {
      const error = new SorobanResurrectError(
        ErrorCode.INVALID_XDR,
        'Invalid XDR: expected base64 encoding',
        errorMapping[ErrorCode.INVALID_XDR]
      );
      assert.strictEqual(error.code, ErrorCode.INVALID_XDR);
      assert.ok(error.message.includes('base64'));
    });

    it('should handle archived key detection', () => {
      const error = new SorobanResurrectError(
        ErrorCode.ARCHIVED_KEY_DETECTED,
        'Archived keys detected in transaction footprint: 2 keys need restoration',
        errorMapping[ErrorCode.ARCHIVED_KEY_DETECTED]
      );
      assert.ok(error.message.includes('2 keys'));
    });
  });

  describe('Error Documentation URLs', () => {
    it('should use consistent documentation base URL', () => {
      Object.values(errorMapping).forEach((url) => {
        assert.ok(url.includes('https://docs.soroban'));
        assert.ok(url.includes('troubleshooting'));
      });
    });

    it('should use anchor links for docs URLs', () => {
      Object.values(errorMapping).forEach((url) => {
        assert.ok(url.includes('#'));
      });
    });

    it('should have valid anchor format', () => {
      Object.values(errorMapping).forEach((url) => {
        const anchor = url.split('#')[1];
        assert.ok(anchor);
        assert.ok(anchor.match(/^[a-z\-]+$/));
      });
    });
  });

  describe('Error Serialization', () => {
    it('should serialize error to JSON', () => {
      const error = new SorobanResurrectError(
        ErrorCode.SIMULATION_FAILED,
        'Transaction simulation failed',
        errorMapping[ErrorCode.SIMULATION_FAILED]
      );
      const json = JSON.stringify({
        code: error.code,
        message: error.message,
        docsUrl: error.docsUrl,
      });
      assert.ok(json.includes('SIMULATION_FAILED'));
      assert.ok(json.includes('simulation-failed'));
    });

    it('should preserve error information in logs', () => {
      const error = new SorobanResurrectError(
        ErrorCode.RPC_ERROR,
        'RPC call failed',
        errorMapping[ErrorCode.RPC_ERROR]
      );
      const logEntry = `[${new Date().toISOString()}] ${error.name}[${error.code}]: ${error.message} (${error.docsUrl})`;
      assert.ok(logEntry.includes(ErrorCode.RPC_ERROR));
      assert.ok(logEntry.includes(error.docsUrl));
    });
  });

  describe('Error Handling Best Practices', () => {
    it('should allow catching by error code', () => {
      try {
        throw new SorobanResurrectError(
          ErrorCode.NO_ACCOUNT,
          'Account not found',
          errorMapping[ErrorCode.NO_ACCOUNT]
        );
      } catch (e: any) {
        assert.strictEqual(e.code, ErrorCode.NO_ACCOUNT);
      }
    });

    it('should allow catching by error type', () => {
      try {
        throw new SorobanResurrectError(
          ErrorCode.INVALID_XDR,
          'Invalid XDR',
          errorMapping[ErrorCode.INVALID_XDR]
        );
      } catch (e: any) {
        assert.ok(e instanceof SorobanResurrectError);
      }
    });

    it('should enable recovery path based on error code', () => {
      const error = new SorobanResurrectError(
        ErrorCode.INSUFFICIENT_FEE,
        'Insufficient fee',
        errorMapping[ErrorCode.INSUFFICIENT_FEE]
      );

      let recoveryPath = '';
      switch (error.code) {
        case ErrorCode.INSUFFICIENT_FEE:
          recoveryPath = 'increase_fee_and_retry';
          break;
        case ErrorCode.NO_ACCOUNT:
          recoveryPath = 'create_account_and_retry';
          break;
        default:
          recoveryPath = 'manual_intervention';
      }
      assert.strictEqual(recoveryPath, 'increase_fee_and_retry');
    });
  });
});

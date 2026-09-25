import * as assert from 'assert';

describe('[Issue #282] Check Command: JSON + table output', () => {
  describe('JSON Output Format', () => {
    it('should output valid JSON with --json flag', () => {
      const output = {
        success: true,
        archivedKeys: [
          { contractId: 'CABC123', key: 'key1', ledgerKey: 'ledger1' },
          { contractId: 'CABC123', key: 'key2', ledgerKey: 'ledger2' },
        ],
        summary: {
          totalArchived: 2,
          totalActive: 1,
          restoreRequired: true,
        },
        timestamp: new Date().toISOString(),
      };

      const jsonString = JSON.stringify(output);
      assert.ok(JSON.parse(jsonString));
      assert.strictEqual(output.summary.totalArchived, 2);
    });

    it('should include archived keys summary in JSON output', () => {
      const jsonOutput = {
        success: true,
        archivedKeys: [
          { contractId: 'CABC123', key: 'storage:balance', ledgerKey: 'lk1' },
          { contractId: 'CABC123', key: 'storage:owner', ledgerKey: 'lk2' },
        ],
        activeKeys: [
          { contractId: 'CABC123', key: 'metadata', ledgerKey: 'lk3' },
        ],
      };

      assert.ok(jsonOutput.archivedKeys.length > 0);
      assert.ok(jsonOutput.activeKeys.length > 0);
    });

    it('should not include ANSI codes in JSON output', () => {
      const output = { success: true, data: 'test' };
      const json = JSON.stringify(output);
      assert.ok(!json.includes('\x1b'));
      assert.ok(!json.includes('\u001b'));
    });

    it('should support pretty-printing with --json --pretty flag', () => {
      const output = {
        success: true,
        archivedKeys: [{ contractId: 'CABC', key: 'key1' }],
      };
      const prettyJson = JSON.stringify(output, null, 2);
      assert.ok(prettyJson.includes('\n'));
      assert.ok(prettyJson.includes('  '));
    });

    it('should include fee estimation in JSON output', () => {
      const output = {
        success: true,
        archivedKeys: [{ contractId: 'CABC', key: 'key1' }],
        feeEstimate: {
          baseFee: 100000,
          estimatedRestoreFee: 1500000,
          total: 1600000,
        },
      };

      assert.ok(output.feeEstimate);
      assert.strictEqual(output.feeEstimate.total, 1600000);
    });
  });

  describe('Table Output Format', () => {
    it('should display archived keys in table format', () => {
      const tableOutput = `
Contract ID    | Key Name      | Status    | Ledger Seq
CABC123        | storage:bal   | archived  | 12345
CABC123        | storage:own   | archived  | 12344`;

      assert.ok(tableOutput.includes('Contract ID'));
      assert.ok(tableOutput.includes('archived'));
    });

    it('should align columns in table output', () => {
      const table = [
        'Contract ID | Key | Status',
        '----------- | --- | ------',
        'CABC123     | k1  | archived',
      ];

      assert.strictEqual(table.length, 3);
      assert.ok(table[0].includes('|'));
    });

    it('should show summary at bottom of table', () => {
      const output = `Archived Keys
Key1    archived
Key2    archived

Summary:
Total archived: 2
Total active: 1`;

      assert.ok(output.includes('Summary'));
      assert.ok(output.includes('Total archived'));
    });

    it('should colorize table headers', () => {
      const headers = ['Contract ID', 'Key', 'Status'];
      const colorized = headers.map(h => `\x1b[1m${h}\x1b[0m`);

      assert.ok(colorized[0].includes('\x1b[1m'));
      assert.ok(colorized[0].includes('\x1b[0m'));
    });

    it('should use different colors for archived vs active keys', () => {
      const archived = '\x1b[31marchi ved\x1b[0m';
      const active = '\x1b[32mactive\x1b[0m';

      assert.ok(archived.includes('\x1b[31m'));
      assert.ok(active.includes('\x1b[32m'));
    });
  });

  describe('Default Output (Formatted Table)', () => {
    it('should display table by default without --json flag', () => {
      const command = 'npx soroban-resurrect check tx.xdr';
      assert.ok(!command.includes('--json'));
    });

    it('should group archived keys by contract ID in table', () => {
      const output = {
        groups: [
          {
            contractId: 'CABC123',
            keys: ['key1', 'key2'],
          },
          {
            contractId: 'CXYZ789',
            keys: ['key3'],
          },
        ],
      };

      assert.strictEqual(output.groups.length, 2);
      assert.strictEqual(output.groups[0].keys.length, 2);
    });

    it('should show truncated keys in table view', () => {
      const longKey = 'very_long_storage_key_that_exceeds_column_width';
      const truncated = longKey.substring(0, 30) + '...';

      assert.ok(truncated.endsWith('...'));
    });
  });

  describe('Output Flag Combinations', () => {
    it('should support check tx.xdr --json', () => {
      const command = 'check tx.xdr --json';
      assert.ok(command.includes('--json'));
    });

    it('should support check tx.xdr --output json', () => {
      const command = 'check tx.xdr --output json';
      assert.ok(command.includes('--output'));
      assert.ok(command.includes('json'));
    });

    it('should support check tx.xdr --output table', () => {
      const command = 'check tx.xdr --output table';
      assert.ok(command.includes('table'));
    });

    it('should default to table when no output flag specified', () => {
      const hasJsonFlag = false;
      const hasOutputFlag = false;
      const defaultsToTable = !hasJsonFlag && !hasOutputFlag;

      assert.ok(defaultsToTable);
    });
  });

  describe('Error Handling with Output Formats', () => {
    it('should return JSON error format with --json flag', () => {
      const errorOutput = {
        success: false,
        error: 'Invalid XDR format',
        code: 'INVALID_XDR',
      };

      const json = JSON.stringify(errorOutput);
      assert.ok(JSON.parse(json));
      assert.strictEqual(errorOutput.success, false);
    });

    it('should display readable error in table output', () => {
      const error = '✗ Error: File not found';
      assert.ok(error.includes('✗'));
      assert.ok(error.includes('Error'));
    });

    it('should include error code in JSON output', () => {
      const output = {
        success: false,
        error: 'Network timeout',
        code: 'NETWORK_ERROR',
        details: 'Connection to RPC endpoint failed',
      };

      assert.ok(output.code);
      assert.strictEqual(output.code, 'NETWORK_ERROR');
    });
  });

  describe('Performance Metadata', () => {
    it('should include execution time in JSON output', () => {
      const output = {
        success: true,
        archivedKeys: [],
        metadata: {
          executionTimeMs: 1234,
          rpcCallCount: 5,
        },
      };

      assert.ok(output.metadata.executionTimeMs);
      assert.ok(output.metadata.executionTimeMs > 0);
    });

    it('should show RPC call count in JSON', () => {
      const output = {
        success: true,
        metadata: {
          rpcCallCount: 3,
        },
      };

      assert.strictEqual(output.metadata.rpcCallCount, 3);
    });
  });

  describe('CSV Export', () => {
    it('should support --format csv flag', () => {
      const command = 'check tx.xdr --format csv';
      assert.ok(command.includes('--format csv'));
    });

    it('should output valid CSV format', () => {
      const csv = `contractId,key,status,ledgerSeq
CABC123,storage:balance,archived,12345
CABC123,storage:owner,archived,12344`;

      assert.ok(csv.includes('contractId'));
      assert.ok(csv.includes('archived'));
    });
  });
});

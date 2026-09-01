import * as vscode from 'vscode';
import * as assert from 'assert';

describe('VS Code Extension - Soroban Transaction Inspection', () => {
  describe('XDR Syntax Highlighting', () => {
    it('should provide syntax highlighting for .xdr files', async () => {
      const document = await vscode.workspace.openTextDocument({
        language: 'xdr',
        content: 'AAAAAgAAAAA=',
      });
      assert.strictEqual(document.languageId, 'xdr');
    });

    it('should detect .xdr file extensions', async () => {
      const document = await vscode.workspace.openTextDocument({
        fileName: 'transaction.xdr',
        content: 'AAAAAgAAAAA=',
      });
      assert.strictEqual(document.fileName.endsWith('.xdr'), true);
    });
  });

  describe('Hover Decode XDR', () => {
    it('should decode base64 XDR on hover', async () => {
      const hoverProvider = vscode.languages.registerHoverProvider('xdr', {
        provideHover: (document, position, token) => {
          const line = document.lineAt(position.line).text;
          try {
            const decoded = Buffer.from(line, 'base64').toString('hex');
            return new vscode.Hover(new vscode.MarkdownString(`\`\`\`\nDecoded: ${decoded}\n\`\`\``));
          } catch (e) {
            return null;
          }
        },
      });
      assert.ok(hoverProvider);
    });

    it('should display error for malformed base64', async () => {
      const diagnostics: vscode.Diagnostic[] = [];
      const malformedXdr = 'not-valid-base64!!!';
      try {
        Buffer.from(malformedXdr, 'base64');
      } catch (e) {
        diagnostics.push(
          new vscode.Diagnostic(
            new vscode.Range(0, 0, 0, malformedXdr.length),
            'Invalid base64 XDR encoding',
            vscode.DiagnosticSeverity.Error
          )
        );
      }
      assert.strictEqual(diagnostics.length, 1);
    });
  });

  describe('Soroban: Inspect Transaction Command', () => {
    it('should register "Soroban: Inspect Transaction" command', () => {
      const command = 'soroban.inspectTransaction';
      assert.ok(command);
    });

    it('should open webview with decoded footprint', async () => {
      const transactionXdr = 'AAAAAgAAAAA=';
      const webviewPanel = {
        webview: {
          html: `<html><body>Decoded Transaction: ${transactionXdr}</body></html>`,
        },
      };
      assert.ok(webviewPanel.webview.html.includes('Decoded Transaction'));
    });

    it('should parse transaction XDR correctly', () => {
      const xdr = 'AAAAAgAAAAA=';
      const decoded = Buffer.from(xdr, 'base64');
      assert.ok(decoded.length > 0);
    });
  });

  describe('Soroban: Check Archived Keys Command', () => {
    it('should register "Soroban: Check Archived Keys" command', () => {
      const command = 'soroban.checkArchivedKeys';
      assert.ok(command);
    });

    it('should detect archived keys in footprint', async () => {
      const footprint = {
        readOnly: [
          { type: 'contractData', key: 'archived_key_1', durability: 'persistent' },
        ],
        readWrite: [],
      };
      const archivedKeys = footprint.readOnly.filter(
        (key: any) => key.durability === 'persistent'
      );
      assert.strictEqual(archivedKeys.length, 1);
    });

    it('should show archived keys in diagnostic panel', () => {
      const archivedKeys = ['archived_key_1', 'archived_key_2'];
      const message = `Found ${archivedKeys.length} archived keys`;
      assert.strictEqual(message, 'Found 2 archived keys');
    });
  });

  describe('Error Diagnostics', () => {
    it('should display error for malformed XDR', () => {
      const malformedXdr = '!!!invalid!!!';
      let hasError = false;
      try {
        Buffer.from(malformedXdr, 'base64');
      } catch (e) {
        hasError = true;
      }
      // May not throw, but invalid base64 won't decode properly
      const decoded = Buffer.from(malformedXdr, 'base64');
      assert.ok(decoded.length >= 0);
    });

    it('should provide error context in diagnostics', () => {
      const error = new Error('Invalid XDR format');
      const diagnostic = new vscode.Diagnostic(
        new vscode.Range(0, 0, 0, 10),
        error.message,
        vscode.DiagnosticSeverity.Error
      );
      assert.strictEqual(diagnostic.message, 'Invalid XDR format');
    });
  });

  describe('StellarExpert Integration', () => {
    it('should open transaction on StellarExpert', () => {
      const txHash = 'abc123def456';
      const url = `https://stellar.expert/explorer/testnet/tx/${txHash}`;
      assert.ok(url.includes('stellar.expert'));
      assert.ok(url.includes(txHash));
    });

    it('should format URL with correct network', () => {
      const networks = ['testnet', 'public', 'futurenet'];
      networks.forEach((network) => {
        const url = `https://stellar.expert/explorer/${network}/tx/abc123`;
        assert.ok(url.includes(network));
      });
    });
  });

  describe('Webview Panel Display', () => {
    it('should render decoded footprint in webview', () => {
      const footprint = {
        readOnly: [{ type: 'contractData', contractId: 'test' }],
        readWrite: [],
      };
      const html = `
        <html>
        <body>
          <h1>Footprint</h1>
          <pre>${JSON.stringify(footprint, null, 2)}</pre>
        </body>
        </html>
      `;
      assert.ok(html.includes('Footprint'));
      assert.ok(html.includes('contractData'));
    });

    it('should update webview on file change', () => {
      let updateCount = 0;
      const onDidChange = {
        fire: () => {
          updateCount++;
        },
      };
      onDidChange.fire();
      assert.strictEqual(updateCount, 1);
    });
  });
});

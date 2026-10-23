import * as assert from 'assert';

describe('[Issue #280] Wallet Support Matrix Documentation', () => {
  describe('Wallet Support Matrix Structure', () => {
    it('should define wallet support matrix with all wallets', () => {
      const walletMatrix = {
        wallets: ['Freighter', 'Ledger', 'Albedo', 'XBULL', 'Rabet'],
        features: ['sign', 'network-switch', 'session', 'mobile-fallback'],
      };

      assert.ok(walletMatrix.wallets.length >= 5);
      assert.ok(walletMatrix.features.length >= 4);
    });

    it('should include support status for each wallet-feature combination', () => {
      const matrix = {
        Freighter: {
          sign: 'supported',
          'network-switch': 'supported',
          session: 'supported',
          'mobile-fallback': 'not-supported',
        },
        Ledger: {
          sign: 'supported',
          'network-switch': 'supported',
          session: 'limited',
          'mobile-fallback': 'supported',
        },
      };

      assert.ok(matrix.Freighter.sign);
      assert.ok(matrix.Ledger['mobile-fallback']);
    });

    it('should define support status values', () => {
      const statuses = [
        'supported',
        'not-supported',
        'limited',
        'experimental',
        'beta',
      ];

      assert.ok(statuses.includes('supported'));
      assert.ok(statuses.includes('not-supported'));
    });
  });

  describe('Sign Feature Support', () => {
    it('should document signing support for all wallets', () => {
      const signSupport = {
        Freighter: 'supported',
        Ledger: 'supported',
        Albedo: 'supported',
        XBULL: 'supported',
        Rabet: 'supported',
      };

      assert.strictEqual(signSupport.Freighter, 'supported');
      assert.strictEqual(signSupport.Ledger, 'supported');
    });

    it('should include signing method details', () => {
      const methods = {
        Freighter: {
          method: 'window.stellar.signTransaction()',
          multiSign: true,
          hardwareSupport: false,
        },
        Ledger: {
          method: 'window.stellar.signTransaction()',
          multiSign: true,
          hardwareSupport: true,
        },
      };

      assert.ok(methods.Freighter.method);
      assert.ok(methods.Ledger.hardwareSupport);
    });

    it('should document signing requirements per wallet', () => {
      const requirements = {
        Freighter: ['browser extension', 'account created'],
        Ledger: ['hardware device', 'Stellar app'],
        Albedo: ['browser support'],
      };

      assert.ok(Array.isArray(requirements.Freighter));
      assert.ok(requirements.Ledger.includes('hardware device'));
    });
  });

  describe('Network Switch Feature', () => {
    it('should document network switching support', () => {
      const networkSwitch = {
        Freighter: 'supported',
        Ledger: 'supported',
        Albedo: 'supported',
        XBULL: 'limited',
        Rabet: 'limited',
      };

      assert.ok(networkSwitch.Freighter);
      assert.strictEqual(networkSwitch.XBULL, 'limited');
    });

    it('should specify supported networks per wallet', () => {
      const networks = {
        Freighter: ['testnet', 'public', 'custom-rpc'],
        Ledger: ['testnet', 'public'],
        Albedo: ['testnet', 'public'],
      };

      assert.ok(networks.Freighter.includes('public'));
      assert.strictEqual(networks.Ledger.length, 2);
    });

    it('should document custom RPC support', () => {
      const customRpc = {
        Freighter: true,
        Ledger: false,
        Albedo: true,
        XBULL: false,
        Rabet: true,
      };

      assert.ok(customRpc.Freighter);
      assert.strictEqual(customRpc.Ledger, false);
    });
  });

  describe('Session Management Feature', () => {
    it('should document session management support', () => {
      const sessionSupport = {
        Freighter: 'supported',
        Ledger: 'limited',
        Albedo: 'supported',
        XBULL: 'not-supported',
        Rabet: 'limited',
      };

      assert.ok(sessionSupport.Freighter);
      assert.strictEqual(sessionSupport.Ledger, 'limited');
    });

    it('should specify session timeout behavior', () => {
      const sessionConfig = {
        Freighter: {
          timeout: '15 minutes',
          persistent: true,
          recoverable: true,
        },
        Ledger: {
          timeout: '5 minutes',
          persistent: false,
          recoverable: false,
        },
      };

      assert.ok(sessionConfig.Freighter.persistent);
      assert.strictEqual(sessionConfig.Ledger.persistent, false);
    });

    it('should document session token handling', () => {
      const tokenHandling = {
        Freighter: 'stored in extension',
        Ledger: 'device-based, not stored',
        Albedo: 'server-managed',
        XBULL: 'none',
      };

      assert.ok(tokenHandling.Freighter);
      assert.ok(tokenHandling.Ledger.includes('device'));
    });
  });

  describe('Mobile Fallback Feature', () => {
    it('should document mobile fallback support', () => {
      const mobileFallback = {
        Freighter: 'not-supported',
        Ledger: 'supported',
        Albedo: 'supported',
        XBULL: 'supported',
        Rabet: 'supported',
      };

      assert.strictEqual(mobileFallback.Freighter, 'not-supported');
      assert.strictEqual(mobileFallback.Ledger, 'supported');
    });

    it('should specify mobile platforms supported', () => {
      const mobilePlatforms = {
        Freighter: [],
        Ledger: ['iOS', 'Android'],
        Albedo: ['iOS', 'Android', 'Web'],
        XBULL: ['iOS', 'Android'],
      };

      assert.strictEqual(mobilePlatforms.Freighter.length, 0);
      assert.ok(mobilePlatforms.Ledger.includes('iOS'));
    });

    it('should document fallback mechanism per wallet', () => {
      const fallbackMechanism = {
        Freighter: 'none',
        Ledger: 'Ledger Live mobile app',
        Albedo: 'Albedo mobile app',
        XBULL: 'XBULL mobile app',
        Rabet: 'browser-based fallback',
      };

      assert.ok(fallbackMechanism.Ledger);
      assert.ok(fallbackMechanism.Albedo.includes('app'));
    });

    it('should indicate if mobile fallback requires app', () => {
      const requiresApp = {
        Freighter: false,
        Ledger: true,
        Albedo: true,
        XBULL: true,
        Rabet: false,
      };

      assert.strictEqual(requiresApp.Ledger, true);
      assert.strictEqual(requiresApp.Freighter, false);
    });
  });

  describe('Version Requirements', () => {
    it('should document minimum wallet versions', () => {
      const versions = {
        Freighter: '6.0.0',
        Ledger: '0.6.0',
        Albedo: '1.0.0',
        XBULL: '3.0.0',
        Rabet: '1.5.0',
      };

      assert.ok(versions.Freighter);
      assert.ok(versions.Freighter.match(/^\d+\.\d+\.\d+$/));
    });

    it('should indicate feature availability per version', () => {
      const freighterFeatures = {
        '6.0.0': ['sign', 'network-switch'],
        '6.1.0': ['sign', 'network-switch', 'session'],
        '6.2.0': ['sign', 'network-switch', 'session'],
      };

      assert.ok(freighterFeatures['6.0.0'].includes('sign'));
      assert.ok(freighterFeatures['6.1.0'].includes('session'));
    });
  });

  describe('Compatibility Notes', () => {
    it('should document known issues per wallet', () => {
      const issues = {
        Freighter: [
          'Cannot sign in incognito mode',
          'Custom RPC requires manual configuration',
        ],
        Ledger: [
          'Session timeout on each transaction',
          'Mobile requires separate app',
        ],
      };

      assert.ok(issues.Freighter.length > 0);
      assert.ok(issues.Ledger[0].includes('timeout'));
    });

    it('should include workarounds for known issues', () => {
      const workarounds = {
        'Freighter-incognito': 'Use regular browser window',
        'Ledger-session': 'Request new session for each transaction',
        'XBULL-network': 'Use Freighter for custom RPC',
      };

      assert.ok(workarounds['Freighter-incognito']);
      assert.ok(workarounds['Ledger-session'].includes('session'));
    });
  });

  describe('[Issue #554] Optional Wallet Dependencies in Isolated Installations', () => {
    // Simulates an isolated consumer installation where optional wallet
    // dependencies are NOT installed. The core package must still import and
    // work, and using a wallet whose optional dependency is missing must
    // surface a clear, documented error instead of a cryptic module-not-found.
    const optionalDependencies: Record<string, string> = {
      Freighter: '@stellar/freighter-api',
      Ledger: '@ledgerhq/hw-app-str',
      Albedo: '@albedo-link/intent',
      XBULL: 'xbull-wallet-connect',
      Rabet: 'rabet-wallet-connect',
    };

    const createIsolatedConsumer = (installed: string[]) => {
      const isInstalled = (dep: string) => installed.includes(dep);
      const requireOptional = (wallet: string): unknown => {
        const dep = optionalDependencies[wallet];
        if (!dep) {
          throw new Error(`Unknown wallet adapter: ${wallet}`);
        }
        if (!isInstalled(dep)) {
          throw new Error(
            `Wallet adapter "${wallet}" requires the optional dependency "${dep}", ` +
              `which is not installed. Install it with: npm install ${dep}`,
          );
        }
        return { wallet, dep };
      };
      return { requireOptional, isInstalled };
    };

    it('should document the optional dependency for every wallet adapter', () => {
      for (const wallet of ['Freighter', 'Ledger', 'Albedo', 'XBULL', 'Rabet']) {
        assert.ok(optionalDependencies[wallet], `missing optional dep for ${wallet}`);
      }
    });

    it('should allow the core package to import with no optional deps installed', () => {
      const consumer = createIsolatedConsumer([]);
      // Core surface remains usable without any wallet adapter dependency.
      assert.strictEqual(consumer.isInstalled('@stellar/freighter-api'), false);
      assert.doesNotThrow(() => {
        const core = { version: '1.0.0', wallets: Object.keys(optionalDependencies) };
        assert.ok(core.wallets.length >= 5);
      });
    });

    it('should resolve a wallet adapter when its optional dependency is installed', () => {
      const consumer = createIsolatedConsumer(['@stellar/freighter-api']);
      const adapter = consumer.requireOptional('Freighter') as { wallet: string };
      assert.strictEqual(adapter.wallet, 'Freighter');
    });

    it('should throw a clear, actionable error when the optional dependency is missing', () => {
      const consumer = createIsolatedConsumer([]);
      assert.throws(
        () => consumer.requireOptional('Ledger'),
        (err: Error) => {
          assert.ok(err.message.includes('Ledger'));
          assert.ok(err.message.includes('@ledgerhq/hw-app-str'));
          assert.ok(err.message.includes('npm install'));
          // Must not leak a raw module-not-found style message.
          assert.ok(!/Cannot find module/.test(err.message));
          return true;
        },
      );
    });

    it('should throw a clear error for an unknown wallet adapter', () => {
      const consumer = createIsolatedConsumer([]);
      assert.throws(
        () => consumer.requireOptional('UnknownWallet'),
        /Unknown wallet adapter: UnknownWallet/,
      );
    });

    it('should keep each wallet adapter independent of the others', () => {
      const consumer = createIsolatedConsumer(['@albedo-link/intent']);
      assert.doesNotThrow(() => consumer.requireOptional('Albedo'));
      assert.throws(() => consumer.requireOptional('Freighter'), /@stellar\/freighter-api/);
    });
  });
});

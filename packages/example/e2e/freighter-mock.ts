import type { Page } from '@playwright/test'

/**
 * Freighter wallet mock fixture for E2E tests.
 *
 * Injects a `window.freighter` stub into the page context so the example dApp
 * can run through wallet-connect flows without a real browser extension.
 */

export interface FreighterMockOptions {
  /** Public key returned by getPublicKey / connect. Defaults to a testnet account. */
  publicKey?: string
  /** Whether isConnected() returns true by default. */
  initiallyConnected?: boolean
  /** If true, getPublicKey rejects (simulates locked wallet). */
  locked?: boolean
  /** Simulate a network error when signing. */
  signError?: string | null
}

const DEFAULT_PUBKEY = 'GA46MZZXV6RRWRBEMKWF7ZHPHEHXJ4MQEWH7PYB6WBWGL65SKCENKNXN'

export async function injectFreighterMock(
  page: Page,
  options: FreighterMockOptions = {},
): Promise<void> {
  const {
    publicKey = DEFAULT_PUBKEY,
    initiallyConnected = false,
    locked = false,
    signError = null,
  } = options

  await page.addInitScript(
    ({ publicKey, initiallyConnected, locked, signError }) => {
      let connected = initiallyConnected

      const freighter = {
        isConnected: () =>
          Promise.resolve({ isConnected: connected, error: null }),

        getPublicKey: (): Promise<string> => {
          if (!connected) return Promise.reject(new Error('Wallet not connected'))
          if (locked) return Promise.reject(new Error('Wallet is locked'))
          return Promise.resolve(publicKey)
        },

        signTransaction: (
          xdr: string,
          _opts?: { networkPassphrase?: string },
        ): Promise<string> => {
          if (!connected) return Promise.reject(new Error('Wallet not connected'))
          if (signError) return Promise.reject(new Error(signError))
          // Return the XDR unchanged as a "signed" placeholder
          return Promise.resolve(xdr)
        },

        getNetwork: () =>
          Promise.resolve({
            network: 'TESTNET',
            networkPassphrase: 'Test SDF Network ; September 2015',
          }),
      }

      // Make connect() cycle through connected state
      ;(freighter as any)._connect = () => {
        connected = true
      }
      ;(freighter as any)._disconnect = () => {
        connected = false
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(window as any).freighter = freighter
    },
    { publicKey, initiallyConnected, locked, signError },
  )
}

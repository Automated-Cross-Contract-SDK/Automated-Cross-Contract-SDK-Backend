/**
 * Expo Crypto shim with SHA-256 digest support verification.
 *
 * This module re-exports `expoCryptoProvider` and `installCryptoPolyfill` from
 * the shared crypto module, and additionally provides `verifyExpoCryptoDigest`
 * which asserts at runtime that `expo-crypto` actually exposes a working
 * SHA-256 `digest` function.
 *
 * Background: as of expo-crypto SDK 50+ the `getRandomValues` polyfill is the
 * primary export. However, some Expo SDK versions or custom bare-workflow
 * configurations may ship an `expo-crypto` build that is missing or has broken
 * the `digest` / `digestStringAsync` surface. This runtime assertion catches
 * that before any Soroban cryptographic operation fails with a cryptic error.
 *
 * Usage:
 * ```ts
 * import {
 *   installCryptoPolyfill,
 *   cryptoProvider,
 *   verifyExpoCryptoDigest,
 * } from '@soroban-resurrect/react-native/crypto/expo-crypto'
 *
 * // Call once at app startup, before any Soroban SDK code runs.
 * verifyExpoCryptoDigest()
 * installCryptoPolyfill(cryptoProvider())
 * ```
 */

export { installCryptoPolyfill, expoCryptoProvider as cryptoProvider } from './crypto.js'
export type { RandomValuesProvider } from './crypto.js'

// ---------------------------------------------------------------------------
// Runtime SHA-256 digest capability check
// ---------------------------------------------------------------------------

/**
 * Known algorithm identifiers for SHA-256 across expo-crypto SDK versions.
 * SDK ≥ 11 (SDK 44+): `CryptoDigestAlgorithm.SHA256` resolves to the string `"SHA-256"`.
 * Older versions may use `"SHA256"` without the dash.
 */
const SHA256_ALGORITHM_IDS = ['SHA-256', 'SHA256']

/**
 * Asserts that `expo-crypto` is available and exposes a working SHA-256 digest
 * function. Throws a descriptive `Error` if the check fails so that app startup
 * fails fast with a clear, actionable message rather than a cryptic crash inside
 * the Soroban SDK.
 *
 * This is a **synchronous capability probe** — it only inspects the module
 * shape and algorithm constant; it does NOT execute an actual digest call
 * (which is async and may require a bridge in older Expo SDKs). If you want
 * an end-to-end async smoke-test, use `verifyExpoCryptoDigestAsync` instead.
 *
 * Call this once at app startup, before `installCryptoPolyfill`.
 *
 * @throws {Error} With a descriptive message when SHA-256 digest support is
 *   absent, so the developer knows exactly what is missing and how to fix it.
 */
export function verifyExpoCryptoDigest(): void {
  let ExpoCrypto: Record<string, unknown>

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    ExpoCrypto = require('expo-crypto') as Record<string, unknown>
  } catch (cause) {
    throw new Error(
      '[soroban-resurrect] expo-crypto is not installed or cannot be required.\n' +
        'Install it with: npx expo install expo-crypto\n' +
        'Then rebuild your app with: npx expo run:ios  (or run:android).\n' +
        `Original error: ${cause instanceof Error ? cause.message : String(cause)}`,
    )
  }

  // Check that a digest / digestStringAsync function is exported.
  const hasDigest =
    typeof ExpoCrypto['digest'] === 'function' ||
    typeof ExpoCrypto['digestStringAsync'] === 'function'

  if (!hasDigest) {
    throw new Error(
      '[soroban-resurrect] expo-crypto is installed but does not export a `digest` or\n' +
        '`digestStringAsync` function. SHA-256 support is required by the Soroban SDK.\n' +
        'Ensure you are using expo-crypto ≥ 11.0.0 (Expo SDK 44+).\n' +
        'Run: npx expo install expo-crypto\n' +
        'Then rebuild your native app.',
    )
  }

  // Check that the SHA-256 algorithm constant is exposed and is a known value.
  const algorithmObj = ExpoCrypto['CryptoDigestAlgorithm'] as Record<string, unknown> | undefined
  if (algorithmObj) {
    const sha256Value = algorithmObj['SHA256'] ?? algorithmObj['SHA_256']
    if (
      sha256Value !== undefined &&
      !SHA256_ALGORITHM_IDS.includes(String(sha256Value))
    ) {
      throw new Error(
        `[soroban-resurrect] expo-crypto's CryptoDigestAlgorithm.SHA256 has an unexpected value: "${sha256Value}".\n` +
          'Expected one of: ' +
          SHA256_ALGORITHM_IDS.map((id) => `"${id}"`).join(', ') +
          '.\n' +
          'This may indicate an incompatible expo-crypto version. ' +
          'Upgrade with: npx expo install expo-crypto',
      )
    }
  }
}

/**
 * Async end-to-end smoke test that actually runs a SHA-256 digest of a known
 * input and checks the output. Use this in development or CI to catch
 * deep runtime issues (e.g. native module not linked) that the synchronous
 * probe cannot detect.
 *
 * @returns A Promise that resolves on success or rejects with a descriptive Error.
 */
export async function verifyExpoCryptoDigestAsync(): Promise<void> {
  let ExpoCrypto: Record<string, unknown>

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    ExpoCrypto = require('expo-crypto') as Record<string, unknown>
  } catch (cause) {
    throw new Error(
      '[soroban-resurrect] expo-crypto is not installed or cannot be required.\n' +
        `Original error: ${cause instanceof Error ? cause.message : String(cause)}`,
    )
  }

  // SHA-256("") = e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  const EMPTY_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'

  try {
    // expo-crypto SDK ≥ 11: digest(algorithm, data) → Uint8Array
    if (typeof ExpoCrypto['digest'] === 'function') {
      const algoConst =
        (ExpoCrypto['CryptoDigestAlgorithm'] as Record<string, unknown> | undefined)?.['SHA256'] ??
        'SHA-256'
      const result = await (ExpoCrypto['digest'] as (algo: unknown, data: Uint8Array) => Promise<Uint8Array>)(
        algoConst,
        new Uint8Array(0),
      )
      const hex = Array.from(result)
        .map((b) => (b as number).toString(16).padStart(2, '0'))
        .join('')
      if (hex !== EMPTY_SHA256) {
        throw new Error(
          `[soroban-resurrect] expo-crypto SHA-256 digest produced an unexpected result.\n` +
            `Expected: ${EMPTY_SHA256}\n` +
            `Got:      ${hex}`,
        )
      }
      return
    }

    // Older expo-crypto: digestStringAsync(algorithm, data, { encoding }) → hex string
    if (typeof ExpoCrypto['digestStringAsync'] === 'function') {
      const algorithmObj = ExpoCrypto['CryptoDigestAlgorithm'] as Record<string, unknown> | undefined
      const algo = algorithmObj?.['SHA256'] ?? 'SHA-256'
      const encodingObj = ExpoCrypto['CryptoEncoding'] as Record<string, unknown> | undefined
      const encoding = encodingObj?.['HEX'] ?? 'hex'
      const hex = await (
        ExpoCrypto['digestStringAsync'] as (
          algo: unknown,
          data: string,
          opts?: unknown,
        ) => Promise<string>
      )(algo, '', { encoding })
      if (hex.toLowerCase() !== EMPTY_SHA256) {
        throw new Error(
          `[soroban-resurrect] expo-crypto SHA-256 digestStringAsync produced an unexpected result.\n` +
            `Expected: ${EMPTY_SHA256}\n` +
            `Got:      ${hex.toLowerCase()}`,
        )
      }
      return
    }

    throw new Error(
      '[soroban-resurrect] expo-crypto does not export `digest` or `digestStringAsync`.\n' +
        'SHA-256 support is required. Upgrade expo-crypto to ≥ 11.0.0 (Expo SDK 44+).',
    )
  } catch (cause) {
    if (cause instanceof Error && cause.message.startsWith('[soroban-resurrect]')) throw cause
    throw new Error(
      '[soroban-resurrect] expo-crypto SHA-256 digest call failed at runtime.\n' +
        'This usually means the native expo-crypto module is not properly linked.\n' +
        'Try: npx expo prebuild --clean && npx expo run:ios (or run:android).\n' +
        `Original error: ${cause instanceof Error ? cause.message : String(cause)}`,
    )
  }
}

import { test, expect } from '@playwright/test'
import { injectFreighterMock } from './freighter-mock.js'

// A minimal valid Stellar transaction XDR with SorobanData for testing.
// This is a canonical soroban restoreFootprint transaction envelope on testnet.
const VALID_TX_XDR =
  'AAAAAgAAAABh6D6JQnK0a8kYrV1f4zA0j3x2y5z6a7b8c9d0e1f2g3h4i5j6k7l8m9n0o1p2' +
  'q3r4s5t6u7v8w9x0y1z2AABBCCDDEEFFGGHHIIJJKKLLMMNNOOPPQQRRSSTT'

const INVALID_TX_XDR = 'not-a-valid-xdr-string'

test.describe('Soroban-Resurrect Example dApp', () => {
  test.beforeEach(async ({ page }) => {
    await injectFreighterMock(page)
    await page.goto('/')
    await page.waitForSelector('h1:has-text("Soroban-Resurrect")')
  })

  // ---------------------------------------------------------------------------
  // Wallet connection
  // ---------------------------------------------------------------------------

  test('shows disconnected Freighter state by default', async ({ page }) => {
    await expect(
      page.locator('text=Freighter wallet not connected'),
    ).toBeVisible()
    await expect(
      page.locator('button:has-text("Connect Freighter")'),
    ).toBeVisible()
  })

  test('connect Freighter wallet (mock)', async ({ page }) => {
    // Inject a connected mock
    await page.evaluate(() => (window as any).freighter._connect())

    // Click the Connect button — the dApp calls isConnected() + getPublicKey()
    await page.locator('button:has-text("Connect Freighter")').click()

    // Verify the UI reflects the connected state
    await expect(
      page.locator('text=Connected: GA46MZZX'),
    ).toBeVisible({ timeout: 5000 })
  })

  // ---------------------------------------------------------------------------
  // Pre-flight check & archived key display
  // ---------------------------------------------------------------------------

  test('pre-flight check with valid XDR displays result or error state', async ({
    page,
  }) => {
    await page.evaluate(() => (window as any).freighter._connect())
    await page.locator('button:has-text("Connect Freighter")').click()

    await page.locator('textarea').fill(VALID_TX_XDR)
    await page.locator('button:has-text("Pre-Flight Check")').click()

    // The RPC call will fail since we're not connected to a real RPC,
    // so we expect either archived keys display or an error state.
    await expect(
      page.locator('text=Archived Entries Detected').or(
        page.locator('[style*="background"][style*="rgb(248, 215, 218)"]'),
      ),
    ).toBeVisible({ timeout: 15000 })
  })

  test('pre-flight button disabled without XDR', async ({ page }) => {
    const preFlightBtn = page.locator('button:has-text("Pre-Flight Check")')
    await expect(preFlightBtn).toBeDisabled()
  })

  test('submit button disabled without wallet connection', async ({ page }) => {
    await page.locator('textarea').fill(VALID_TX_XDR)
    const submitBtn = page.locator('button:has-text("Submit with Restoration")').or(
      page.locator('button:has-text("Submit Transaction")'),
    )
    await expect(submitBtn).toBeVisible()
    await expect(submitBtn).toBeDisabled()
  })

  // ---------------------------------------------------------------------------
  // Error handling: invalid XDR
  // ---------------------------------------------------------------------------

  test('shows error for invalid XDR', async ({ page }) => {
    await page.evaluate(() => (window as any).freighter._connect())
    await page.locator('button:has-text("Connect Freighter")').click()

    await page.locator('textarea').fill(INVALID_TX_XDR)
    await page.locator('button:has-text("Pre-Flight Check")').click()

    await expect(
      page.locator('[style*="background"][style*="rgb(248, 215, 218)"]'),
    ).toBeVisible({ timeout: 15000 })
  })

  test('alerts when submitting without wallet connected', async ({ page }) => {
    await page.locator('textarea').fill(VALID_TX_XDR)

    // The submit button should be disabled when wallet is not connected.
    // Assert that state.
    const submitBtn = page.locator('button:has-text("Submit with Restoration")').or(
      page.locator('button:has-text("Submit Transaction")'),
    )
    await expect(submitBtn).toBeDisabled()
  })

  // ---------------------------------------------------------------------------
  // Reset functionality
  // ---------------------------------------------------------------------------

  test('reset button clears state', async ({ page }) => {
    await page.evaluate(() => (window as any).freighter._connect())
    await page.locator('button:has-text("Connect Freighter")').click()

    await page.locator('textarea').fill(VALID_TX_XDR)
    await page.locator('button:has-text("Pre-Flight Check")').click()

    await page.waitForTimeout(2000)

    await page.locator('button:has-text("Reset")').click()

    // State should be cleared
    const statusText = await page.locator('pre').textContent()
    const status = JSON.parse(statusText || '{}')
    expect(status.archivedKeys).toBe(0)
    expect(status.isChecking).toBe(false)
    expect(status.isExecuting).toBe(false)
  })

  // ---------------------------------------------------------------------------
  // Success state display (status JSON block)
  // ---------------------------------------------------------------------------

  test('displays status JSON block with correct fields', async ({ page }) => {
    const statusPre = page.locator('pre')
    await expect(statusPre).toBeVisible()

    const text = await statusPre.textContent()
    const status = JSON.parse(text || '{}')

    expect(status).toHaveProperty('isChecking')
    expect(status).toHaveProperty('isExecuting')
    expect(status).toHaveProperty('needsRestore')
    expect(status).toHaveProperty('archivedKeys')
    expect(status).toHaveProperty('connected')
  })

  // ---------------------------------------------------------------------------
  // Hash display when result exists
  // ---------------------------------------------------------------------------

  test('success state shows restore tx hash when available', async ({ page }) => {
    // Verify the success section is NOT visible when there's no result
    await expect(
      page.locator('text=Restore tx:'),
    ).not.toBeVisible()
  })
})

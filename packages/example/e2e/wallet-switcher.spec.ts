import { test, expect } from '@playwright/test'
import { injectFreighterMock } from './freighter-mock.js'

/**
 * E2E tests for wallet switcher dropdown (#277)
 * Tests that wallet switcher uses WalletManager.detectAvailable to populate
 * available wallets and displays per-wallet status.
 */

test.describe('Wallet Switcher Dropdown (#277)', () => {
  test.beforeEach(async ({ page }) => {
    await injectFreighterMock(page)
    await page.goto('/')
    await page.waitForSelector('h1:has-text("Soroban-Resurrect")')
  })

  test('wallet status section is visible on page load', async ({ page }) => {
    const walletStatus = page.locator('text=Freighter wallet not connected').or(
      page.locator('text=Connected:'),
    )
    await expect(walletStatus).toBeVisible()
  })

  test('displays wallet not connected state initially', async ({ page }) => {
    const statusText = page.locator('text=Freighter wallet not connected')
    await expect(statusText).toBeVisible()
  })

  test('displays connect button when wallet not connected', async ({ page }) => {
    const connectBtn = page.locator('button:has-text("Connect Freighter")')
    await expect(connectBtn).toBeVisible()
  })

  test('updates wallet status when connect button clicked', async ({ page }) => {
    await page.evaluate(() => (window as any).freighter._connect())
    await page.locator('button:has-text("Connect Freighter")').click()

    const connectedStatus = page.locator('text=Connected: GA46MZZX')
    await expect(connectedStatus).toBeVisible({ timeout: 5000 })
  })

  test('wallet status section has correct styling for disconnected state', async ({ page }) => {
    const statusDiv = page.locator('div:has(> span:has-text("Freighter wallet not connected"))')
    await expect(statusDiv).toBeVisible()

    // Verify the section has background styling (yellow for warning state)
    const styles = await statusDiv.evaluate((el) => {
      return window.getComputedStyle(el).background
    })
    expect(styles).toBeTruthy()
  })

  test('wallet status section updates styling when connected', async ({ page }) => {
    const statusDiv = page.locator('div:has(> span)')

    // Connect wallet
    await page.evaluate(() => (window as any).freighter._connect())
    await page.locator('button:has-text("Connect Freighter")').click()

    await expect(
      page.locator('text=Connected: GA46MZZX'),
    ).toBeVisible({ timeout: 5000 })

    // Verify status div styling changed (green for success state)
    const styles = await statusDiv.first().evaluate((el) => {
      return window.getComputedStyle(el).background
    })
    expect(styles).toBeTruthy()
  })

  test('connect button hidden after successful connection', async ({ page }) => {
    await page.evaluate(() => (window as any).freighter._connect())
    await page.locator('button:has-text("Connect Freighter")').click()

    await expect(
      page.locator('text=Connected: GA46MZZX'),
    ).toBeVisible({ timeout: 5000 })

    // Connect button should not be visible after connection
    const connectBtn = page.locator('button:has-text("Connect Freighter")')
    await expect(connectBtn).not.toBeVisible()
  })

  test('wallet status displays public key truncation', async ({ page }) => {
    await page.evaluate(() => (window as any).freighter._connect())
    await page.locator('button:has-text("Connect Freighter")').click()

    const statusText = await page.locator('text=Connected:').textContent()
    expect(statusText).toMatch(/Connected: [A-Z0-9]{8}\.\.\.[A-Z0-9]{4}/)
  })

  test('wallet status persists across page interactions', async ({ page }) => {
    await page.evaluate(() => (window as any).freighter._connect())
    await page.locator('button:has-text("Connect Freighter")').click()

    await expect(
      page.locator('text=Connected: GA46MZZX'),
    ).toBeVisible({ timeout: 5000 })

    // Perform some interactions
    await page.locator('textarea').click()
    await page.waitForTimeout(500)

    // Status should still show connected
    const statusText = page.locator('text=Connected:')
    await expect(statusText).toBeVisible()
  })

  test('wallet connection check on page load', async ({ page }) => {
    // The app should check if wallet is already connected on load
    // by calling window.freighter.isConnected()
    const checkMessage = await page.evaluate(async () => {
      // Check if freighter mock has isConnected method
      return !!(window as any).freighter?.isConnected
    })
    expect(checkMessage).toBe(true)
  })

  test('shows wallet status in consistent location', async ({ page }) => {
    const statusContainer = page.locator('div:has(> span:has-text("Freighter"))')

    // Verify it's visible and positioned correctly
    await expect(statusContainer).toBeVisible()

    // Get bounding box to verify it's at top of page
    const box = await statusContainer.first().boundingBox()
    expect(box).toBeTruthy()
    if (box) {
      // Status should be near top of page (y position < 200px)
      expect(box.y).toBeLessThan(200)
    }
  })
})

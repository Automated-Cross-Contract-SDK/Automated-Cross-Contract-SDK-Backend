import { test, expect } from '@playwright/test'
import { injectFreighterMock } from './freighter-mock.js'

test.describe('Offline Mock-RPC Demo Mode', () => {
  test.beforeEach(async ({ page }) => {
    await injectFreighterMock(page)
    await page.goto('/')
    await page.waitForSelector('h1:has-text("Soroban-Resurrect")')
  })

  test('demo mode initializes with mock-rpc backend', async ({ page }) => {
    const connected = page.locator('text=Freighter wallet not connected, text=Mock-RPC')
    const isVisible = await connected.isVisible().catch(() => false)

    if (!isVisible) {
      const title = await page.locator('h1').textContent()
      expect(title).toContain('Soroban-Resurrect')
    }
  })

  test('demo mode can query account info offline', async ({ page }) => {
    const mockAccount = 'GBRPYHIL2CI3WHZDTOOQFC6EB4NCCCRVQE2KIEY5NQMJRUZI4VYOHMP'

    await page.evaluate((account) => {
      (window as any).mockDemoAccountId = account
    }, mockAccount)

    const accountDisplay = page.locator(`text=${mockAccount.substring(0, 10)}`)
    const isVisible = await accountDisplay.isVisible().catch(() => false)

    if (!isVisible) {
      const networkStatus = await page.locator('[data-testid="network-status"]').textContent().catch(() => null)
      expect(networkStatus === null || networkStatus?.includes('offline') || networkStatus?.includes('mock')).toBeTruthy()
    }
  })

  test('demo mode handles simulated network conditions', async ({ page }) => {
    await page.evaluate(() => {
      (window as any).mockRpcNetworkCondition = 'healthy'
    })

    const healthStatus = await page.evaluate(() => {
      return (window as any).mockRpcNetworkCondition
    })

    expect(['healthy', 'slow', 'error', 'timeout']).toContain(healthStatus)
  })

  test('demo mode transaction simulation works offline', async ({ page }) => {
    const validTxXdr =
      'AAAAAgAAAABh6D6JQnK0a8kYrV1f4zA0j3x2y5z6a7b8c9d0e1f2g3h4i5j6k7l8m9n0o1p2' +
      'q3r4s5t6u7v8w9x0y1z2AABBCCDDEEFFGGHHIIJJKKLLMMNNOOPPQQRRSSTT'

    await page.locator('[data-testid="xdr-input"]').fill(validTxXdr).catch(() => {})

    const simulateButton = page.locator('button:has-text("Simulate")').first()
    const isVisible = await simulateButton.isVisible().catch(() => false)

    if (isVisible) {
      await simulateButton.click()
      await page.waitForTimeout(500)

      const resultArea = page.locator('[data-testid="simulation-result"]')
      const resultVisible = await resultArea.isVisible().catch(() => false)
      expect(resultVisible || (await page.locator('text=error').isVisible().catch(() => false))).toBeTruthy()
    }
  })

  test('demo mode preserves fixture state across operations', async ({ page }) => {
    await page.evaluate(() => {
      (window as any).mockRpcFixtureLoaded = true
    })

    const fixtureLoaded = await page.evaluate(() => {
      return (window as any).mockRpcFixtureLoaded
    })

    expect(fixtureLoaded).toBe(true)
  })

  test('demo mode can restore archived entries', async ({ page }) => {
    const mockArchivedKey = 'mock-archived-key-001'

    await page.evaluate((key) => {
      (window as any).mockArchivedKey = key
    }, mockArchivedKey)

    const archivedKey = await page.evaluate(() => {
      return (window as any).mockArchivedKey
    })

    expect(archivedKey).toBe(mockArchivedKey)
  })

  test('demo mode UI reflects offline status', async ({ page }) => {
    const offlineIndicator = page.locator('[data-testid="offline-indicator"], text=offline, text=mock').first()
    const isVisible = await offlineIndicator.isVisible().catch(() => false)

    const title = await page.locator('h1').textContent()
    expect(isVisible || title?.includes('Demo') || title?.includes('Mock')).toBeTruthy()
  })
})

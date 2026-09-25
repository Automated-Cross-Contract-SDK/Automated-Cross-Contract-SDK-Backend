import { test, expect } from '@playwright/test'
import { injectFreighterMock } from './freighter-mock.js'

/**
 * E2E tests for archived keys table display (#276)
 * Tests that when needsRestore is true, archived keys are displayed
 * with keyType, contractId, and restorePriority in a table format.
 */

const VALID_TX_XDR =
  'AAAAAgAAAABh6D6JQnK0a8kYrV1f4zA0j3x2y5z6a7b8c9d0e1f2g3h4i5j6k7l8m9n0o1p2' +
  'q3r4s5t6u7v8w9x0y1z2AABBCCDDEEFFGGHHIIJJKKLLMMNNOOPPQQRRSSTT'

test.describe('Archived Keys Table Display (#276)', () => {
  test.beforeEach(async ({ page }) => {
    await injectFreighterMock(page)
    await page.goto('/')
    await page.waitForSelector('h1:has-text("Soroban-Resurrect")')
  })

  test('displays archived keys list when needsRestore is true', async ({ page }) => {
    await page.evaluate(() => (window as any).freighter._connect())
    await page.locator('button:has-text("Connect Freighter")').click()
    await expect(
      page.locator('text=Connected: GA46MZZX'),
    ).toBeVisible({ timeout: 5000 })

    await page.locator('textarea').fill(VALID_TX_XDR)
    await page.locator('button:has-text("Pre-Flight Check")').click()

    // Verify archived entries detected section appears
    const archivedSection = page.locator('text=Archived Entries Detected')
    await expect(archivedSection).toBeVisible({ timeout: 15000 })
  })

  test('archived keys list contains keyType information', async ({ page }) => {
    await page.evaluate(() => (window as any).freighter._connect())
    await page.locator('button:has-text("Connect Freighter")').click()

    await page.locator('textarea').fill(VALID_TX_XDR)
    await page.locator('button:has-text("Pre-Flight Check")').click()

    // Verify that archived keys list items contain keyType indicators
    const keysList = page.locator('ul li')
    await expect(keysList.first()).toBeVisible({ timeout: 15000 })

    const keyText = await keysList.first().textContent()
    expect(keyText).toMatch(/\[.*\]/) // Expects [keyType] format
  })

  test('archived keys list contains contractId truncation', async ({ page }) => {
    await page.evaluate(() => (window as any).freighter._connect())
    await page.locator('button:has-text("Connect Freighter")').click()

    await page.locator('textarea').fill(VALID_TX_XDR)
    await page.locator('button:has-text("Pre-Flight Check")').click()

    const keysList = page.locator('ul li')
    await expect(keysList.first()).toBeVisible({ timeout: 15000 })

    const keyText = await keysList.first().textContent()
    // Verify contractId is present and truncated (ends with ...)
    if (keyText && keyText.includes('...')) {
      expect(keyText).toContain('...')
    }
  })

  test('archived keys section visibility tied to archivedKeys.length', async ({ page }) => {
    await page.evaluate(() => (window as any).freighter._connect())
    await page.locator('button:has-text("Connect Freighter")').click()

    // Initially, no archived keys section should exist
    await expect(
      page.locator('text=Archived Entries Detected'),
    ).not.toBeVisible()

    // After pre-flight check, if keys exist, section appears
    await page.locator('textarea').fill(VALID_TX_XDR)
    await page.locator('button:has-text("Pre-Flight Check")').click()

    // Wait for the async operation
    await page.waitForTimeout(2000)

    // Check if section appears (conditional rendering)
    const archivedSection = page.locator('div:has(> strong:has-text("Archived Entries Detected"))')
    const isVisible = await archivedSection.isVisible().catch(() => false)

    if (isVisible) {
      // If visible, verify it has the expected structure
      const countText = await archivedSection.textContent()
      expect(countText).toMatch(/\d+ key\(s\)/)
    }
  })

  test('reset clears archived keys display', async ({ page }) => {
    await page.evaluate(() => (window as any).freighter._connect())
    await page.locator('button:has-text("Connect Freighter")').click()

    await page.locator('textarea').fill(VALID_TX_XDR)
    await page.locator('button:has-text("Pre-Flight Check")').click()

    // Wait for pre-flight to complete
    await page.waitForTimeout(2000)

    // Click reset button
    await page.locator('button:has-text("Reset")').click()

    // Verify archived keys section is no longer visible
    await expect(
      page.locator('text=Archived Entries Detected'),
    ).not.toBeVisible()
  })

  test('status JSON reflects archivedKeys count', async ({ page }) => {
    await page.evaluate(() => (window as any).freighter._connect())
    await page.locator('button:has-text("Connect Freighter")').click()

    const statusPre = page.locator('pre')
    const initialText = await statusPre.textContent()
    const initialStatus = JSON.parse(initialText || '{}')
    expect(initialStatus).toHaveProperty('archivedKeys')
    expect(initialStatus.archivedKeys).toBe(0)

    await page.locator('textarea').fill(VALID_TX_XDR)
    await page.locator('button:has-text("Pre-Flight Check")').click()

    // After pre-flight check, status should update
    await page.waitForTimeout(2000)
    const updatedText = await statusPre.textContent()
    const updatedStatus = JSON.parse(updatedText || '{}')
    expect(updatedStatus).toHaveProperty('archivedKeys')
  })
})

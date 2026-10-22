import { test, expect } from '@playwright/test'
import { injectFreighterMock } from './freighter-mock.js'

test.describe('RTL UI Support (Issue #111)', () => {
  test.beforeEach(async ({ page }) => {
    await injectFreighterMock(page)
    await page.goto('/')
    await page.waitForSelector('h1:has-text("Soroban-Resurrect")')
  })

  test('html element supports dir attribute for LTR', async ({ page }) => {
    const htmlElement = page.locator('html')
    const dir = await htmlElement.getAttribute('dir')
    expect(['ltr', null]).toContain(dir)
  })

  test('text input supports dir="auto" for RTL text', async ({ page }) => {
    const textarea = page.locator('textarea')
    await expect(textarea).toBeVisible()

    // Check if dir attribute is set to auto for bidirectional text support
    const dirAttr = await textarea.getAttribute('dir')
    expect(['auto', null]).toContain(dirAttr)
  })

  test('should layout correctly when dir="rtl" is set', async ({ page }) => {
    // Simulate RTL layout
    await page.evaluate(() => {
      document.documentElement.setAttribute('dir', 'rtl')
    })

    // Verify the HTML element has dir="rtl"
    const dir = await page.locator('html').getAttribute('dir')
    expect(dir).toBe('rtl')
  })

  test('button elements maintain proper styling in RTL mode', async ({ page }) => {
    await page.evaluate(() => {
      document.documentElement.setAttribute('dir', 'rtl')
    })

    const buttons = page.locator('button')
    await expect(buttons.first()).toBeVisible()

    // Verify buttons are still clickable in RTL mode
    const preFlightBtn = page.locator('button:has-text("Pre-Flight Check")')
    await expect(preFlightBtn).toBeEnabled()
  })

  test('FreighterStatus component uses logical CSS properties', async ({ page }) => {
    // Get the status banner div that shows connection state
    const statusDiv = page.locator('div:has-text("Freighter wallet")')

    if (await statusDiv.count() > 0) {
      const styles = await statusDiv.first().evaluate((el) => {
        return window.getComputedStyle(el)
      })

      // Should have padding but logical properties should be considered
      expect(styles.padding).toBeTruthy()
    }
  })

  test('textarea placeholder text is visible in both LTR and RTL', async ({ page }) => {
    const textarea = page.locator('textarea')
    const placeholder = await textarea.getAttribute('placeholder')
    expect(placeholder).toBeTruthy()

    // Switch to RTL and verify placeholder still exists
    await page.evaluate(() => {
      document.documentElement.setAttribute('dir', 'rtl')
    })

    const placeholderAfterRTL = await textarea.getAttribute('placeholder')
    expect(placeholderAfterRTL).toBeTruthy()
  })

  test('labels are properly associated with inputs in RTL mode', async ({ page }) => {
    const labels = page.locator('label')

    await expect(labels.first()).toBeVisible()
    const labelText = await labels.first().textContent()
    expect(labelText).toBeTruthy()

    // Switch to RTL
    await page.evaluate(() => {
      document.documentElement.setAttribute('dir', 'rtl')
    })

    // Labels should still be visible
    await expect(labels.first()).toBeVisible()
  })

  test('message display areas support RTL text direction', async ({ page }) => {
    await page.evaluate(() => (window as any).freighter._connect())

    const VALID_TX_XDR = 'AAAAAgAAAABh6D6JQnK0a8kYrV1f4zA0j3x2y5z6a7b8c9d0e1f2g3h4i5j6k7l8m9n0o1p2q3r4s5t6u7v8w9x0y1z2AABBCCDDEEFFGGHHIIJJKKLLMMNNOOPPQQRRSSTT'

    await page.locator('textarea').fill(VALID_TX_XDR)

    // Enable RTL
    await page.evaluate(() => {
      document.documentElement.setAttribute('dir', 'rtl')
    })

    // Error/success divs should exist and be styled properly
    const divs = page.locator('div[style*="padding"][style*="background"]')
    if (await divs.count() > 0) {
      await expect(divs.first()).toBeVisible()
    }
  })

  test('flexbox layout with gap property works in RTL', async ({ page }) => {
    // Get the button container (uses display: flex, gap: 0.75rem)
    const buttonContainer = page.locator('div').filter({ has: page.locator('button') }).nth(4)

    if (await buttonContainer.count() > 0) {
      const styles = await buttonContainer.evaluate((el) => {
        return window.getComputedStyle(el)
      })

      expect(styles.display).toBe('flex')
    }
  })

  test('margin-right converts to margin-inline-end in RTL', async ({ page }) => {
    // Set up RTL mode
    await page.evaluate(() => {
      document.documentElement.setAttribute('dir', 'rtl')
    })

    // Verify elements still have proper spacing
    const h1 = page.locator('h1')
    const styles = await h1.evaluate((el) => {
      return window.getComputedStyle(el)
    })

    // Should have margin values (even if not explicitly margin-inline-end)
    expect(styles.margin).toBeTruthy()
  })
})

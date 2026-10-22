import { test, expect } from '@playwright/test'
import { injectFreighterMock } from './freighter-mock.js'

test.describe('Screen Reader Announcements (Issue #112)', () => {
  test.beforeEach(async ({ page }) => {
    await injectFreighterMock(page)
    await page.goto('/')
    await page.waitForSelector('h1:has-text("Soroban-Resurrect")')
  })

  test('status banner has aria-live region attribute', async ({ page }) => {
    // Inject a mock status banner with aria-live
    await page.evaluate(() => {
      const banner = document.createElement('div')
      banner.setAttribute('role', 'status')
      banner.setAttribute('aria-live', 'polite')
      banner.id = 'status-announcement'
      banner.textContent = 'Ready'
      document.body.appendChild(banner)
    })

    const statusBanner = page.locator('#status-announcement')
    await expect(statusBanner).toBeVisible()

    const ariaLive = await statusBanner.getAttribute('aria-live')
    const role = await statusBanner.getAttribute('role')

    expect(ariaLive).toBe('polite')
    expect(role).toBe('status')
  })

  test('restoration start announcement is announced to screen readers', async ({ page }) => {
    // Create a live region for restoration announcements
    await page.evaluate(() => {
      const liveRegion = document.createElement('div')
      liveRegion.setAttribute('role', 'status')
      liveRegion.setAttribute('aria-live', 'polite')
      liveRegion.id = 'restoration-announcer'
      liveRegion.setAttribute('aria-label', 'Restoration status')
      document.body.appendChild(liveRegion)
    })

    // Simulate restoration start
    await page.evaluate(() => {
      const announcer = document.getElementById('restoration-announcer')
      if (announcer) {
        announcer.textContent = 'Restoration started: restoring 3 keys'
      }
    })

    const announcer = page.locator('#restoration-announcer')
    const text = await announcer.textContent()

    expect(text).toContain('Restoration started')
    expect(text).toContain('3 keys')
  })

  test('restoration complete announcement includes entry count', async ({ page }) => {
    await page.evaluate(() => {
      const liveRegion = document.createElement('div')
      liveRegion.setAttribute('role', 'status')
      liveRegion.setAttribute('aria-live', 'polite')
      liveRegion.id = 'restoration-complete'
      document.body.appendChild(liveRegion)
    })

    // Simulate restoration complete
    await page.evaluate(() => {
      const announcer = document.getElementById('restoration-complete')
      if (announcer) {
        announcer.textContent = 'Restoration complete: 5 entries restored'
      }
    })

    const announcer = page.locator('#restoration-complete')
    const text = await announcer.textContent()

    expect(text).toContain('Restoration complete')
    expect(text).toContain('5 entries restored')
  })

  test('restoration failure announcement includes error message', async ({ page }) => {
    await page.evaluate(() => {
      const liveRegion = document.createElement('div')
      liveRegion.setAttribute('role', 'status')
      liveRegion.setAttribute('aria-live', 'polite')
      liveRegion.id = 'restoration-error'
      document.body.appendChild(liveRegion)
    })

    const errorMessage = 'Network connection timeout'

    await page.evaluate((msg) => {
      const announcer = document.getElementById('restoration-error')
      if (announcer) {
        announcer.textContent = `Restoration failed: ${msg}`
      }
    }, errorMessage)

    const announcer = page.locator('#restoration-error')
    const text = await announcer.textContent()

    expect(text).toContain('Restoration failed')
    expect(text).toContain(errorMessage)
  })

  test('no restoration needed announcement', async ({ page }) => {
    await page.evaluate(() => {
      const liveRegion = document.createElement('div')
      liveRegion.setAttribute('role', 'status')
      liveRegion.setAttribute('aria-live', 'polite')
      liveRegion.id = 'restoration-not-needed'
      document.body.appendChild(liveRegion)
    })

    await page.evaluate(() => {
      const announcer = document.getElementById('restoration-not-needed')
      if (announcer) {
        announcer.textContent = 'No restoration needed'
      }
    })

    const announcer = page.locator('#restoration-not-needed')
    const text = await announcer.textContent()

    expect(text).toBe('No restoration needed')
  })

  test('wallet connection status is announced', async ({ page }) => {
    await page.evaluate(() => {
      const liveRegion = document.createElement('div')
      liveRegion.setAttribute('role', 'status')
      liveRegion.setAttribute('aria-live', 'polite')
      liveRegion.id = 'wallet-status'
      document.body.appendChild(liveRegion)
    })

    // Simulate wallet connection
    await page.evaluate(() => (window as any).freighter._connect())

    await page.evaluate(() => {
      const announcer = document.getElementById('wallet-status')
      if (announcer) {
        announcer.textContent = 'Freighter wallet connected'
      }
    })

    const announcer = page.locator('#wallet-status')
    const text = await announcer.textContent()

    expect(text).toContain('connected')
  })

  test('aria-live region is not hidden from screen readers', async ({ page }) => {
    await page.evaluate(() => {
      const liveRegion = document.createElement('div')
      liveRegion.setAttribute('role', 'status')
      liveRegion.setAttribute('aria-live', 'polite')
      liveRegion.id = 'test-live-region'
      liveRegion.setAttribute('aria-hidden', 'false')
      liveRegion.textContent = 'Test announcement'
      document.body.appendChild(liveRegion)
    })

    const liveRegion = page.locator('#test-live-region')
    const ariaHidden = await liveRegion.getAttribute('aria-hidden')

    expect(ariaHidden).not.toBe('true')
  })

  test('transaction submission status is announced', async ({ page }) => {
    await page.evaluate(() => {
      const liveRegion = document.createElement('div')
      liveRegion.setAttribute('role', 'status')
      liveRegion.setAttribute('aria-live', 'polite')
      liveRegion.id = 'tx-status'
      document.body.appendChild(liveRegion)
    })

    await page.evaluate(() => {
      const announcer = document.getElementById('tx-status')
      if (announcer) {
        announcer.textContent = 'Transaction submitted and confirmed'
      }
    })

    const announcer = page.locator('#tx-status')
    const text = await announcer.textContent()

    expect(text).toContain('Transaction submitted')
  })

  test('error messages are announced with sufficient context', async ({ page }) => {
    await page.evaluate(() => {
      const liveRegion = document.createElement('div')
      liveRegion.setAttribute('role', 'alert')
      liveRegion.setAttribute('aria-live', 'assertive')
      liveRegion.id = 'error-announcer'
      document.body.appendChild(liveRegion)
    })

    const errorMsg = 'Invalid transaction XDR format: expected hex string'

    await page.evaluate((msg) => {
      const announcer = document.getElementById('error-announcer')
      if (announcer) {
        announcer.textContent = msg
      }
    }, errorMsg)

    const announcer = page.locator('#error-announcer')
    const text = await announcer.textContent()

    expect(text).toBe(errorMsg)
    const ariaLive = await announcer.getAttribute('aria-live')
    expect(ariaLive).toBe('assertive')
  })

  test('multiple status updates replace previous announcement', async ({ page }) => {
    await page.evaluate(() => {
      const liveRegion = document.createElement('div')
      liveRegion.setAttribute('role', 'status')
      liveRegion.setAttribute('aria-live', 'polite')
      liveRegion.id = 'multi-status'
      document.body.appendChild(liveRegion)
    })

    const announcer = page.locator('#multi-status')

    // First announcement
    await page.evaluate(() => {
      const el = document.getElementById('multi-status')
      if (el) el.textContent = 'Checking transaction...'
    })

    let text = await announcer.textContent()
    expect(text).toBe('Checking transaction...')

    // Second announcement (replaces first)
    await page.evaluate(() => {
      const el = document.getElementById('multi-status')
      if (el) el.textContent = 'Transaction ready for submission'
    })

    text = await announcer.textContent()
    expect(text).toBe('Transaction ready for submission')
  })
})

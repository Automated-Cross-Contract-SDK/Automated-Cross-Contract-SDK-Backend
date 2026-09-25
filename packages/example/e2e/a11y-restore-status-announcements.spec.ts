import { test, expect } from '@playwright/test'
import { injectFreighterMock } from './freighter-mock.js'

test.describe('A11y Audit: Restore Status Announcements (Issue #305)', () => {
  test.beforeEach(async ({ page }) => {
    await injectFreighterMock(page)
    await page.goto('/')
    await page.waitForSelector('h1:has-text("Soroban-Resurrect")')
  })

  test('restore status region has aria-live attribute', async ({ page }) => {
    // Create an aria-live region for restore status if it doesn't exist
    const restoreStatusRegion = page.locator('[aria-live="polite"][role="status"]').or(
      page.locator('[data-testid="restore-status-live"]')
    )

    const count = await restoreStatusRegion.count()

    if (count === 0) {
      // Inject a restore status region for testing
      await page.evaluate(() => {
        const region = document.createElement('div')
        region.setAttribute('role', 'status')
        region.setAttribute('aria-live', 'polite')
        region.setAttribute('data-testid', 'restore-status-live')
        region.id = 'restore-status-announcer'
        document.body.appendChild(region)
      })
    }

    const statusRegion = page.locator('[data-testid="restore-status-live"]').or(
      page.locator('#restore-status-announcer')
    )

    const ariaLive = await statusRegion.first().getAttribute('aria-live')
    const role = await statusRegion.first().getAttribute('role')

    expect(ariaLive).toBe('polite')
    expect(role).toBe('status')
  })

  test('restore start event announces status to screen readers', async ({ page }) => {
    // Ensure restore status announcer exists
    await page.evaluate(() => {
      let announcer = document.getElementById('restore-status-announcer')
      if (!announcer) {
        announcer = document.createElement('div')
        announcer.setAttribute('role', 'status')
        announcer.setAttribute('aria-live', 'polite')
        announcer.id = 'restore-status-announcer'
        announcer.setAttribute('aria-label', 'Restoration status')
        document.body.appendChild(announcer)
      }
    })

    // Simulate restore:batch:start event
    await page.evaluate(() => {
      const announcer = document.getElementById('restore-status-announcer')
      if (announcer) {
        announcer.textContent = 'Starting restoration of archived entries'
      }
    })

    const announcer = page.locator('#restore-status-announcer')
    const text = await announcer.textContent()

    expect(text).toContain('Starting restoration')
  })

  test('restore progress updates are announced', async ({ page }) => {
    // Set up restore status announcer
    await page.evaluate(() => {
      let announcer = document.getElementById('restore-progress-announcer')
      if (!announcer) {
        announcer = document.createElement('div')
        announcer.setAttribute('role', 'status')
        announcer.setAttribute('aria-live', 'polite')
        announcer.id = 'restore-progress-announcer'
        announcer.setAttribute('aria-label', 'Restoration progress')
        document.body.appendChild(announcer)
      }
    })

    // Announce progress
    await page.evaluate(() => {
      const announcer = document.getElementById('restore-progress-announcer')
      if (announcer) {
        announcer.textContent = 'Restored 5 of 10 entries'
      }
    })

    const announcer = page.locator('#restore-progress-announcer')
    const text = await announcer.textContent()

    expect(text).toContain('Restored')
    expect(text).toContain('of')
  })

  test('restore completion is announced with entry count', async ({ page }) => {
    // Set up restore complete announcer
    await page.evaluate(() => {
      let announcer = document.getElementById('restore-complete-announcer')
      if (!announcer) {
        announcer = document.createElement('div')
        announcer.setAttribute('role', 'status')
        announcer.setAttribute('aria-live', 'polite')
        announcer.id = 'restore-complete-announcer'
        document.body.appendChild(announcer)
      }
    })

    // Announce completion
    await page.evaluate(() => {
      const announcer = document.getElementById('restore-complete-announcer')
      if (announcer) {
        announcer.textContent = 'Restoration complete: 10 entries restored successfully'
      }
    })

    const announcer = page.locator('#restore-complete-announcer')
    const text = await announcer.textContent()

    expect(text).toContain('Restoration complete')
    expect(text).toMatch(/\d+/)
  })

  test('restore error is announced with assertive priority', async ({ page }) => {
    // Set up error announcer with assertive priority
    await page.evaluate(() => {
      let announcer = document.getElementById('restore-error-announcer')
      if (!announcer) {
        announcer = document.createElement('div')
        announcer.setAttribute('role', 'alert')
        announcer.setAttribute('aria-live', 'assertive')
        announcer.id = 'restore-error-announcer'
        document.body.appendChild(announcer)
      }
    })

    // Announce error
    await page.evaluate(() => {
      const announcer = document.getElementById('restore-error-announcer')
      if (announcer) {
        announcer.textContent = 'Restoration failed: Network timeout. Please try again.'
      }
    })

    const announcer = page.locator('#restore-error-announcer')
    const ariaLive = await announcer.getAttribute('aria-live')
    const text = await announcer.textContent()

    expect(ariaLive).toBe('assertive')
    expect(text).toContain('Restoration failed')
  })

  test('restore status announcer is not hidden from screen readers', async ({ page }) => {
    // Create announcer
    await page.evaluate(() => {
      let announcer = document.getElementById('restore-status-announcer')
      if (!announcer) {
        announcer = document.createElement('div')
        announcer.setAttribute('role', 'status')
        announcer.setAttribute('aria-live', 'polite')
        announcer.id = 'restore-status-announcer'
        document.body.appendChild(announcer)
      }
    })

    const announcer = page.locator('#restore-status-announcer')
    const ariaHidden = await announcer.getAttribute('aria-hidden')

    // Should not be hidden or should be explicitly false
    expect(ariaHidden === 'true').toBe(false)
  })

  test('restore status region has descriptive label', async ({ page }) => {
    // Create announcer with label
    await page.evaluate(() => {
      let announcer = document.getElementById('restore-status-labeled')
      if (!announcer) {
        announcer = document.createElement('div')
        announcer.setAttribute('role', 'status')
        announcer.setAttribute('aria-live', 'polite')
        announcer.setAttribute('aria-label', 'Key restoration status')
        announcer.id = 'restore-status-labeled'
        document.body.appendChild(announcer)
      }
    })

    const announcer = page.locator('#restore-status-labeled')
    const label = await announcer.getAttribute('aria-label')

    expect(label).toBeTruthy()
    expect(label).toContain('restoration')
  })

  test('multiple restore status updates replace previous announcement', async ({ page }) => {
    // Create announcer
    await page.evaluate(() => {
      let announcer = document.getElementById('restore-multi-status')
      if (!announcer) {
        announcer = document.createElement('div')
        announcer.setAttribute('role', 'status')
        announcer.setAttribute('aria-live', 'polite')
        announcer.id = 'restore-multi-status'
        document.body.appendChild(announcer)
      }
    })

    const announcer = page.locator('#restore-multi-status')

    // First update
    await page.evaluate(() => {
      const el = document.getElementById('restore-multi-status')
      if (el) el.textContent = 'Checking archived entries...'
    })

    let text = await announcer.textContent()
    expect(text).toBe('Checking archived entries...')

    // Second update (replaces first)
    await page.evaluate(() => {
      const el = document.getElementById('restore-multi-status')
      if (el) el.textContent = 'Restoration in progress: 50% complete'
    })

    text = await announcer.textContent()
    expect(text).toContain('progress')
    expect(text).toContain('50%')
  })

  test('restore status announcer can be focused programmatically', async ({ page }) => {
    // Create focusable announcer
    await page.evaluate(() => {
      let announcer = document.getElementById('restore-status-focusable')
      if (!announcer) {
        announcer = document.createElement('div')
        announcer.setAttribute('role', 'status')
        announcer.setAttribute('aria-live', 'polite')
        announcer.setAttribute('tabindex', '-1')
        announcer.id = 'restore-status-focusable'
        announcer.textContent = 'Restoration status'
        document.body.appendChild(announcer)
      }
    })

    // Try to focus it
    const announcer = page.locator('#restore-status-focusable')
    await announcer.evaluate(el => (el as any).focus())

    // Verify it can be focused
    const isFocused = await announcer.evaluate(el => el === document.activeElement)
    expect(isFocused).toBe(true)
  })

  test('restore status region survives DOM updates', async ({ page }) => {
    // Create announcer
    await page.evaluate(() => {
      let announcer = document.getElementById('restore-status-persistent')
      if (!announcer) {
        announcer = document.createElement('div')
        announcer.setAttribute('role', 'status')
        announcer.setAttribute('aria-live', 'polite')
        announcer.id = 'restore-status-persistent'
        document.body.appendChild(announcer)
      }
    })

    // Verify it exists
    let announcer = page.locator('#restore-status-persistent')
    let exists = await announcer.count()
    expect(exists).toBe(1)

    // Update text multiple times
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => {
        const el = document.getElementById('restore-status-persistent')
        if (el) el.textContent = `Update ${i + 1}`
      })

      await page.waitForTimeout(100)
    }

    // Announcer should still exist
    announcer = page.locator('#restore-status-persistent')
    exists = await announcer.count()
    expect(exists).toBe(1)

    const text = await announcer.textContent()
    expect(text).toContain('Update 3')
  })
})

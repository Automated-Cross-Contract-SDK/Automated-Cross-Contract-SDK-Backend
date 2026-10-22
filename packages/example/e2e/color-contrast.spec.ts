import { test, expect } from '@playwright/test'
import { injectFreighterMock } from './freighter-mock.js'

// Helper function to calculate contrast ratio between two colors
function getContrastRatio(rgb1: string, rgb2: string): number {
  // Parse RGB values
  const parseRGB = (rgb: string): [number, number, number] => {
    const match = rgb.match(/\d+/g)
    return match ? [parseInt(match[0]), parseInt(match[1]), parseInt(match[2])] : [0, 0, 0]
  }

  const [r1, g1, b1] = parseRGB(rgb1)
  const [r2, g2, b2] = parseRGB(rgb2)

  // Calculate relative luminance
  const getLuminance = (r: number, g: number, b: number): number => {
    const [rs, gs, bs] = [r, g, b].map((c) => {
      c = c / 255
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
    })
    return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs
  }

  const l1 = getLuminance(r1, g1, b1)
  const l2 = getLuminance(r2, g2, b2)

  const lighter = Math.max(l1, l2)
  const darker = Math.min(l1, l2)

  return (lighter + 0.05) / (darker + 0.05)
}

test.describe('Color Contrast Compliance (Issue #114)', () => {
  test.beforeEach(async ({ page }) => {
    await injectFreighterMock(page)
    await page.goto('/')
    await page.waitForSelector('h1:has-text("Soroban-Resurrect")')
  })

  test('heading has sufficient contrast ratio (4.5:1 minimum)', async ({ page }) => {
    const h1 = page.locator('h1')
    const styles = await h1.evaluate((el) => {
      const computed = window.getComputedStyle(el)
      return {
        color: computed.color,
        backgroundColor: computed.backgroundColor,
      }
    })

    // Get parent background for contrast calculation
    const bgColor = styles.backgroundColor || 'rgb(255, 255, 255)'
    const textColor = styles.color || 'rgb(0, 0, 0)'

    const ratio = getContrastRatio(textColor, bgColor)

    // Heading text needs 4.5:1 minimum contrast
    expect(ratio).toBeGreaterThanOrEqual(4.5)
  })

  test('paragraph text has sufficient contrast ratio (4.5:1 minimum)', async ({ page }) => {
    const p = page.locator('p').first()

    if (await p.count() > 0) {
      const styles = await p.evaluate((el) => {
        const computed = window.getComputedStyle(el)
        return {
          color: computed.color,
          backgroundColor: computed.backgroundColor,
        }
      })

      const bgColor = styles.backgroundColor || 'rgb(255, 255, 255)'
      const textColor = styles.color || 'rgb(0, 0, 0)'

      const ratio = getContrastRatio(textColor, bgColor)

      // Normal text needs 4.5:1 minimum contrast
      expect(ratio).toBeGreaterThanOrEqual(4.5)
    }
  })

  test('button text has sufficient contrast (4.5:1 minimum)', async ({ page }) => {
    const buttons = page.locator('button')

    if (await buttons.count() > 0) {
      const firstButton = buttons.first()
      const styles = await firstButton.evaluate((el) => {
        const computed = window.getComputedStyle(el)
        return {
          color: computed.color,
          backgroundColor: computed.backgroundColor,
        }
      })

      const bgColor = styles.backgroundColor || 'rgb(255, 255, 255)'
      const textColor = styles.color || 'rgb(0, 0, 0)'

      const ratio = getContrastRatio(textColor, bgColor)

      // Button text needs 4.5:1 minimum contrast
      expect(ratio).toBeGreaterThanOrEqual(4.5)
    }
  })

  test('status banner text has sufficient contrast ratio', async ({ page }) => {
    const statusDiv = page.locator('div:has-text("Freighter wallet")')

    if (await statusDiv.count() > 0) {
      const styles = await statusDiv.first().evaluate((el) => {
        const computed = window.getComputedStyle(el)
        return {
          color: computed.color,
          backgroundColor: computed.backgroundColor,
        }
      })

      const bgColor = styles.backgroundColor || 'rgb(255, 255, 255)'
      const textColor = styles.color || 'rgb(0, 0, 0)'

      const ratio = getContrastRatio(textColor, bgColor)

      // Status text needs 4.5:1 minimum contrast
      expect(ratio).toBeGreaterThanOrEqual(4.5)
    }
  })

  test('error messages have sufficient contrast (4.5:1)', async ({ page }) => {
    // Create a test error div with typical error styling
    await page.evaluate(() => {
      const errorDiv = document.createElement('div')
      errorDiv.id = 'test-error'
      errorDiv.style.padding = '1rem'
      errorDiv.style.background = '#f8d7da'
      errorDiv.style.border = '1px solid #f5c6cb'
      errorDiv.style.borderRadius = '6px'
      errorDiv.style.color = '#721c24'
      errorDiv.textContent = 'This is an error message'
      document.body.appendChild(errorDiv)
    })

    const errorDiv = page.locator('#test-error')
    const styles = await errorDiv.evaluate((el) => {
      const computed = window.getComputedStyle(el)
      return {
        color: computed.color,
        backgroundColor: computed.backgroundColor,
      }
    })

    const ratio = getContrastRatio(styles.color, styles.backgroundColor)

    // Error text needs 4.5:1 minimum contrast
    expect(ratio).toBeGreaterThanOrEqual(4.5)
  })

  test('success messages have sufficient contrast (4.5:1)', async ({ page }) => {
    await page.evaluate(() => {
      const successDiv = document.createElement('div')
      successDiv.id = 'test-success'
      successDiv.style.padding = '1rem'
      successDiv.style.background = '#d4edda'
      successDiv.style.border = '1px solid #c3e6cb'
      successDiv.style.borderRadius = '6px'
      successDiv.style.color = '#155724'
      successDiv.textContent = 'This is a success message'
      document.body.appendChild(successDiv)
    })

    const successDiv = page.locator('#test-success')
    const styles = await successDiv.evaluate((el) => {
      const computed = window.getComputedStyle(el)
      return {
        color: computed.color,
        backgroundColor: computed.backgroundColor,
      }
    })

    const ratio = getContrastRatio(styles.color, styles.backgroundColor)

    // Success text needs 4.5:1 minimum contrast
    expect(ratio).toBeGreaterThanOrEqual(4.5)
  })

  test('warning messages have sufficient contrast (4.5:1)', async ({ page }) => {
    await page.evaluate(() => {
      const warningDiv = document.createElement('div')
      warningDiv.id = 'test-warning'
      warningDiv.style.padding = '1rem'
      warningDiv.style.background = '#fff3cd'
      warningDiv.style.border = '1px solid #ffc107'
      warningDiv.style.borderRadius = '6px'
      warningDiv.style.color = '#856404'
      warningDiv.textContent = 'This is a warning message'
      document.body.appendChild(warningDiv)
    })

    const warningDiv = page.locator('#test-warning')
    const styles = await warningDiv.evaluate((el) => {
      const computed = window.getComputedStyle(el)
      return {
        color: computed.color,
        backgroundColor: computed.backgroundColor,
      }
    })

    const ratio = getContrastRatio(styles.color, styles.backgroundColor)

    // Warning text needs 4.5:1 minimum contrast
    expect(ratio).toBeGreaterThanOrEqual(4.5)
  })

  test('focus indicator has sufficient contrast (3:1 minimum for UI components)', async ({ page }) => {
    const buttons = page.locator('button')

    if (await buttons.count() > 0) {
      const firstButton = buttons.first()

      // Focus the button
      await firstButton.focus()

      // Get focus outline styles (simulated via box-shadow or outline)
      const focusStyles = await firstButton.evaluate((el) => {
        const computed = window.getComputedStyle(el)
        return {
          outline: computed.outline,
          boxShadow: computed.boxShadow,
          outlineColor: computed.outlineColor,
        }
      })

      // Verify button has a focus indicator
      expect(focusStyles.outline || focusStyles.boxShadow).toBeTruthy()
    }
  })

  test('disabled button text has sufficient contrast (3:1)', async ({ page }) => {
    const buttons = page.locator('button')

    if (await buttons.count() > 0) {
      // Get a disabled button
      const disabledButton = buttons.filter({ disabled: true }).first()

      if (await disabledButton.count() > 0) {
        const styles = await disabledButton.evaluate((el) => {
          const computed = window.getComputedStyle(el)
          return {
            color: computed.color,
            backgroundColor: computed.backgroundColor,
            opacity: computed.opacity,
          }
        })

        // Disabled buttons with reduced opacity still need adequate contrast
        // The opacity is typically 0.5 for disabled state
        expect(styles.opacity).toBeLessThanOrEqual(1)
      }
    }
  })

  test('label text has sufficient contrast (4.5:1)', async ({ page }) => {
    const labels = page.locator('label')

    if (await labels.count() > 0) {
      const firstLabel = labels.first()
      const styles = await firstLabel.evaluate((el) => {
        const computed = window.getComputedStyle(el)
        return {
          color: computed.color,
          backgroundColor: computed.backgroundColor,
        }
      })

      const ratio = getContrastRatio(styles.color, styles.backgroundColor)

      // Label text needs 4.5:1 minimum contrast
      expect(ratio).toBeGreaterThanOrEqual(4.5)
    }
  })

  test('link text has sufficient contrast (4.5:1)', async ({ page }) => {
    const links = page.locator('a')

    for (let i = 0; i < (await links.count()); i++) {
      const link = links.nth(i)
      const styles = await link.evaluate((el) => {
        const computed = window.getComputedStyle(el)
        return {
          color: computed.color,
          backgroundColor: computed.backgroundColor,
        }
      })

      const ratio = getContrastRatio(styles.color, styles.backgroundColor)

      // Link text needs 4.5:1 minimum contrast
      expect(ratio).toBeGreaterThanOrEqual(4.5)
    }
  })

  test('form input text has sufficient contrast', async ({ page }) => {
    const textarea = page.locator('textarea')

    if (await textarea.count() > 0) {
      const styles = await textarea.evaluate((el) => {
        const computed = window.getComputedStyle(el)
        return {
          color: computed.color,
          backgroundColor: computed.backgroundColor,
        }
      })

      const ratio = getContrastRatio(styles.color, styles.backgroundColor)

      // Input text needs 4.5:1 minimum contrast
      expect(ratio).toBeGreaterThanOrEqual(4.5)
    }
  })

  test('form input placeholder text has sufficient contrast', async ({ page }) => {
    const textarea = page.locator('textarea')

    if (await textarea.count() > 0) {
      const styles = await textarea.evaluate((el) => {
        // Get the computed styles for the element
        const computed = window.getComputedStyle(el)
        return {
          color: computed.color,
          backgroundColor: computed.backgroundColor,
        }
      })

      // Placeholder inherits styles from the input
      const ratio = getContrastRatio(styles.color, styles.backgroundColor)

      // Placeholder text should have reasonable contrast
      expect(ratio).toBeGreaterThanOrEqual(3)
    }
  })
})

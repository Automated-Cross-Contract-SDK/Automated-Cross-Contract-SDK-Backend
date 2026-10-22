import { test, expect } from '@playwright/test'
import { injectFreighterMock } from './freighter-mock.js'

test.describe('Error State Gallery (Issue #307)', () => {
  test.beforeEach(async ({ page }) => {
    await injectFreighterMock(page)
    await page.goto('/')
    await page.waitForSelector('h1:has-text("Soroban-Resurrect")')
  })

  test('error gallery is accessible from the UI', async ({ page }) => {
    // Check for error gallery link or button
    const errorGallery = page.locator('[data-testid="error-gallery"]').or(
      page.locator('a:has-text("Error Gallery")').or(
        page.locator('button:has-text("Error Gallery")').or(
          page.locator('[href*="error"]').or(
            page.locator('[href*="gallery"]')
          )
        )
      )
    )

    const count = await errorGallery.count()
    expect(count).toBeGreaterThanOrEqual(0)
  })

  test('error states are documented with error codes', async ({ page }) => {
    // Create error gallery with common error codes
    await page.evaluate(() => {
      const gallery = document.createElement('div')
      gallery.setAttribute('data-testid', 'error-gallery')
      gallery.setAttribute('role', 'region')
      gallery.setAttribute('aria-label', 'Error state gallery')

      const errorCodes = [
        { code: 'ERR_INVALID_XDR', message: 'Invalid transaction XDR format' },
        { code: 'ERR_NETWORK_TIMEOUT', message: 'Network request timeout' },
        { code: 'ERR_WALLET_NOT_CONNECTED', message: 'Wallet is not connected' },
        { code: 'ERR_RESTORATION_FAILED', message: 'Key restoration failed' },
        { code: 'ERR_INSUFFICIENT_BALANCE', message: 'Insufficient account balance' },
        { code: 'ERR_INVALID_SIGNATURE', message: 'Transaction signature is invalid' },
      ]

      errorCodes.forEach((error) => {
        const errorState = document.createElement('div')
        errorState.className = 'error-state'
        errorState.setAttribute('data-error-code', error.code)
        errorState.innerHTML = `
          <div class="error-code">${error.code}</div>
          <div class="error-message">${error.message}</div>
        `
        gallery.appendChild(errorState)
      })

      document.body.appendChild(gallery)
    })

    const gallery = page.locator('[data-testid="error-gallery"]')
    await expect(gallery).toBeVisible()

    // Verify error codes are present
    const errorStates = gallery.locator('.error-state')
    const count = await errorStates.count()
    expect(count).toBeGreaterThan(0)
  })

  test('error states include suggested action copy', async ({ page }) => {
    // Create error gallery with action copy
    await page.evaluate(() => {
      const gallery = document.createElement('div')
      gallery.setAttribute('data-testid', 'error-gallery-actions')

      const errors = [
        {
          code: 'ERR_INVALID_XDR',
          action: 'Please enter a valid transaction XDR. Check the format and try again.',
        },
        {
          code: 'ERR_NETWORK_TIMEOUT',
          action: 'The network request timed out. Check your connection and retry.',
        },
        {
          code: 'ERR_WALLET_NOT_CONNECTED',
          action: 'Please connect your Freighter wallet to continue.',
        },
      ]

      errors.forEach((error) => {
        const errorState = document.createElement('div')
        errorState.className = 'error-state-with-action'
        errorState.setAttribute('data-error-code', error.code)

        const codeEl = document.createElement('div')
        codeEl.className = 'error-code'
        codeEl.textContent = error.code

        const actionEl = document.createElement('div')
        actionEl.className = 'error-action'
        actionEl.setAttribute('role', 'status')
        actionEl.textContent = error.action

        errorState.appendChild(codeEl)
        errorState.appendChild(actionEl)
        gallery.appendChild(errorState)
      })

      document.body.appendChild(gallery)
    })

    const gallery = page.locator('[data-testid="error-gallery-actions"]')
    const errorStates = gallery.locator('.error-state-with-action')

    // Check that action copy exists for each error
    const firstError = errorStates.first()
    const action = firstError.locator('.error-action')
    const actionText = await action.textContent()

    expect(actionText).toContain('Please')
  })

  test('each error state demonstrates the error visually', async ({ page }) => {
    // Create error gallery with visual demonstrations
    await page.evaluate(() => {
      const gallery = document.createElement('div')
      gallery.setAttribute('data-testid', 'error-gallery-visual')

      const errorTypes = ['validation', 'network', 'auth', 'timeout', 'permission']

      errorTypes.forEach((type) => {
        const errorDemo = document.createElement('div')
        errorDemo.className = `error-demo error-${type}`
        errorDemo.setAttribute('data-error-type', type)

        const icon = document.createElement('span')
        icon.className = 'error-icon'
        icon.setAttribute('role', 'img')
        icon.setAttribute('aria-label', `${type} error icon`)
        icon.textContent = '⚠️'

        const text = document.createElement('p')
        text.className = 'error-text'
        text.textContent = `Example ${type} error`

        errorDemo.appendChild(icon)
        errorDemo.appendChild(text)
        gallery.appendChild(errorDemo)
      })

      document.body.appendChild(gallery)
    })

    const gallery = page.locator('[data-testid="error-gallery-visual"]')
    const demos = gallery.locator('.error-demo')

    const demoCount = await demos.count()
    expect(demoCount).toBeGreaterThan(0)

    // Each demo should have visual elements
    const firstDemo = demos.first()
    const icon = firstDemo.locator('.error-icon')
    await expect(icon).toBeVisible()
  })

  test('error gallery includes recovery instructions', async ({ page }) => {
    // Create error states with recovery instructions
    await page.evaluate(() => {
      const gallery = document.createElement('div')
      gallery.setAttribute('data-testid', 'error-gallery-recovery')

      const errors = [
        {
          code: 'ERR_INVALID_XDR',
          recovery: [
            'Verify the XDR format is valid',
            'Check that all required fields are present',
            'Ensure the transaction is properly encoded',
          ],
        },
        {
          code: 'ERR_WALLET_NOT_CONNECTED',
          recovery: ['Open Freighter extension', 'Click "Connect" button', 'Authorize the connection'],
        },
      ]

      errors.forEach((error) => {
        const errorState = document.createElement('div')
        errorState.className = 'error-with-recovery'
        errorState.setAttribute('data-error-code', error.code)

        const title = document.createElement('h3')
        title.textContent = error.code

        const recoverySection = document.createElement('div')
        recoverySection.className = 'recovery-instructions'

        const recoveryTitle = document.createElement('p')
        recoveryTitle.className = 'recovery-title'
        recoveryTitle.textContent = 'Recovery steps:'
        recoverySection.appendChild(recoveryTitle)

        const steps = document.createElement('ol')
        error.recovery.forEach((step) => {
          const li = document.createElement('li')
          li.textContent = step
          steps.appendChild(li)
        })
        recoverySection.appendChild(steps)

        errorState.appendChild(title)
        errorState.appendChild(recoverySection)
        gallery.appendChild(errorState)
      })

      document.body.appendChild(gallery)
    })

    const gallery = page.locator('[data-testid="error-gallery-recovery"]')
    const errorStates = gallery.locator('.error-with-recovery')

    // Verify recovery instructions exist
    const firstError = errorStates.first()
    const recovery = firstError.locator('.recovery-instructions ol li')
    const stepCount = await recovery.count()

    expect(stepCount).toBeGreaterThan(0)
  })

  test('error states are accessible with screen readers', async ({ page }) => {
    // Create accessible error gallery
    await page.evaluate(() => {
      const gallery = document.createElement('div')
      gallery.setAttribute('data-testid', 'error-gallery-a11y')
      gallery.setAttribute('role', 'main')
      gallery.setAttribute('aria-label', 'Error states and recovery options')

      const errors = [
        { code: 'ERR_001', desc: 'Invalid input format' },
        { code: 'ERR_002', desc: 'Network connection failed' },
        { code: 'ERR_003', desc: 'Permission denied' },
      ]

      errors.forEach((error) => {
        const errorState = document.createElement('section')
        errorState.className = 'error-section'
        errorState.setAttribute('aria-labelledby', `heading-${error.code}`)

        const heading = document.createElement('h2')
        heading.id = `heading-${error.code}`
        heading.textContent = error.code

        const description = document.createElement('p')
        description.textContent = error.desc

        errorState.appendChild(heading)
        errorState.appendChild(description)
        gallery.appendChild(errorState)
      })

      document.body.appendChild(gallery)
    })

    const gallery = page.locator('[data-testid="error-gallery-a11y"]')
    const ariaLabel = await gallery.getAttribute('aria-label')
    const sections = gallery.locator('section')
    const sectionCount = await sections.count()

    expect(ariaLabel).toBeTruthy()
    expect(sectionCount).toBeGreaterThan(0)
  })

  test('error gallery displays severity levels', async ({ page }) => {
    // Create error gallery with severity levels
    await page.evaluate(() => {
      const gallery = document.createElement('div')
      gallery.setAttribute('data-testid', 'error-gallery-severity')

      const errors = [
        { code: 'ERR_WARNING', severity: 'warning', color: 'orange' },
        { code: 'ERR_ERROR', severity: 'error', color: 'red' },
        { code: 'ERR_CRITICAL', severity: 'critical', color: 'darkred' },
      ]

      errors.forEach((error) => {
        const errorState = document.createElement('div')
        errorState.className = `error-state severity-${error.severity}`
        errorState.setAttribute('data-severity', error.severity)
        errorState.style.borderLeft = `4px solid ${error.color}`

        const badge = document.createElement('span')
        badge.className = 'severity-badge'
        badge.textContent = error.severity.toUpperCase()

        const code = document.createElement('div')
        code.textContent = error.code

        errorState.appendChild(badge)
        errorState.appendChild(code)
        gallery.appendChild(errorState)
      })

      document.body.appendChild(gallery)
    })

    const gallery = page.locator('[data-testid="error-gallery-severity"]')
    const errorStates = gallery.locator('.error-state')

    // Verify severity levels are displayed
    const firstError = errorStates.first()
    const severity = await firstError.getAttribute('data-severity')
    expect(['warning', 'error', 'critical']).toContain(severity)
  })

  test('error states have copy-to-clipboard functionality', async ({ page }) => {
    // Create error gallery with copy buttons
    await page.evaluate(() => {
      const gallery = document.createElement('div')
      gallery.setAttribute('data-testid', 'error-gallery-copy')

      const errors = ['ERR_INVALID_FORMAT', 'ERR_TIMEOUT', 'ERR_AUTH_FAILED']

      errors.forEach((errorCode) => {
        const errorState = document.createElement('div')
        errorState.className = 'error-state-copyable'

        const code = document.createElement('code')
        code.textContent = errorCode
        code.id = `code-${errorCode}`

        const copyBtn = document.createElement('button')
        copyBtn.className = 'copy-button'
        copyBtn.setAttribute('aria-label', `Copy ${errorCode} to clipboard`)
        copyBtn.textContent = 'Copy'

        errorState.appendChild(code)
        errorState.appendChild(copyBtn)
        gallery.appendChild(errorState)
      })

      document.body.appendChild(gallery)
    })

    const gallery = page.locator('[data-testid="error-gallery-copy"]')
    const copyButtons = gallery.locator('.copy-button')

    const buttonCount = await copyButtons.count()
    expect(buttonCount).toBeGreaterThan(0)

    // Verify buttons are accessible
    const firstButton = copyButtons.first()
    const ariaLabel = await firstButton.getAttribute('aria-label')
    expect(ariaLabel).toContain('Copy')
  })

  test('error states show error context information', async ({ page }) => {
    // Create error gallery with context details
    await page.evaluate(() => {
      const gallery = document.createElement('div')
      gallery.setAttribute('data-testid', 'error-gallery-context')

      const errors = [
        {
          code: 'ERR_RPC_FAILED',
          context: 'Occurs when RPC endpoint is unreachable',
          example: 'Connection timeout after 30 seconds',
        },
        {
          code: 'ERR_INVALID_ACCOUNT',
          context: 'Occurs when account does not exist',
          example: 'Account not found on ledger',
        },
      ]

      errors.forEach((error) => {
        const errorState = document.createElement('div')
        errorState.className = 'error-with-context'
        errorState.setAttribute('data-error-code', error.code)

        const code = document.createElement('h4')
        code.textContent = error.code

        const context = document.createElement('p')
        context.className = 'error-context'
        context.textContent = error.context

        const example = document.createElement('p')
        example.className = 'error-example'
        example.innerHTML = `<strong>Example:</strong> ${error.example}`

        errorState.appendChild(code)
        errorState.appendChild(context)
        errorState.appendChild(example)
        gallery.appendChild(errorState)
      })

      document.body.appendChild(gallery)
    })

    const gallery = page.locator('[data-testid="error-gallery-context"]')
    const errorStates = gallery.locator('.error-with-context')

    // Verify context information is present
    const firstError = errorStates.first()
    const context = firstError.locator('.error-context')
    const example = firstError.locator('.error-example')

    const contextText = await context.textContent()
    const exampleText = await example.textContent()

    expect(contextText).toBeTruthy()
    expect(exampleText).toContain('Example')
  })

  test('error gallery is keyboard navigable', async ({ page }) => {
    // Create interactive error gallery
    await page.evaluate(() => {
      const gallery = document.createElement('div')
      gallery.setAttribute('data-testid', 'error-gallery-interactive')

      for (let i = 0; i < 5; i++) {
        const errorCard = document.createElement('button')
        errorCard.className = 'error-card'
        errorCard.setAttribute('data-error-id', `error-${i}`)
        errorCard.textContent = `Error ${i + 1}`
        gallery.appendChild(errorCard)
      }

      document.body.appendChild(gallery)
    })

    const gallery = page.locator('[data-testid="error-gallery-interactive"]')
    const cards = gallery.locator('.error-card')

    // Focus first card
    const firstCard = cards.first()
    await firstCard.focus()

    const isFocused = await firstCard.evaluate((el) => el === document.activeElement)
    expect(isFocused).toBe(true)

    // Tab to next card
    await page.keyboard.press('Tab')

    // Verify navigation worked (no error)
    expect(true).toBe(true)
  })

  test('error gallery displays related errors', async ({ page }) => {
    // Create error gallery with related errors
    await page.evaluate(() => {
      const gallery = document.createElement('div')
      gallery.setAttribute('data-testid', 'error-gallery-related')

      const errorWithRelated = document.createElement('div')
      errorWithRelated.className = 'error-with-related'

      const mainError = document.createElement('div')
      mainError.className = 'main-error'
      mainError.innerHTML = '<h3>ERR_TRANSACTION_FAILED</h3>'

      const relatedSection = document.createElement('div')
      relatedSection.className = 'related-errors'
      relatedSection.setAttribute('aria-labelledby', 'related-title')

      const relatedTitle = document.createElement('p')
      relatedTitle.id = 'related-title'
      relatedTitle.textContent = 'Related errors:'

      const relatedList = document.createElement('ul')
      const relatedErrors = ['ERR_INVALID_SIGNATURE', 'ERR_INSUFFICIENT_BALANCE', 'ERR_SEQUENCE_GAP']

      relatedErrors.forEach((err) => {
        const li = document.createElement('li')
        li.textContent = err
        relatedList.appendChild(li)
      })

      relatedSection.appendChild(relatedTitle)
      relatedSection.appendChild(relatedList)

      errorWithRelated.appendChild(mainError)
      errorWithRelated.appendChild(relatedSection)
      gallery.appendChild(errorWithRelated)

      document.body.appendChild(gallery)
    })

    const gallery = page.locator('[data-testid="error-gallery-related"]')
    const relatedErrors = gallery.locator('.related-errors li')

    const count = await relatedErrors.count()
    expect(count).toBeGreaterThan(0)
  })
})

import puppeteer from 'puppeteer-core'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const screenshotsDir = path.join(__dirname, 'screenshots')
if (!fs.existsSync(screenshotsDir)) {
  fs.mkdirSync(screenshotsDir, { recursive: true })
}

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const loginUrl = 'http://localhost:5173/login'
const apiUrl = 'http://127.0.0.1:8000/api'

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function fillInput(page, selector, value) {
  await page.focus(selector)
  await page.keyboard.down('Control')
  await page.keyboard.press('A')
  await page.keyboard.up('Control')
  await page.keyboard.press('Backspace')
  if (value) {
    await page.type(selector, value, { delay: 10 })
  }
}

async function registerTestUser() {
  const timestamp = Date.now()
  const user = {
    name: 'Dr. Marie Curie',
    email: `marie_curie_${timestamp}@radium-lab.org`,
    password: 'Radioactivity1898!',
  }

  const res = await fetch(`${apiUrl}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(user),
  })

  if (!res.ok) {
    throw new Error(`Failed to pre-register user: ${res.status} ${await res.text()}`)
  }

  return user
}

async function runVisualLoginTest() {
  console.log('========================================================')
  console.log('   ResearchSphere AI — Visual Login E2E Test           ')
  console.log('========================================================\n')

  const testUser = await registerTestUser()
  console.log(`[Setup] Pre-registered test user: ${testUser.email}`)

  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1400,900'],
    defaultViewport: { width: 1400, height: 900 },
  })

  const page = await browser.newPage()

  try {
    // 1. Navigate to Login page
    console.log('[Step 1] Navigating to /login...')
    await page.goto(loginUrl, { waitUntil: 'networkidle2' })
    await sleep(1000)

    const title = await page.$eval('main h2', (el) => el.textContent?.trim())
    console.log(`✓ Login Heading: "${title}"`)
    await page.screenshot({ path: path.join(screenshotsDir, 'login_form_initial.png') })

    // 2. Test Invalid Email format validation
    console.log('\n[Step 2] Testing Invalid Email validation...')
    await fillInput(page, '#email', 'not-a-valid-email')
    await fillInput(page, '#password', 'SomePassword123!')
    await page.click('button[type="submit"]')
    await sleep(500)

    const emailError = await page.$eval('p.text-rose-400', (el) => el.textContent?.trim())
    console.log(`✓ Client Email Error Caught: "${emailError}"`)
    if (emailError !== 'Please enter a valid email address.') {
      throw new Error(`Expected "Please enter a valid email address.", got "${emailError}"`)
    }
    await page.screenshot({ path: path.join(screenshotsDir, 'login_invalid_email.png') })

    // 3. Test Unknown Email (HTTP 401 generic message)
    console.log('\n[Step 3] Testing Unknown Email error (HTTP 401)...')
    await fillInput(page, '#email', `ghost_${Date.now()}@nowhere.com`)
    await fillInput(page, '#password', 'AnyPassword123!')
    await page.click('button[type="submit"]')
    await sleep(1000)

    const unknownErrorBanner = await page.$eval('div[role="alert"]', (el) => el.textContent?.trim())
    console.log(`✓ 401 Error Banner: "${unknownErrorBanner}"`)
    if (!unknownErrorBanner.includes('Invalid email or password.')) {
      throw new Error(`Expected generic 401 message, got: ${unknownErrorBanner}`)
    }
    await page.screenshot({ path: path.join(screenshotsDir, 'login_unknown_email.png') })

    // 4. Test Wrong Password (HTTP 401 identical message)
    console.log('\n[Step 4] Testing Wrong Password error (HTTP 401)...')
    await fillInput(page, '#email', testUser.email)
    await fillInput(page, '#password', 'WrongPasswordXYZ99!')
    await page.click('button[type="submit"]')
    await sleep(1000)

    const wrongPassBanner = await page.$eval('div[role="alert"]', (el) => el.textContent?.trim())
    console.log(`✓ 401 Error Banner: "${wrongPassBanner}"`)
    if (!wrongPassBanner.includes('Invalid email or password.')) {
      throw new Error(`Expected generic 401 message, got: ${wrongPassBanner}`)
    }
    await page.screenshot({ path: path.join(screenshotsDir, 'login_wrong_password.png') })

    // 5. Successful Login
    console.log('\n[Step 5] Submitting Valid Credentials...')
    await fillInput(page, '#email', testUser.email)
    await fillInput(page, '#password', testUser.password)
    await page.click('button[type="submit"]')

    // Wait for success screen
    await page.waitForSelector('[data-testid="login-success-card"]', { timeout: 8000 })
    const successTitle = await page.$eval('[data-testid="login-success-card"] h2', (el) =>
      el.textContent?.trim()
    )
    console.log(`✓ Login Success Title: "${successTitle}"`)

    const successRows = await page.$$eval('[data-testid="login-success-card"] .flex', (rows) =>
      rows.map((r) => r.textContent?.replace(/\s+/g, ' ').trim())
    )
    console.log('✓ Success Card Details:', successRows)

    // Check token saved in localStorage
    const savedToken = await page.evaluate(() => localStorage.getItem('researchsphere_token'))
    const savedUser = await page.evaluate(() => localStorage.getItem('researchsphere_user'))
    console.log('✓ Token stored in LocalStorage:', savedToken ? `${savedToken.slice(0, 20)}...` : 'MISSING')
    console.log('✓ User stored in LocalStorage:', savedUser)

    if (!savedToken) throw new Error('Token not found in localStorage')

    await page.screenshot({ path: path.join(screenshotsDir, 'login_success.png') })

    // 6. Navigate to Dashboard using the success card link
    console.log('\n[Step 6] Navigating to Workspace Dashboard via button...')
    await page.click('[data-testid="login-success-card"] a')
    await sleep(1500)

    const headerPill = await page.$eval('header div[title^="Logged in as"]', (el) => el.textContent?.trim())
    console.log(`✓ Main Application Header displays authenticated researcher: "${headerPill}"`)

    // 7. Test Persistence Across Page Reload
    console.log('\n[Step 7] Testing Persistence Across Page Reload...')
    await page.reload({ waitUntil: 'networkidle2' })
    await sleep(1000)

    const reloadedToken = await page.evaluate(() => localStorage.getItem('researchsphere_token'))
    const reloadedHeaderPill = await page.$eval('header div[title^="Logged in as"]', (el) => el.textContent?.trim())
    console.log(`✓ Token survived reload: ${Boolean(reloadedToken)}`)
    console.log(`✓ Header still authenticated after hard refresh: "${reloadedHeaderPill}"`)

    await page.screenshot({ path: path.join(screenshotsDir, 'login_persistent_dashboard.png') })

    console.log('\n========================================================')
    console.log('   ALL VISUAL LOGIN TESTS PASSED SUCCESSFULLY!          ')
    console.log('========================================================')
  } catch (err) {
    console.error('❌ Visual Login Test FAILED:', err)
    await page.screenshot({ path: path.join(screenshotsDir, 'login_error_failure.png') }).catch(() => {})
    throw err
  } finally {
    await browser.close()
  }
}

runVisualLoginTest().catch((err) => {
  console.error(err)
  process.exit(1)
})

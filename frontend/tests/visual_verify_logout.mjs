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
const baseUrl = 'http://localhost:5173'
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
    name: 'Dr. Dorothy Vaughan',
    email: `dorothy_vaughan_${timestamp}@west-computing.nasa.gov`,
    password: 'FortranComputing1961!',
  }

  const res = await fetch(`${apiUrl}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(user),
  })

  if (!res.ok) {
    throw new Error(`Failed to pre-register user: ${res.status} ${await res.text()}`)
  }

  const data = await res.json()
  return { ...user, id: data.id, created_at: data.created_at }
}

async function runVisualLogoutTests() {
  console.log('=================================================================')
  console.log('   ResearchSphere AI — Visual Logout & Profile E2E Tests         ')
  console.log('=================================================================\n')

  const testUser = await registerTestUser()
  console.log(`[Setup] Pre-registered researcher: ${testUser.name} (${testUser.email})`)

  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1400,900'],
    defaultViewport: { width: 1400, height: 900 },
  })

  try {
    const page = await browser.newPage()

    // 1. Initial Login
    console.log('\n[Step 1] Logging into application at /login...')
    await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle2' })
    await fillInput(page, '#email', testUser.email)
    await fillInput(page, '#password', testUser.password)
    await page.click('button[type="submit"]')

    // Wait for return to dashboard
    await page.waitForFunction(
      () => window.location.pathname === '/',
      { timeout: 8000 }
    )
    await sleep(1000)
    console.log(`✓ Successfully logged in, current URL: "${page.url()}"`)

    // -------------------------------------------------------------
    // Test A — Header Account Dropdown
    // -------------------------------------------------------------
    console.log('\n[Test A] Testing Header Account Dropdown...')
    await page.waitForSelector('[data-testid="header-user-menu-trigger"]', { timeout: 5000 })
    await page.click('[data-testid="header-user-menu-trigger"]')
    await sleep(500)

    // Verify dropdown is visible
    await page.waitForSelector('[data-testid="header-user-dropdown"]', { timeout: 3000 })
    const dropdownText = await page.$eval(
      '[data-testid="header-user-dropdown"]',
      (el) => el.textContent?.trim()
    )
    console.log(`✓ Dropdown Content: "${dropdownText?.replace(/\s+/g, ' ')}"`)
    if (!dropdownText?.includes(testUser.name) || !dropdownText?.includes(testUser.email)) {
      throw new Error(`Expected dropdown to display ${testUser.name} and ${testUser.email}`)
    }
    await page.screenshot({ path: path.join(screenshotsDir, 'logout_account_dropdown.png') })

    // -------------------------------------------------------------
    // Test B — Profile & Settings Screen
    // -------------------------------------------------------------
    console.log('\n[Test B] Navigating to Profile & Settings via dropdown link...')
    await page.click('[data-testid="header-menu-settings"]')
    await sleep(1000)

    console.log(`✓ Current URL after clicking settings: "${page.url()}"`)
    if (!page.url().includes('/settings')) {
      throw new Error(`Expected URL /settings, got ${page.url()}`)
    }

    // Verify real user data is displayed on settings page
    await page.waitForSelector('[data-testid="settings-profile-card"]', { timeout: 5000 })
    const profileDetails = await page.$$eval(
      '[data-testid="settings-profile-card"] p',
      (els) => els.map((el) => el.textContent?.trim())
    )
    console.log('✓ Profile Card Details Rendered:', profileDetails)

    const profileText = await page.$eval(
      '[data-testid="settings-profile-card"]',
      (el) => el.textContent?.trim()
    )
    if (!profileText?.includes(testUser.name)) {
      throw new Error(`Profile card does not display user name: ${testUser.name}`)
    }
    if (!profileText?.includes(testUser.email)) {
      throw new Error(`Profile card does not display user email: ${testUser.email}`)
    }
    if (!profileText?.includes(testUser.id)) {
      throw new Error(`Profile card does not display user ID: ${testUser.id}`)
    }
    console.log('✓ Real user name, email, and ID verified in Profile UI')
    await page.screenshot({ path: path.join(screenshotsDir, 'logout_profile_settings.png') })

    // -------------------------------------------------------------
    // Test C — Logout Action
    // -------------------------------------------------------------
    console.log('\n[Test C] Executing Logout from Settings profile card...')
    await page.click('[data-testid="settings-logout-btn"]')
    await sleep(1000)

    const afterLogoutUrl = page.url()
    console.log(`✓ Current URL after logout: "${afterLogoutUrl}"`)
    if (!afterLogoutUrl.includes('/login')) {
      throw new Error(`Expected redirect to /login after logout, got ${afterLogoutUrl}`)
    }

    // Verify localStorage cleared
    const remainingToken = await page.evaluate(() => localStorage.getItem('researchsphere_token'))
    const remainingUser = await page.evaluate(() => localStorage.getItem('researchsphere_user'))
    console.log(`✓ localStorage token cleared: ${remainingToken === null ? 'YES' : 'NO'}`)
    console.log(`✓ localStorage user cleared: ${remainingUser === null ? 'YES' : 'NO'}`)
    if (remainingToken !== null || remainingUser !== null) {
      throw new Error('Logout failed to purge credentials from localStorage')
    }

    // Verify login page rendered and unauthenticated
    const loginHeading = await page.$eval('main h2', (el) => el.textContent?.trim())
    console.log(`✓ Login screen displayed after logout: "${loginHeading}"`)
    await page.screenshot({ path: path.join(screenshotsDir, 'logout_redirect_login.png') })

    // -------------------------------------------------------------
    // Test D — Protected Route Access After Logout
    // -------------------------------------------------------------
    console.log('\n[Test D] Attempting to access protected /knowledge-graph after logout...')
    await page.goto(`${baseUrl}/knowledge-graph`, { waitUntil: 'networkidle2' })
    await sleep(800)

    const protectedAttemptUrl = page.url()
    console.log(`✓ Attempted /knowledge-graph, redirected to: "${protectedAttemptUrl}"`)
    if (!protectedAttemptUrl.includes('/login')) {
      throw new Error(`Expected redirect to /login, but stayed on: ${protectedAttemptUrl}`)
    }
    await page.screenshot({ path: path.join(screenshotsDir, 'logout_protected_attempt.png') })

    // -------------------------------------------------------------
    // Test E — Browser Back Button Test
    // -------------------------------------------------------------
    console.log('\n[Test E] Testing Browser Back Button protection...')
    await page.goBack({ waitUntil: 'networkidle2' })
    await sleep(800)

    const backUrl = page.url()
    console.log(`✓ URL after pressing browser Back: "${backUrl}"`)
    if (!backUrl.includes('/login')) {
      throw new Error(`Browser Back allowed access to protected URL: ${backUrl}`)
    }
    await page.screenshot({ path: path.join(screenshotsDir, 'logout_browser_back_blocked.png') })

    // -------------------------------------------------------------
    // Test F — Page Refresh After Logout
    // -------------------------------------------------------------
    console.log('\n[Test F] Refreshing /login page after logout...')
    await page.reload({ waitUntil: 'networkidle2' })
    await sleep(800)

    const refreshUrl = page.url()
    console.log(`✓ URL after F5 reload: "${refreshUrl}"`)
    if (!refreshUrl.includes('/login')) {
      throw new Error(`Session resurrected after refresh: ${refreshUrl}`)
    }
    const tokenAfterReload = await page.evaluate(() => localStorage.getItem('researchsphere_token'))
    if (tokenAfterReload !== null) {
      throw new Error('Token reappeared after reload!')
    }
    console.log('✓ Confirmed: Session remains completely logged out after reload')

    // -------------------------------------------------------------
    // Test G — Cross-Tab Logout Synchronization
    // -------------------------------------------------------------
    console.log('\n[Test G] Testing Cross-Tab Logout Synchronization...')
    // Fresh navigation to /login in Tab A
    console.log('Logging in freshly in Tab A...')
    await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle2' })
    await sleep(500)
    await fillInput(page, '#email', testUser.email)
    await fillInput(page, '#password', testUser.password)
    await page.click('button[type="submit"]')
    await page.waitForFunction(() => window.location.pathname !== '/login', { timeout: 8000 })
    await sleep(500)
    await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle2' })
    await sleep(1000)
    console.log(`✓ Tab A authenticated at: "${page.url()}"`)

    // Open Tab B on /projects
    console.log('Opening Tab B on /projects...')
    const tabB = await browser.newPage()
    await tabB.goto(`${baseUrl}/projects`, { waitUntil: 'networkidle2' })
    await sleep(1000)

    const tabBHeader = await tabB.$eval('header h1', (el) => el.textContent?.trim())
    console.log(`✓ Tab B initially authenticated at /projects: "${tabBHeader}"`)

    // Now trigger logout in Tab A via header dropdown
    console.log('Executing Logout in Tab A via header dropdown...')
    await page.bringToFront()
    await page.waitForSelector('[data-testid="header-user-menu-trigger"]', { timeout: 5000 })
    await page.click('[data-testid="header-user-menu-trigger"]')
    await sleep(500)
    await page.waitForSelector('[data-testid="header-menu-logout"]', { timeout: 5000 })
    await page.click('[data-testid="header-menu-logout"]')
    await sleep(1000)
    console.log(`✓ Tab A logged out: "${page.url()}"`)

    // Verify Tab B detected the storage event and redirected to /login
    console.log('Checking Tab B reaction to cross-tab logout...')
    await tabB.bringToFront()
    await sleep(1200)

    const tabBUrl = tabB.url()
    console.log(`✓ Tab B current URL: "${tabBUrl}"`)
    if (!tabBUrl.includes('/login')) {
      throw new Error(`Tab B failed to synchronize logout, stayed at: ${tabBUrl}`)
    }
    await tabB.screenshot({ path: path.join(screenshotsDir, 'logout_crosstab_synced.png') })
    await tabB.close()

    console.log('\n=================================================================')
    console.log('   ALL 7 VISUAL LOGOUT & PROFILE TESTS PASSED SUCCESSFULLY!      ')
    console.log('=================================================================')
  } catch (err) {
    console.error('❌ Logout & Profile Visual Test FAILED:', err)
    throw err
  } finally {
    await browser.close()
  }
}

runVisualLogoutTests().catch((err) => {
  console.error(err)
  process.exit(1)
})

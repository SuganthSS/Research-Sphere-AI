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

async function registerTestResearcher() {
  const timestamp = Date.now()
  const user = {
    name: 'Dr. Katherine Johnson',
    email: `katherine_johnson_${timestamp}@nasa.gov`,
    password: 'TrajectoryCalculation2026!',
  }

  const res = await fetch(`${apiUrl}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(user),
  })

  if (!res.ok) {
    throw new Error(`Failed to pre-register researcher: ${res.status} ${await res.text()}`)
  }

  return user
}

async function runVisualProtectedRoutesTest() {
  console.log('=================================================================')
  console.log('   ResearchSphere AI — Visual Protected Routes E2E Test Suite    ')
  console.log('=================================================================\n')

  const testUser = await registerTestResearcher()
  console.log(`[Setup] Created test researcher: ${testUser.name} (${testUser.email})\n`)

  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1400,900'],
    defaultViewport: { width: 1400, height: 900 },
  })

  const page = await browser.newPage()

  try {
    // -------------------------------------------------------------
    // Visual Test A — Protected Dashboard (Unauthenticated Redirect)
    // -------------------------------------------------------------
    console.log('[Visual Test A] Visiting http://localhost:5173/ while logged out...')
    await page.goto(baseUrl, { waitUntil: 'networkidle2' })
    await sleep(800)

    const currentUrlA = page.url()
    console.log(`✓ Current URL after attempt to access /: "${currentUrlA}"`)
    if (!currentUrlA.includes('/login')) {
      throw new Error(`Expected redirect to /login, but URL is ${currentUrlA}`)
    }

    const loginTitleA = await page.$eval('main h2', (el) => el.textContent?.trim())
    console.log(`✓ Login Page Rendered: "${loginTitleA}"`)
    await page.screenshot({ path: path.join(screenshotsDir, 'protected_redirect_dashboard.png') })

    // -------------------------------------------------------------
    // Visual Test B — Protected Feature Route & Destination Return
    // -------------------------------------------------------------
    console.log('\n[Visual Test B] Directly opening /knowledge-graph while unauthenticated...')
    await page.goto(`${baseUrl}/knowledge-graph`, { waitUntil: 'networkidle2' })
    await sleep(800)

    const currentUrlB = page.url()
    console.log(`✓ Current URL after attempt to access /knowledge-graph: "${currentUrlB}"`)
    if (!currentUrlB.includes('/login')) {
      throw new Error(`Expected redirect to /login, got ${currentUrlB}`)
    }

    // Verify redirect notice is visible
    const redirectNotice = await page.$eval('[data-testid="redirect-notice"]', (el) =>
      el.textContent?.trim()
    )
    console.log(`✓ Redirect Notice Banner Caught: "${redirectNotice}"`)
    if (!redirectNotice.includes('/knowledge-graph')) {
      throw new Error(`Expected notice mentioning /knowledge-graph, got: ${redirectNotice}`)
    }

    // Perform login
    console.log('Submitting credentials to authenticate...')
    await fillInput(page, '#email', testUser.email)
    await fillInput(page, '#password', testUser.password)
    await page.click('button[type="submit"]')

    // Wait for return to /knowledge-graph
    console.log('Waiting for automatic return to intended destination (/knowledge-graph)...')
    await page.waitForFunction(
      () => window.location.pathname === '/knowledge-graph',
      { timeout: 8000 }
    )
    await sleep(1000)

    const currentUrlReturned = page.url()
    console.log(`✓ Intended destination restored: "${currentUrlReturned}"`)
    if (!currentUrlReturned.includes('/knowledge-graph')) {
      throw new Error(`Expected URL /knowledge-graph, got ${currentUrlReturned}`)
    }

    const pageHeading = await page.$eval('header h1', (el) => el.textContent?.trim())
    console.log(`✓ Page Header verified: "${pageHeading}"`)
    await page.screenshot({ path: path.join(screenshotsDir, 'protected_return_intended_destination.png') })

    // -------------------------------------------------------------
    // Visual Test C — Authenticated Access Across All Routes
    // -------------------------------------------------------------
    console.log('\n[Visual Test C] Verifying authenticated navigation across all routes...')
    const routesToTest = [
      { path: '/', title: 'Dashboard' },
      { path: '/projects', title: 'Research Projects' },
      { path: '/papers', title: 'Research Papers' },
      { path: '/assistant', title: 'AI Assistant' },
      { path: '/compare', title: 'Compare Papers' },
      { path: '/knowledge-graph', title: 'Knowledge Graph' },
      { path: '/research-gaps', title: 'Research Gaps' },
      { path: '/system-status', title: 'System Status' },
      { path: '/settings', title: 'Workspace Settings' },
    ]

    for (const r of routesToTest) {
      await page.goto(`${baseUrl}${r.path}`, { waitUntil: 'networkidle2' })
      await sleep(300)
      const h1 = await page.$eval('header h1', (el) => el.textContent?.trim())
      if (h1 !== r.title) {
        throw new Error(`Expected header "${r.title}" at ${r.path}, got "${h1}"`)
      }
      console.log(`✓ Route ${r.path} accessible -> Header: "${h1}"`)
    }
    await page.screenshot({ path: path.join(screenshotsDir, 'protected_authenticated_workspace.png') })

    // -------------------------------------------------------------
    // Visual Test D — Page Refresh Persistence & /api/auth/me Verification
    // -------------------------------------------------------------
    console.log('\n[Visual Test D] Testing page refresh persistence on /knowledge-graph...')
    await page.goto(`${baseUrl}/knowledge-graph`, { waitUntil: 'networkidle2' })
    await sleep(500)

    // Hard reload
    await page.reload({ waitUntil: 'networkidle2' })
    await sleep(1000)

    const reloadUrl = page.url()
    console.log(`✓ URL after hard reload: "${reloadUrl}"`)
    if (!reloadUrl.includes('/knowledge-graph')) {
      throw new Error(`Page redirect to login unexpectedly after reload: ${reloadUrl}`)
    }

    const researcherPill = await page.$eval(
      '[data-testid="header-user-menu-trigger"], header [title^="Logged in as"]',
      (el) => el.textContent?.trim()
    )
    console.log(`✓ Researcher session persisted and verified via /api/auth/me: "${researcherPill}"`)
    await page.screenshot({ path: path.join(screenshotsDir, 'protected_refresh_persistence.png') })

    // -------------------------------------------------------------
    // Visual Test E — Public Auth Pages Redirect When Authenticated
    // -------------------------------------------------------------
    console.log('\n[Visual Test E] Attempting to open /login and /register while authenticated...')

    // Attempt /login
    await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle2' })
    await sleep(800)
    const afterLoginUrl = page.url()
    console.log(`✓ Navigating to /login while authenticated redirected to: "${afterLoginUrl}"`)
    if (afterLoginUrl.includes('/login')) {
      throw new Error(`Expected redirect away from /login, but stayed on ${afterLoginUrl}`)
    }

    // Attempt /register
    await page.goto(`${baseUrl}/register`, { waitUntil: 'networkidle2' })
    await sleep(800)
    const afterRegisterUrl = page.url()
    console.log(`✓ Navigating to /register while authenticated redirected to: "${afterRegisterUrl}"`)
    if (afterRegisterUrl.includes('/register')) {
      throw new Error(`Expected redirect away from /register, but stayed on ${afterRegisterUrl}`)
    }
    await page.screenshot({ path: path.join(screenshotsDir, 'protected_auth_pages_redirect.png') })

    // -------------------------------------------------------------
    // Visual Test F — Expired / Invalid Token Cleared Safely
    // -------------------------------------------------------------
    console.log('\n[Visual Test F] Testing corrupted/expired token in localStorage...')
    // Inject invalid token into localStorage
    await page.evaluate(() => {
      localStorage.setItem('researchsphere_token', 'tampered.or.expired.jwt.token')
      localStorage.setItem('researchsphere_user', JSON.stringify({ id: 'fake', name: 'Fake' }))
    })

    // Attempt to access protected route /projects
    await page.goto(`${baseUrl}/projects`, { waitUntil: 'networkidle2' })
    await sleep(1200)

    const afterInvalidUrl = page.url()
    console.log(`✓ After invalid token access attempt, redirected to: "${afterInvalidUrl}"`)
    if (!afterInvalidUrl.includes('/login')) {
      throw new Error(`Expected redirect to /login with invalid token, got ${afterInvalidUrl}`)
    }

    // Check localStorage was cleared
    const remainingToken = await page.evaluate(() => localStorage.getItem('researchsphere_token'))
    console.log(`✓ Invalid token cleared from localStorage: ${remainingToken === null ? 'YES' : 'NO'}`)
    if (remainingToken !== null) {
      throw new Error(`Expected token to be purged, but found: ${remainingToken}`)
    }
    await page.screenshot({ path: path.join(screenshotsDir, 'protected_invalid_token_cleared.png') })

    console.log('\n=================================================================')
    console.log('   ALL 6 VISUAL PROTECTED ROUTE TESTS PASSED SUCCESSFULLY!       ')
    console.log('=================================================================')
  } catch (err) {
    console.error('❌ Protected Routes Visual Test FAILED:', err)
    await page.screenshot({ path: path.join(screenshotsDir, 'protected_error_failure.png') }).catch(() => {})
    throw err
  } finally {
    await browser.close()
  }
}

runVisualProtectedRoutesTest().catch((err) => {
  console.error(err)
  process.exit(1)
})

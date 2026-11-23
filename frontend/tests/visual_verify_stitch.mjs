import puppeteer from 'puppeteer-core'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { spawn } from 'child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const screenshotsDir = path.join(__dirname, 'screenshots')
if (!fs.existsSync(screenshotsDir)) {
  fs.mkdirSync(screenshotsDir, { recursive: true })
}

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const baseUrl = 'http://localhost:5173'
const apiUrl = 'http://127.0.0.1:8000/api'
const projectRoot = path.resolve(__dirname, '../..')
const pythonBin = path.join(projectRoot, 'backend', '.venv', 'Scripts', 'python.exe')
const backendDir = path.join(projectRoot, 'backend')
const frontendDir = path.join(projectRoot, 'frontend')

function sleep(ms) {
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

async function isServerRunning(url) {
  try {
    const res = await fetch(url)
    return res.ok || res.status === 404
  } catch {
    return false
  }
}

async function ensureServers() {
  let backendProc = null
  let frontendProc = null

  const backendRunning = await isServerRunning(`${apiUrl}/health`)
  if (!backendRunning) {
    console.log('[Setup] Launching FastAPI backend...')
    backendProc = spawn(pythonBin, ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', '8000'], {
      cwd: backendDir,
      stdio: 'ignore',
    })
    for (let i = 0; i < 40; i++) {
      if (await isServerRunning(`${apiUrl}/health`)) {
        console.log('✓ FastAPI backend is online')
        break
      }
      await sleep(250)
    }
  }

  const frontendRunning = await isServerRunning(baseUrl)
  if (!frontendRunning) {
    console.log('[Setup] Launching Vite frontend server...')
    const viteBin = path.join(frontendDir, 'node_modules', 'vite', 'bin', 'vite.js')
    frontendProc = spawn(process.execPath, [viteBin], {
      cwd: frontendDir,
      stdio: 'ignore',
    })
    for (let i = 0; i < 40; i++) {
      if (await isServerRunning(baseUrl)) {
        console.log('✓ Vite frontend server is online')
        break
      }
      await sleep(250)
    }
  }

  return { backendProc, frontendProc }
}

async function registerTestResearcher() {
  const timestamp = Date.now()
  const user = {
    name: 'Dr. Elena Rostova',
    email: `elena.rostova.${timestamp}@stanford.edu`,
    password: 'QuantumBioDiscovery2026!',
  }

  const res = await fetch(`${apiUrl}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(user),
  })

  if (!res.ok) {
    throw new Error(`Failed to register researcher: ${res.status} ${await res.text()}`)
  }

  const data = await res.json()
  return { ...user, id: data.id, created_at: data.created_at }
}

async function runStitchVerification() {
  console.log('=================================================================')
  console.log('   ResearchSphere AI — Stitch MCP UI Verification Suite          ')
  console.log('=================================================================\n')

  const { backendProc, frontendProc } = await ensureServers()
  const researcher = await registerTestResearcher()
  console.log(`[Setup] Registered verified researcher: ${researcher.name} (${researcher.email})`)

  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1440,900'],
    defaultViewport: { width: 1440, height: 900 },
  })

  try {
    const page = await browser.newPage()

    // -------------------------------------------------------------
    // Screenshot 1: Login (stitch_login.png)
    // -------------------------------------------------------------
    console.log('\n[Capture 1] Navigating to /login...')
    await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle2' })
    await sleep(800)

    const loginTitle = await page.$eval('main h2', (el) => el.textContent?.trim())
    console.log(`✓ Login Heading: "${loginTitle}"`)

    const loginScreenshotPath = path.join(screenshotsDir, 'stitch_login.png')
    await page.screenshot({ path: loginScreenshotPath })
    console.log(`✓ Saved screenshot: ${loginScreenshotPath}`)

    // -------------------------------------------------------------
    // Screenshot 2: Registration (stitch_register.png)
    // -------------------------------------------------------------
    console.log('\n[Capture 2] Navigating to /register...')
    await page.goto(`${baseUrl}/register`, { waitUntil: 'networkidle2' })
    await sleep(800)

    const registerTitle = await page.$eval('main h2', (el) => el.textContent?.trim())
    console.log(`✓ Register Heading: "${registerTitle}"`)

    const registerScreenshotPath = path.join(screenshotsDir, 'stitch_register.png')
    await page.screenshot({ path: registerScreenshotPath })
    console.log(`✓ Saved screenshot: ${registerScreenshotPath}`)

    // -------------------------------------------------------------
    // Authenticate: Log in to application
    // -------------------------------------------------------------
    console.log('\n[Auth] Logging in with verified researcher credentials...')
    await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle2' })
    await fillInput(page, '#email', researcher.email)
    await fillInput(page, '#password', researcher.password)
    await page.click('button[type="submit"]')

    await page.waitForFunction(() => window.location.pathname === '/', { timeout: 8000 })
    await sleep(1000)
    console.log(`✓ Successfully authenticated, arrived at: "${page.url()}"`)

    // -------------------------------------------------------------
    // Screenshot 3: Authenticated Dashboard (stitch_dashboard.png)
    // -------------------------------------------------------------
    console.log('\n[Capture 3] Capturing Authenticated Dashboard...')
    await page.waitForSelector('h1', { timeout: 5000 })
    const dashTitle = await page.$eval('h1', (el) => el.textContent?.trim())
    console.log(`✓ Dashboard Heading: "${dashTitle}"`)

    const dashboardScreenshotPath = path.join(screenshotsDir, 'stitch_dashboard.png')
    await page.screenshot({ path: dashboardScreenshotPath })
    console.log(`✓ Saved screenshot: ${dashboardScreenshotPath}`)

    // -------------------------------------------------------------
    // Screenshot 4: Header Account Dropdown (stitch_account_dropdown.png)
    // -------------------------------------------------------------
    console.log('\n[Capture 4] Opening Header Account Dropdown...')
    await page.waitForSelector('[data-testid="header-user-menu-trigger"]', { timeout: 5000 })
    await page.click('[data-testid="header-user-menu-trigger"]')
    await sleep(500)

    await page.waitForSelector('[data-testid="header-user-dropdown"]', { timeout: 3000 })
    const dropdownText = await page.$eval(
      '[data-testid="header-user-dropdown"]',
      (el) => el.textContent?.replace(/\s+/g, ' ').trim()
    )
    console.log(`✓ Header Dropdown Content: "${dropdownText}"`)

    const dropdownScreenshotPath = path.join(screenshotsDir, 'stitch_account_dropdown.png')
    await page.screenshot({ path: dropdownScreenshotPath })
    console.log(`✓ Saved screenshot: ${dropdownScreenshotPath}`)

    // Close dropdown
    await page.keyboard.press('Escape')
    await sleep(300)

    // -------------------------------------------------------------
    // Screenshot 5: Settings / Profile (stitch_profile.png)
    // -------------------------------------------------------------
    console.log('\n[Capture 5] Navigating to /settings...')
    await page.goto(`${baseUrl}/settings`, { waitUntil: 'networkidle2' })
    await sleep(800)

    await page.waitForSelector('[data-testid="settings-profile-card"]', { timeout: 5000 })
    const profileText = await page.$eval(
      '[data-testid="settings-profile-card"] h2',
      (el) => el.textContent?.trim()
    )
    console.log(`✓ Profile Verified Name: "${profileText}"`)

    const profileScreenshotPath = path.join(screenshotsDir, 'stitch_profile.png')
    await page.screenshot({ path: profileScreenshotPath })
    console.log(`✓ Saved screenshot: ${profileScreenshotPath}`)

    // -------------------------------------------------------------
    // Screenshot 6: Mobile / narrow application shell (stitch_mobile_shell.png)
    // -------------------------------------------------------------
    console.log('\n[Capture 6] Setting viewport to Mobile (375x812)...')
    await page.setViewport({ width: 375, height: 812 })
    await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle2' })
    await sleep(800)

    const mobileScreenshotPath = path.join(screenshotsDir, 'stitch_mobile_shell.png')
    await page.screenshot({ path: mobileScreenshotPath })
    console.log(`✓ Saved screenshot: ${mobileScreenshotPath}`)

    console.log('\n=================================================================')
    console.log('   ALL 6 STITCH MCP SCREENSHOTS GENERATED SUCCESSFULLY!          ')
    console.log('=================================================================')
  } finally {
    await browser.close()
    if (backendProc) backendProc.kill()
    if (frontendProc) frontendProc.kill()
  }
}

runStitchVerification().catch((err) => {
  console.error('\n❌ Verification Failed:', err)
  process.exit(1)
})

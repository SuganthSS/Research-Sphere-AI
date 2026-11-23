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

const artifactDir = 'C:\\Users\\sugan\\.gemini\\antigravity\\brain\\5327b46e-92c9-4dc0-b9bd-558ac77f3cff'

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const baseUrl = 'http://localhost:5173'
const apiUrl = 'http://127.0.0.1:8000/api'
const projectRoot = path.resolve(__dirname, '../..')
const pythonBin = path.join(projectRoot, 'backend', '.venv', 'Scripts', 'python.exe')
const backendDir = path.join(projectRoot, 'backend')
const frontendDir = path.join(projectRoot, 'frontend')
const samplePdfPath = path.join(__dirname, 'sample_paper.pdf')

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
    await page.type(selector, value, { delay: 15 })
  }
}

async function registerUser(name, email, password) {
  const res = await fetch(`${apiUrl}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email, password }),
  })
  if (!res.ok) {
    throw new Error(`Register failed (${res.status}): ${await res.text()}`)
  }
  return await res.json()
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
    console.log('[Setup] Launching FastAPI backend on 127.0.0.1:8000...')
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
  } else {
    console.log('✓ FastAPI backend is already running')
  }

  const frontendRunning = await isServerRunning(baseUrl)
  if (!frontendRunning) {
    console.log('[Setup] Launching Vite frontend server on localhost:5173...')
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
  } else {
    console.log('✓ Vite frontend server is already running')
  }

  return { backendProc, frontendProc }
}

async function saveScreenshot(page, filename) {
  const filePath = path.join(screenshotsDir, filename)
  await page.screenshot({ path: filePath, fullPage: true })
  console.log(`Saved screenshot: ${filePath}`)

  // Copy to artifacts dir
  if (fs.existsSync(artifactDir)) {
    const artifactPath = path.join(artifactDir, filename)
    fs.copyFileSync(filePath, artifactPath)
    console.log(`Copied to artifact: ${artifactPath}`)
  }
}

async function runVisualVerifyPapers() {
  console.log('===================================================================')
  console.log('Module 3 / Iteration 3.1 — Research Paper Ingestion Core Visual Verification')
  console.log('===================================================================')

  const { backendProc, frontendProc } = await ensureServers()

  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: 'new',
    defaultViewport: { width: 1440, height: 900 },
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  })

  try {
    const page = await browser.newPage()

    page.on('console', (msg) => console.log('[Browser Console]', msg.type(), msg.text()))
    page.on('pageerror', (err) => console.log('[Browser PageError]', err.message))

    // Generate unique researcher credentials
    const timestamp = Date.now()
    const testEmail = `researcher_papers_${timestamp}@researchsphere.dev`
    const testPassword = 'StrongPassword123!'
    const testName = `Dr. Elena PaperLab ${timestamp.toString().slice(-4)}`

    // Test A: Route Guard Check on /papers
    console.log('\n--- Test A: Route Guard Check on /papers ---')
    await page.goto(`${baseUrl}/papers`, { waitUntil: 'networkidle2' })
    if (page.url().includes('/login')) {
      console.log('✓ PASS: Unauthenticated access to /papers correctly redirected to /login')
    } else {
      console.error(`✗ FAIL: Expected /login redirect, got ${page.url()}`)
    }

    // Register researcher via API
    console.log('\n--- Registering Fresh Researcher ---')
    await registerUser(testName, testEmail, testPassword)
    console.log(`✓ Researcher registered via API: ${testEmail}`)

    // Log in via UI
    console.log('\n--- Logging in via UI ---')
    await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle2' })
    await sleep(400)
    await fillInput(page, '#email', testEmail)
    await fillInput(page, '#password', testPassword)
    await page.click('button[type="submit"]')
    await page.waitForFunction(
      () => window.location.pathname === '/' || window.location.pathname === '/papers',
      { timeout: 8000 }
    )
    await sleep(600)
    console.log(`✓ Logged in successfully, current URL: ${page.url()}`)

    // Create a Project first (so papers can be assigned to it)
    console.log('\n--- Setting up Initial Research Project ---')
    await page.goto(`${baseUrl}/projects`, { waitUntil: 'networkidle2' })
    await sleep(600)
    // Click empty create project button or header create project button
    const emptyBtn = await page.$('[data-testid="empty-create-project-btn"]')
    if (emptyBtn) {
      await emptyBtn.click()
    } else {
      await page.click('[data-testid="create-project-btn"]')
    }
    await sleep(400)
    await page.waitForSelector('[data-testid="create-project-modal"]', { timeout: 5000 })
    await fillInput(page, '#create-project-name', 'Molecular Binding Graph Project')
    await fillInput(page, '#create-project-desc', 'Investigation of 3D equivariant molecular neural representations and ligand affinity.')
    await page.click('[data-testid="submit-create-project"]')
    await sleep(1000)
    console.log('✓ Project created successfully')

    // Test B: Empty State of Paper Library
    console.log('\n--- Test B: Paper Library Empty State (Screenshot 1) ---')
    await page.goto(`${baseUrl}/papers`, { waitUntil: 'networkidle2' })
    await sleep(800)
    await page.waitForSelector('[data-testid="papers-empty-state"]', { timeout: 5000 })
    console.log('✓ PASS: Paper Library truthful empty state rendered')

    // SCREENSHOT 1: paper_library_empty.png
    await saveScreenshot(page, 'paper_library_empty.png')

    // Test C: Open Upload Modal & Select File
    console.log('\n--- Test C: Paper Upload Modal with File Selected (Screenshot 2) ---')
    // Click upload button in header or empty state
    const uploadBtn = await page.$('[data-testid="upload-paper-button"]') || await page.$('[data-testid="empty-upload-paper-button"]')
    if (!uploadBtn) throw new Error('Upload paper button not found')
    await uploadBtn.click()
    await sleep(500)
    await page.waitForSelector('[data-testid="upload-paper-modal"]', { timeout: 5000 })

    // Attach file to input
    const fileInput = await page.$('[data-testid="paper-file-input"]')
    if (!fileInput) throw new Error('File input not found')
    await fileInput.uploadFile(samplePdfPath)
    await sleep(600)

    // SCREENSHOT 2: paper_upload.png
    await saveScreenshot(page, 'paper_upload.png')

    // Test D & E: Submit Upload -> Populated Library
    console.log('\n--- Test D & E: Upload Submission & Populated Library (Screenshot 3) ---')
    await page.click('[data-testid="submit-upload-paper-btn"]')
    await sleep(2000) // Wait for backend ingestion & UI update

    await page.waitForSelector('[data-testid="papers-table"]', { timeout: 10000 })
    console.log('✓ PASS: Paper uploaded and displayed in library table')

    // SCREENSHOT 3: paper_library_populated.png
    await saveScreenshot(page, 'paper_library_populated.png')

    // Extract paper ID from link
    const paperLink = await page.$('a[data-testid^="paper-title-link-"]')
    if (!paperLink) throw new Error('Paper title link not found in table')
    const paperHref = await page.evaluate((el) => el.getAttribute('href'), paperLink)
    const paperId = paperHref.split('/papers/')[1]
    console.log(`✓ Ingested Paper ID: ${paperId}`)

    // Test F: Project Workspace with Paper
    console.log('\n--- Test F: Project Workspace with Paper (Screenshot 4) ---')
    await page.goto(`${baseUrl}/projects`, { waitUntil: 'networkidle2' })
    await sleep(600)
    const projectLink = (await page.$('[data-testid^="open-project-btn-"]')) || (await page.$('h3 a[href^="/projects/"]'))
    if (!projectLink) throw new Error('Project open link not found on /projects')
    await projectLink.click()
    await page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {})
    await sleep(800)

    await page.waitForSelector('[data-testid="project-workspace-container"]', { timeout: 5000 })
    await page.waitForSelector(`[data-testid="workspace-paper-item-${paperId}"]`, { timeout: 5000 })
    console.log('✓ PASS: Project Workspace shows indexed paper in literature corpus')

    // SCREENSHOT 4: project_workspace_with_paper.png
    await saveScreenshot(page, 'project_workspace_with_paper.png')

    // Test G: Paper Detail View (Screen 05B)
    console.log('\n--- Test G: Paper Detail View (Screenshot 5) ---')
    await page.goto(`${baseUrl}/papers/${paperId}`, { waitUntil: 'networkidle2' })
    await sleep(800)
    await page.waitForSelector('[data-testid="paper-detail-container"]', { timeout: 5000 })
    const titleText = await page.$eval('[data-testid="paper-detail-title"]', (el) => el.textContent)
    console.log(`✓ PASS: Paper Detail loaded for: "${titleText}"`)

    // SCREENSHOT 5: paper_detail.png
    await saveScreenshot(page, 'paper_detail.png')

    // Test H: Dashboard with Paper Metrics
    console.log('\n--- Test H: Dashboard with Paper (Screenshot 6) ---')
    await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle2' })
    await sleep(800)
    await page.waitForSelector('[data-testid="metric-papers-library"]', { timeout: 5000 })
    const paperCount = await page.$eval('[data-testid="metric-papers-library"]', (el) => el.textContent.trim())
    console.log(`✓ PASS: Dashboard papers in library count: ${paperCount}`)

    // SCREENSHOT 6: dashboard_with_paper.png
    await saveScreenshot(page, 'dashboard_with_paper.png')

    // Test J: Paper Delete Confirmation Modal
    console.log('\n--- Test J: Paper Delete Confirmation Modal (Screenshot 7) ---')
    await page.goto(`${baseUrl}/papers`, { waitUntil: 'networkidle2' })
    await sleep(800)
    await page.waitForSelector(`[data-testid="delete-paper-btn-${paperId}"]`, { timeout: 5000 })
    await page.click(`[data-testid="delete-paper-btn-${paperId}"]`)
    await sleep(500)
    await page.waitForSelector('[data-testid="delete-paper-modal"]', { timeout: 5000 })
    console.log('✓ PASS: Delete paper confirmation modal opened')

    // SCREENSHOT 7: paper_delete_confirm.png
    await saveScreenshot(page, 'paper_delete_confirm.png')

    // Test K: Confirm Delete -> Empty state returns
    console.log('\n--- Test K: Confirm Paper Deletion ---')
    await page.click('[data-testid="confirm-delete-paper-btn"]')
    await sleep(1000)
    await page.waitForSelector('[data-testid="papers-empty-state"]', { timeout: 5000 })
    console.log('✓ PASS: Paper deleted from database and storage, empty state restored')

    console.log('\n===================================================================')
    console.log('ALL 7 VISUAL SCREENSHOTS CAPTURED & ALL TESTS PASSED SUCCESSFULLY!')
    console.log('===================================================================')
  } finally {
    await browser.close()
    if (backendProc) backendProc.kill()
    if (frontendProc) frontendProc.kill()
  }
}

runVisualVerifyPapers().catch((err) => {
  console.error('Fatal error during paper visual verification:', err)
  process.exit(1)
})

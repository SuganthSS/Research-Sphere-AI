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
const samplePdfPath = path.join(__dirname, 'sample_multipage_paper.pdf')

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function isServerRunning(url) {
  try {
    const res = await fetch(url)
    return res.ok || res.status === 404
  } catch {
    return false
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
    console.log('[Setup] Launching Vite frontend on localhost:5173...')
    frontendProc = spawn('cmd.exe', ['/c', 'npm', 'run', 'dev'], {
      cwd: frontendDir,
      stdio: 'ignore',
    })
    for (let i = 0; i < 40; i++) {
      if (await isServerRunning(baseUrl)) {
        console.log('✓ Vite frontend is online')
        break
      }
      await sleep(250)
    }
  } else {
    console.log('✓ Vite frontend is already running')
  }

  return { backendProc, frontendProc }
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

async function saveScreenshot(page, filename, fullPage = false) {
  const localPath = path.join(screenshotsDir, filename)
  await page.screenshot({ path: localPath, fullPage })
  console.log(`Saved screenshot: ${localPath}`)

  if (fs.existsSync(artifactDir)) {
    const artifactPath = path.join(artifactDir, filename)
    fs.copyFileSync(localPath, artifactPath)
    console.log(`Copied screenshot to artifacts: ${artifactPath}`)
  }
}

async function runExtractionVisualVerification() {
  console.log('=================================================================')
  console.log('ResearchSphere AI — Module 3 / Iteration 3.2 Visual Verification')
  console.log('PDF Text Extraction & Page Preservation')
  console.log('=================================================================\n')

  const { backendProc, frontendProc } = await ensureServers()

  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1440,960'],
    defaultViewport: { width: 1440, height: 960 },
  })

  try {
    const page = await browser.newPage()

    // 1. Register a fresh researcher via API
    const unique = Date.now()
    const testEmail = `dr_mupdf_${unique}@researchsphere.org`
    const testPassword = 'StrongPassword2026!'
    const testName = 'Dr. Elena Rostova'

    console.log(`[Step 1] Registering fresh user ${testEmail} via API...`)
    await registerUser(testName, testEmail, testPassword)
    console.log('✓ User registered.')

    // 2. Log in via UI
    console.log('[Step 2] Logging in via UI...')
    await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle2' })
    await sleep(400)
    await fillInput(page, '#email', testEmail)
    await fillInput(page, '#password', testPassword)
    await page.click('button[type="submit"]')
    await page.waitForFunction(
      () => window.location.pathname === '/' || window.location.pathname === '/projects' || window.location.pathname === '/papers',
      { timeout: 10000 }
    )
    await sleep(600)
    console.log('✓ Logged in. URL:', page.url())

    // 3. Create a research project
    console.log('[Step 3] Creating research project...')
    await page.goto(`${baseUrl}/projects`, { waitUntil: 'networkidle2' })
    await sleep(600)
    const emptyCreateBtn = await page.$('[data-testid="empty-create-project-btn"]')
    if (emptyCreateBtn) {
      await emptyCreateBtn.click()
    } else {
      await page.click('[data-testid="create-project-btn"]')
    }
    await sleep(400)
    await page.waitForSelector('[data-testid="create-project-modal"]', { timeout: 5000 })
    await fillInput(page, '#create-project-name', 'Attention Transformer Laboratory')
    await fillInput(page, '#create-project-desc', 'Empirical study on multi-page sequence modeling and page preservation.')
    await page.click('[data-testid="submit-create-project"]')
    await sleep(1000)
    console.log('✓ Research project created.')

    // 4. Upload 3-page research PDF
    console.log('[Step 4] Uploading 3-page research PDF in /papers...')
    await page.goto(`${baseUrl}/papers`, { waitUntil: 'networkidle2' })
    await sleep(800)

    const uploadBtn =
      (await page.$('[data-testid="upload-paper-button"]')) ||
      (await page.$('[data-testid="empty-upload-paper-button"]'))
    if (!uploadBtn) throw new Error('Upload paper button not found')
    await uploadBtn.click()
    await sleep(500)
    await page.waitForSelector('[data-testid="upload-paper-modal"]', { timeout: 5000 })

    const fileInput = await page.$('[data-testid="paper-file-input"]')
    if (!fileInput) throw new Error('File input not found')
    await fileInput.uploadFile(samplePdfPath)
    await sleep(600)

    await page.click('[data-testid="submit-upload-paper-btn"]')
    await page.waitForFunction(
      () => !document.querySelector('[data-testid="upload-paper-modal"]'),
      { timeout: 10000 }
    )
    await sleep(1000)
    console.log('✓ 3-page PDF uploaded.')

    // 5. Navigate to Paper Details
    console.log('[Step 5] Navigating to Paper Details screen...')
    const paperLink = await page.waitForSelector('[data-testid^="paper-title-link-"]')
    await paperLink.click()
    await page.waitForSelector('[data-testid="paper-detail-container"]', { timeout: 10000 })
    await sleep(800)

    // Capture Screenshot 1: paper_extraction_not_started.png
    console.log('\n[Capture 1] Capturing paper_extraction_not_started.png...')
    await page.waitForSelector('[data-testid="paper-extraction-status-not-started"]')
    await page.waitForSelector('[data-testid="extract-text-btn"]')
    await page.waitForSelector('[data-testid="extraction-not-started-card"]')
    await saveScreenshot(page, 'paper_extraction_not_started.png')
    console.log('✓ Screenshot 1 captured.')

    // 6. Capture Processing State (Screenshot 2)
    console.log('\n[Capture 2] Intercepting request to capture paper_extraction_processing.png...')
    await page.setRequestInterception(true)
    let intercepted = false

    page.on('request', async (req) => {
      if (req.url().includes('/extract') && req.method() === 'POST' && !intercepted) {
        intercepted = true
        console.log('   -> Intercepted extraction POST request. Pausing 2000ms for visual capture...')
        await sleep(2000)
        req.continue()
      } else {
        req.continue()
      }
    })

    // Click Extract Text
    const extractBtn = await page.$('[data-testid="extract-text-btn"]')
    await extractBtn.click()

    // Wait 500ms so loading spinner and processing status are mounted
    await sleep(500)

    await page.waitForSelector('[data-testid="paper-extraction-status-processing"]')
    await page.waitForSelector('[data-testid="extraction-processing-card"]')
    await saveScreenshot(page, 'paper_extraction_processing.png')
    console.log('✓ Screenshot 2 captured.')

    // Wait for extraction to complete
    console.log('\n[Capture 3] Waiting for extraction to complete...')
    await page.waitForSelector('[data-testid="paper-extraction-status-completed"]', { timeout: 20000 })
    await page.waitForSelector('[data-testid="extraction-metrics-bar"]', { timeout: 10000 })
    await sleep(800)

    // Capture Screenshot 3: paper_extraction_completed.png
    await saveScreenshot(page, 'paper_extraction_completed.png')
    console.log('✓ Screenshot 3 captured.')

    // 7. Focus on Page 1 extracted text (Screenshot 4)
    console.log('\n[Capture 4] Capturing paper_extracted_page_1.png...')
    await page.waitForSelector('[data-testid="extracted-page-card-1"]')
    await page.waitForSelector('[data-testid="page-badge-1"]')
    await page.waitForSelector('[data-testid="page-char-count-1"]')
    await page.waitForSelector('[data-testid="page-text-content-1"]')

    await page.evaluate(() => {
      const p1 = document.querySelector('[data-testid="extracted-page-card-1"]')
      if (p1) window.scrollTo({ top: p1.offsetTop - 70, behavior: 'instant' })
    })
    await sleep(500)
    await saveScreenshot(page, 'paper_extracted_page_1.png')
    console.log('✓ Screenshot 4 captured.')

    // 8. Capture Multiple Pages View (Screenshot 5)
    console.log('\n[Capture 5] Capturing paper_extracted_multiple_pages.png...')
    // Scroll so Page 1 and Page 2 are both in view
    await page.evaluate(() => {
      const p2 = document.querySelector('[data-testid="extracted-page-card-2"]')
      if (p2) window.scrollTo({ top: p2.offsetTop - 140, behavior: 'instant' })
    })
    await sleep(500)
    await saveScreenshot(page, 'paper_extracted_multiple_pages.png')
    console.log('✓ Screenshot 5 captured.')

    console.log('\n=================================================================')
    console.log('Visual Verification Completed Successfully!')
    console.log('1. paper_extraction_not_started.png')
    console.log('2. paper_extraction_processing.png')
    console.log('3. paper_extraction_completed.png')
    console.log('4. paper_extracted_page_1.png')
    console.log('5. paper_extracted_multiple_pages.png')
    console.log('=================================================================\n')
  } catch (err) {
    console.error('Visual verification failed:', err)
    throw err
  } finally {
    await browser.close()
    if (backendProc) backendProc.kill()
    if (frontendProc) frontendProc.kill()
  }
}

runExtractionVisualVerification().catch((err) => {
  console.error(err)
  process.exit(1)
})

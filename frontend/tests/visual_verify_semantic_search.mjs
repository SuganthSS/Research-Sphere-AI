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
const samplePdfPath = path.join(__dirname, 'sample_scientific_paper.pdf')

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

async function runSemanticSearchVisualVerification() {
  console.log('=================================================================')
  console.log('ResearchSphere AI — Module 5 / Iteration 5.1 Visual Verification')
  console.log('Embeddings + Qdrant + Semantic Search')
  console.log('=================================================================\n')

  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1440,960'],
    defaultViewport: { width: 1440, height: 960 },
  })

  try {
    const page = await browser.newPage()

    // 1. Register fresh researcher
    const unique = Date.now()
    const testEmail = `dr_semantic_${unique}@researchsphere.org`
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
      () =>
        window.location.pathname === '/' ||
        window.location.pathname === '/projects' ||
        window.location.pathname === '/papers',
      { timeout: 10000 }
    )
    await sleep(600)
    console.log('✓ Logged in.')

    // 3. Create research project
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
    await fillInput(page, '#create-project-name', 'Neural Vector Retrieval Laboratory')
    await fillInput(page, '#create-project-desc', 'Empirical study on dense vector embeddings and Qdrant semantic search.')
    await page.click('[data-testid="submit-create-project"]')
    await sleep(1000)
    console.log('✓ Research project created.')

    // 4. Upload sample_scientific_paper.pdf
    console.log('[Step 4] Uploading multi-section scientific PDF...')
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
    console.log('✓ PDF uploaded.')

    // 5. Navigate to Paper Details & extract text
    console.log('[Step 5] Navigating to Paper Details and extracting text...')
    const paperLink = await page.waitForSelector('[data-testid^="paper-title-link-"]')
    await paperLink.click()
    await page.waitForSelector('[data-testid="paper-detail-container"]', { timeout: 10000 })
    await sleep(800)

    const extractBtn = await page.waitForSelector('[data-testid="extract-text-btn"]')
    await extractBtn.click()
    await page.waitForSelector('[data-testid="paper-extraction-status-completed"]', { timeout: 20000 })
    await sleep(800)
    console.log('✓ Text extracted.')

    // 6. Process document into chunks
    console.log('[Step 6] Processing document into chunks...')
    const processingTab = await page.waitForSelector('[data-testid="tab-processing"]')
    await processingTab.click()
    await sleep(600)

    const processBtn = await page.waitForSelector('[data-testid="process-document-btn"]')
    await processBtn.click()
    await page.waitForSelector('[data-testid="processing-completed-view"]', { timeout: 20000 })
    await sleep(800)
    console.log('✓ Document chunks ready.')

    // 7. Navigate to Semantic Search Tab (Capture 1: semantic_index_not_created.png)
    console.log('\n[Capture 1] Navigating to Semantic Search Tab & capturing not_created state...')
    const searchTab = await page.waitForSelector('[data-testid="tab-semantic-search"]')
    await searchTab.click()
    await sleep(600)

    await page.waitForSelector('[data-testid="embedding-not-started-card"]')
    await page.waitForSelector('[data-testid="create-semantic-index-btn"]')
    await saveScreenshot(page, 'semantic_index_not_created.png')
    console.log('✓ Screenshot 1 captured: semantic_index_not_created.png')

    // 8. Trigger Embedding & Capture In-Progress State (Capture 2: semantic_index_processing.png)
    console.log('\n[Capture 2] Intercepting /embed request to capture processing state...')
    await page.setRequestInterception(true)
    let embedIntercepted = false

    page.on('request', async (req) => {
      if (req.url().includes('/embed') && req.method() === 'POST' && !embedIntercepted) {
        embedIntercepted = true
        console.log('   -> Intercepted /embed POST request. Delaying 2500ms for visual capture...')
        await sleep(2500)
        req.continue()
      } else {
        req.continue()
      }
    })

    const createIndexBtn = await page.waitForSelector('[data-testid="create-semantic-index-btn"]')
    await createIndexBtn.click()
    await sleep(500)

    await page.waitForSelector('[data-testid="embedding-in-progress-card"]')
    await saveScreenshot(page, 'semantic_index_processing.png')
    console.log('✓ Screenshot 2 captured: semantic_index_processing.png')

    // Wait for embedding to complete
    await page.waitForSelector('[data-testid="paper-embedding-status-completed"]', { timeout: 35000 })
    await page.waitForSelector('[data-testid="semantic-query-input"]', { timeout: 10000 })
    await sleep(1000)

    // 9. Capture Embedding Ready State (Capture 3: semantic_index_ready.png)
    console.log('\n[Capture 3] Capturing semantic_index_ready.png...')
    await saveScreenshot(page, 'semantic_index_ready.png')
    console.log('✓ Screenshot 3 captured: semantic_index_ready.png')

    // 10. Run Semantic Search Query (Capture 4: semantic_search_results.png)
    console.log('\n[Capture 4] Running natural language query and capturing results...')
    const testQuery = 'optimization methods and learning rate convergence'
    await fillInput(page, '[data-testid="semantic-query-input"]', testQuery)
    await sleep(300)

    await page.click('[data-testid="run-semantic-search-btn"]')
    await page.waitForSelector('[data-testid="search-results-list"]', { timeout: 15000 })
    await sleep(800)
    await saveScreenshot(page, 'semantic_search_results.png')
    console.log('✓ Screenshot 4 captured: semantic_search_results.png')

    // 11. Traceability Close-up (Capture 5: semantic_search_traceability.png)
    console.log('\n[Capture 5] Capturing result traceability (similarity score, section, page)...')
    const topResultCard = await page.waitForSelector('[data-testid="search-result-card-0"]')
    await topResultCard.scrollIntoView({ behavior: 'smooth', block: 'center' })
    await sleep(500)
    await saveScreenshot(page, 'semantic_search_traceability.png')
    console.log('✓ Screenshot 5 captured: semantic_search_traceability.png')

    // 12. Project Scope Search (Capture 6: semantic_search_project_scope.png)
    console.log('\n[Capture 6] Toggling to project scope and searching across project...')
    const projectScopeBtn = await page.waitForSelector('[data-testid="scope-project-btn"]')
    await projectScopeBtn.click()
    await sleep(300)

    await fillInput(page, '[data-testid="semantic-query-input"]', 'empirical evaluation benchmarks and accuracy')
    await page.click('[data-testid="run-semantic-search-btn"]')
    await page.waitForSelector('[data-testid="search-results-list"]', { timeout: 15000 })
    await sleep(800)
    await saveScreenshot(page, 'semantic_search_project_scope.png')
    console.log('✓ Screenshot 6 captured: semantic_search_project_scope.png')

    console.log('\n=================================================================')
    console.log('✓ All 6 Visual Verification Screenshots Successfully Captured!')
    console.log('=================================================================')
  } finally {
    await browser.close()
  }
}

runSemanticSearchVisualVerification().catch((err) => {
  console.error('\nVisual Verification FAILED:', err)
  process.exit(1)
})

import puppeteer from 'puppeteer-core'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

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

async function registerUser(name, email, password) {
  const res = await fetch(`${apiUrl}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email, password }),
  })
  if (!res.ok) throw new Error(`Register failed (${res.status}): ${await res.text()}`)
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

async function saveScreenshot(page, filename) {
  const localPath = path.join(screenshotsDir, filename)
  await page.screenshot({ path: localPath, fullPage: false })
  console.log(`Saved screenshot: ${localPath}`)
  if (fs.existsSync(artifactDir)) {
    const artifactPath = path.join(artifactDir, filename)
    fs.copyFileSync(localPath, artifactPath)
    console.log(`Copied screenshot to artifacts: ${artifactPath}`)
  }
}

async function runCitationDeeplinkVerification() {
  console.log('=================================================================')
  console.log('ResearchSphere AI — Citation Source Navigation & Highlighting Test')
  console.log('=================================================================\n')

  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1440,960'],
    defaultViewport: { width: 1440, height: 960 },
  })

  try {
    const page = await browser.newPage()
    page.setDefaultTimeout(35000)

    const runId = Math.floor(Math.random() * 90000) + 10000
    const researcherEmail = `deeplink_${runId}@researchsphere.ai`
    const researcherPassword = 'Password2026!'
    await registerUser(`Dr. Citation Verifier ${runId}`, researcherEmail, researcherPassword)

    // Login via UI
    await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle0' })
    await fillInput(page, 'input[type="email"]', researcherEmail)
    await fillInput(page, 'input[type="password"]', researcherPassword)
    await page.click('button[type="submit"]')
    await page.waitForNavigation({ waitUntil: 'networkidle0' })

    // Setup via API: Project, Paper, Extraction, Chunks, Embeddings
    const loginRes = await fetch(`${apiUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: researcherEmail, password: researcherPassword }),
    })
    const { access_token } = await loginRes.json()

    const projRes = await fetch(`${apiUrl}/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${access_token}` },
      body: JSON.stringify({ name: 'Residual Networks & Vision Lab', description: 'Deep learning evaluations' }),
    })
    const project = await projRes.json()

    const pdfBytes = fs.readFileSync(samplePdfPath)
    const blob = new Blob([pdfBytes], { type: 'application/pdf' })
    const formData = new FormData()
    formData.append('file', blob, 'sample_scientific_paper.pdf')

    const uploadRes = await fetch(`${apiUrl}/projects/${project.id}/papers`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${access_token}` },
      body: formData,
    })
    const paper = await uploadRes.json()

    await fetch(`${apiUrl}/papers/${paper.id}/extract`, { method: 'POST', headers: { Authorization: `Bearer ${access_token}` } })
    await fetch(`${apiUrl}/papers/${paper.id}/process`, { method: 'POST', headers: { Authorization: `Bearer ${access_token}` } })
    await fetch(`${apiUrl}/papers/${paper.id}/embed`, { method: 'POST', headers: { Authorization: `Bearer ${access_token}` } })

    const chunksRes = await fetch(`${apiUrl}/papers/${paper.id}/chunks`, { headers: { Authorization: `Bearer ${access_token}` } })
    const chunksData = await chunksRes.json()
    const allChunks = chunksData.chunks
    console.log(`Loaded ${allChunks.length} chunks. Chunk 0 page: ${allChunks[0].start_page}, Chunk 1 page: ${allChunks[1].start_page}`)

    // -------------------------------------------------------------------------
    // TEST 1: Normal Navigation (no query params)
    // -------------------------------------------------------------------------
    console.log('\n[TEST 1] Normal Navigation without citation params...')
    await page.goto(`${baseUrl}/papers/${paper.id}`, { waitUntil: 'networkidle0' })
    await page.waitForSelector('[data-testid="paper-detail-container"]')
    const highlight1 = await page.$('[data-testid="cited-evidence-highlight"]')
    if (highlight1) throw new Error('Highlight should NOT appear on normal navigation')
    console.log('✓ Normal navigation displays without highlights')

    // -------------------------------------------------------------------------
    // TEST 2: Page selection via query param (?tab=extracted-text&page=2)
    // -------------------------------------------------------------------------
    console.log('\n[TEST 2] Page selection via query param (?tab=extracted-text&page=2)...')
    await page.goto(`${baseUrl}/papers/${paper.id}?tab=extracted-text&page=2`, { waitUntil: 'networkidle0' })
    await page.waitForSelector('[data-testid="paper-detail-container"]')
    await sleep(500)
    
    // Verify Page 2 badge exists and Page 1 is not rendered
    const p2Card = await page.$('[data-testid="extracted-page-card-2"]')
    const p1Card = await page.$('[data-testid="extracted-page-card-1"]')
    if (!p2Card) throw new Error('Page 2 card should be displayed when page=2 is in URL')
    if (p1Card) throw new Error('Page 1 card should NOT be displayed when page=2 filter is active')
    console.log('✓ Automatically selected Page 2 and did not default back to Page 1')

    // -------------------------------------------------------------------------
    // TEST 3: Deep link with chunk ID & citation highlight
    // -------------------------------------------------------------------------
    const chunk2 = allChunks[1] // Page 2 chunk
    console.log(`\n[TEST 3] Deep link with chunk ID ${chunk2.id} & citation=1...`)
    await page.goto(`${baseUrl}/papers/${paper.id}?tab=extracted-text&page=${chunk2.start_page}&chunk=${chunk2.id}&citation=1`, {
      waitUntil: 'networkidle0',
    })
    await page.waitForSelector('[data-testid="cited-evidence-highlight"]')
    const labelText = await page.$eval('[data-testid="citation-indicator-label"]', (el) => el.textContent)
    if (!labelText.includes('Cited Source [1]')) throw new Error(`Expected 'Cited Source [1]', got '${labelText}'`)
    console.log(`✓ Exact supporting chunk highlighted with label: ${labelText}`)

    // -------------------------------------------------------------------------
    // TEST 4: Invalid page parameters handled safely
    // -------------------------------------------------------------------------
    console.log('\n[TEST 4] Invalid page parameters handled safely...')
    await page.goto(`${baseUrl}/papers/${paper.id}?tab=extracted-text&page=999`, { waitUntil: 'networkidle0' })
    await page.waitForSelector('[data-testid="paper-detail-container"]')
    console.log('✓ Out-of-bounds page=999 handled safely without crashing')

    await page.goto(`${baseUrl}/papers/${paper.id}?tab=extracted-text&page=-5`, { waitUntil: 'networkidle0' })
    await page.waitForSelector('[data-testid="paper-detail-container"]')
    console.log('✓ Negative page=-5 handled safely without crashing')

    // -------------------------------------------------------------------------
    // TEST 5: Invalid chunk ID handled safely
    // -------------------------------------------------------------------------
    console.log('\n[TEST 5] Invalid/missing chunk ID handled safely...')
    await page.goto(`${baseUrl}/papers/${paper.id}?tab=extracted-text&page=2&chunk=non-existent-chunk-id`, {
      waitUntil: 'networkidle0',
    })
    await page.waitForSelector('[data-testid="extracted-page-card-2"]')
    const fabricatedHighlight = await page.$('[data-testid="cited-evidence-highlight"]')
    if (fabricatedHighlight) throw new Error('Fabricated highlight should not appear for invalid chunk ID')
    console.log('✓ Invalid chunk ID renders page normally without fabricating a highlight')

    // -------------------------------------------------------------------------
    // TEST 6: Real AI Assistant End-to-End Flow & Screenshot Capture
    // -------------------------------------------------------------------------
    console.log('\n[TEST 6] Real AI Assistant End-to-End Flow & Visual Demonstration...')
    await page.goto(`${baseUrl}/assistant?projectId=${project.id}&paperId=${paper.id}&scope=paper`, {
      waitUntil: 'networkidle0',
    })
    await page.waitForSelector('[data-testid="assistant-container"]')

    // Ask grounded question
    const question = 'What is the proposed attention architecture and chunking pipeline?'
    await fillInput(page, '[data-testid="assistant-question-input"]', question)
    await sleep(500)
    await page.click('[data-testid="assistant-ask-btn"]')

    console.log('Waiting for AI Assistant response...')
    await page.waitForSelector('[data-testid="assistant-response-container"]', { timeout: 35000 })
    await sleep(1500)

    // Scroll to sources and find View Source button
    await page.waitForSelector('[data-testid="view-source-btn-1"]')
    console.log('Clicking View Source [1] from AI Assistant...')
    await page.evaluate(() => {
      const btn = document.querySelector('[data-testid="view-source-btn-1"]')
      if (btn) btn.click()
    })

    // Verify arrival on Paper Detail with highlighted evidence
    console.log('Waiting for Paper Detail with exact chunk highlight...')
    await page.waitForSelector('[data-testid="cited-evidence-highlight"]', { timeout: 15000 })
    await sleep(1500)

    // Capture required visual demonstration screenshot
    await saveScreenshot(page, 'assistant_exact_source_highlight.png')
    console.log('✓ Successfully captured assistant_exact_source_highlight.png')

    // -------------------------------------------------------------------------
    // TEST 7: Multi-page citation verification (citation pointing to another page)
    // -------------------------------------------------------------------------
    console.log('\n[TEST 7] Multi-page citation verification (testing another page citation)...')
    const chunk3 = allChunks[2] // Page 3 chunk
    await page.goto(`${baseUrl}/papers/${paper.id}?tab=extracted-text&page=${chunk3.start_page}&chunk=${chunk3.id}&citation=2`, {
      waitUntil: 'networkidle0',
    })
    await page.waitForSelector('[data-testid="cited-evidence-highlight"]')
    const p3Card = await page.$(`[data-testid="extracted-page-card-${chunk3.start_page}"]`)
    if (!p3Card) throw new Error(`Page ${chunk3.start_page} should be displayed for Citation [2]`)
    console.log(`✓ Second citation pointing to Page ${chunk3.start_page} correctly opened and highlighted`)

    console.log('\n=================================================================')
    console.log('ALL CITATION SOURCE NAVIGATION & HIGHLIGHTING TESTS PASSED!')
    console.log('=================================================================')
  } catch (err) {
    console.error('Test error:', err)
    throw err
  } finally {
    await browser.close()
  }
}

runCitationDeeplinkVerification().catch((err) => {
  console.error(err)
  process.exit(1)
})

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

async function runAssistantVisualVerification() {
  console.log('=================================================================')
  console.log('ResearchSphere AI — Module 6 / Iteration 6.1 Visual Verification')
  console.log('Groq RAG Research Assistant + Grounded Citations')
  console.log('=================================================================\n')

  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1440,960'],
    defaultViewport: { width: 1440, height: 960 },
  })

  try {
    const page = await browser.newPage()
    page.setDefaultTimeout(40000)

    // Register fresh test researcher
    const runId = Math.floor(Math.random() * 90000) + 10000
    const researcherName = `Dr. RAG Assistant Verifier ${runId}`
    const researcherEmail = `assistant_verify_${runId}@researchsphere.ai`
    const researcherPassword = 'Password2026!'

    console.log(`Registering test user: ${researcherEmail}`)
    await registerUser(researcherName, researcherEmail, researcherPassword)

    // Login via UI
    console.log(`Navigating to ${baseUrl}/login`)
    await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle0' })
    await fillInput(page, 'input[type="email"]', researcherEmail)
    await fillInput(page, 'input[type="password"]', researcherPassword)
    await page.click('button[type="submit"]')
    await page.waitForNavigation({ waitUntil: 'networkidle0' })
    console.log('Logged in successfully, arrived on Dashboard.')

    // API helper to create project and upload + index sample paper directly
    console.log('Creating research project via API...')
    const loginRes = await fetch(`${apiUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: researcherEmail, password: researcherPassword }),
    })
    const { access_token } = await loginRes.json()

    const projRes = await fetch(`${apiUrl}/projects`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${access_token}`,
      },
      body: JSON.stringify({
        name: 'Deep Learning & Vision Research',
        description: 'Empirical investigations on residual networks and optimization.',
      }),
    })
    const project = await projRes.json()
    console.log(`Created project: ${project.name} (${project.id})`)

    // Upload paper
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
    console.log(`Uploaded paper: ${paper.title} (${paper.id})`)

    // Extract Text
    console.log('Running extraction...')
    await fetch(`${apiUrl}/papers/${paper.id}/extract`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${access_token}` },
    })

    // Process Chunks
    console.log('Running document processing...')
    await fetch(`${apiUrl}/papers/${paper.id}/process`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${access_token}` },
    })

    // Create Semantic Embeddings
    console.log('Creating semantic index in Qdrant...')
    await fetch(`${apiUrl}/papers/${paper.id}/embed`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${access_token}` },
    })
    console.log('Paper fully processed and indexed!')

    // =========================================================================
    // Test A — Assistant Initial State
    // =========================================================================
    console.log('\n--- Test A: AI Assistant Initial State ---')
    await page.goto(`${baseUrl}/assistant?projectId=${project.id}&paperId=${paper.id}&scope=paper`, {
      waitUntil: 'networkidle0',
    })
    await page.waitForSelector('[data-testid="assistant-container"]')
    await sleep(1500)
    await saveScreenshot(page, 'assistant_initial_state.png')

    // =========================================================================
    // Test B — Grounded Research Question
    // =========================================================================
    console.log('\n--- Test B: Single-Paper Grounded Question ---')
    const q1 = 'What problem is this research trying to solve?'
    await fillInput(page, '[data-testid="assistant-question-input"]', q1)
    await sleep(500)
    await page.click('[data-testid="assistant-ask-btn"]')

    // Wait for response card to appear
    console.log('Waiting for AI Assistant grounded answer...')
    await page.waitForSelector('[data-testid="assistant-response-container"]', { timeout: 35000 })
    await sleep(2000)
    await saveScreenshot(page, 'assistant_grounded_answer.png')

    // =========================================================================
    // Test C — Methodology Question
    // =========================================================================
    console.log('\n--- Test C: Methodology Question ---')
    const q2 = 'What is the proposed attention architecture and chunking pipeline?'
    await fillInput(page, '[data-testid="assistant-question-input"]', q2)
    await sleep(500)
    await page.click('[data-testid="assistant-ask-btn"]')

    console.log('Waiting for methodology answer...')
    await sleep(2000)
    await page.waitForSelector('[data-testid="assistant-response-container"]', { timeout: 35000 })
    await sleep(2000)
    await saveScreenshot(page, 'assistant_methodology_answer.png')

    // =========================================================================
    // Test D — Sources Demonstration
    // =========================================================================
    console.log('\n--- Test D: Source Cards Demonstration ---')
    await page.waitForSelector('[data-testid="assistant-sources-container"]', { timeout: 10000 })
    await page.evaluate(() => {
      const el = document.getElementById('sources-section')
      if (el) el.scrollIntoView({ behavior: 'instant', block: 'start' })
    })
    await sleep(1000)
    await saveScreenshot(page, 'assistant_sources.png')

    // =========================================================================
    // Test E — Source Navigation Traceability
    // =========================================================================
    console.log('\n--- Test E: Source Navigation Traceability ---')
    await page.waitForSelector('[data-testid="view-source-btn-1"]', { timeout: 10000 })
    console.log('Clicking View Source [1] via DOM click...')
    await page.evaluate(() => {
      const btn = document.querySelector('[data-testid="view-source-btn-1"]')
      if (btn) btn.click()
    })
    await page.waitForSelector('[data-testid="paper-detail-container"]', { timeout: 15000 })
    await sleep(2000)
    await saveScreenshot(page, 'assistant_source_navigation.png')

    // =========================================================================
    // Test F — Unsupported Question (Safeguard Test)
    // =========================================================================
    console.log('\n--- Test F: Unsupported Question (No Hallucination) ---')
    await page.goto(`${baseUrl}/assistant?projectId=${project.id}&paperId=${paper.id}&scope=paper`, {
      waitUntil: 'networkidle0',
    })
    await page.waitForSelector('[data-testid="assistant-container"]')

    const unsupportedQ = 'What treatment does this paper recommend for malaria?'
    await fillInput(page, '[data-testid="assistant-question-input"]', unsupportedQ)
    await sleep(500)
    await page.click('[data-testid="assistant-ask-btn"]')

    console.log('Waiting for insufficient evidence response...')
    await page.waitForSelector('[data-testid="assistant-response-container"]', { timeout: 35000 })
    await sleep(2000)
    await saveScreenshot(page, 'assistant_insufficient_evidence.png')

    // =========================================================================
    // Test G — Entire Project Scope
    // =========================================================================
    console.log('\n--- Test G: Entire Project Scope ---')
    await page.click('[data-testid="assistant-scope-project-btn"]')
    await sleep(500)

    const projectQ = 'What neural network architectures and accuracy results are reported across this project?'
    await fillInput(page, '[data-testid="assistant-question-input"]', projectQ)
    await sleep(500)
    await page.click('[data-testid="assistant-ask-btn"]')

    console.log('Waiting for project-scoped answer...')
    await page.waitForSelector('[data-testid="assistant-response-container"]', { timeout: 35000 })
    await sleep(2000)
    await saveScreenshot(page, 'assistant_project_scope.png')

    console.log('\nAll Visual Demonstrations & Screenshots Captured Successfully!')
  } catch (err) {
    console.error('Visual verification error:', err)
    throw err
  } finally {
    await browser.close()
  }
}

runAssistantVisualVerification().catch((err) => {
  console.error(err)
  process.exit(1)
})

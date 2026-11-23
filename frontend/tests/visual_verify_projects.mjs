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

async function runVisualVerification() {
  console.log('\n======================================================')
  console.log('ResearchSphere AI — Module 2 / Iteration 2.1 Visual Verification')
  console.log('Testing Projects CRUD, Workspace, Dashboard & Ownership')
  console.log('======================================================\n')

  const { backendProc, frontendProc } = await ensureServers()

  const timestamp = Date.now()
  const userA = {
    name: 'Dr. Elena Rostova',
    email: `elena.rostova.${timestamp}@stanford.edu`,
    password: 'QuantumBioDiscovery2026!',
  }
  const userB = {
    name: 'Dr. Marcus Vance',
    email: `marcus.vance.${timestamp}@mit.edu`,
    password: 'GenomicIntelligence2026!',
  }

  console.log(`[Setup] Registering User A: ${userA.email}...`)
  await registerUser(userA.name, userA.email, userA.password)
  console.log(`[Setup] Registering User B: ${userB.email}...`)
  await registerUser(userB.name, userB.email, userB.password)

  console.log('[Browser] Launching Puppeteer...')
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1440,900'],
  })

  const page = await browser.newPage()
  await page.setViewport({ width: 1440, height: 900 })

  page.on('console', (msg) => console.log('[Browser Console]', msg.type(), msg.text()))
  page.on('pageerror', (err) => console.log('[Browser PageError]', err.message))
  page.on('requestfailed', (req) => {
    console.log('[Browser Request Failed]', req.url(), req.failure()?.errorText)
  })
  page.on('response', (res) => {
    if (res.url().includes('/api/')) {
      console.log('[Browser API Response]', res.status(), res.url())
    }
  })

  try {
    // 1. Login as User A
    console.log('\n[Step 1] Logging in as User A...')
    await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle2' })
    await sleep(500)
    await fillInput(page, '#email', userA.email)
    await fillInput(page, '#password', userA.password)
    await page.click('button[type="submit"]')
    await page.waitForFunction(() => window.location.pathname === '/', { timeout: 8000 })
    await sleep(800)
    console.log(`✓ User A logged in successfully. Current URL: ${page.url()}`)

    // 2. Navigate to /projects (Empty State)
    console.log('\n[Step 2] Verifying Empty Projects List Screen...')
    await page.goto(`${baseUrl}/projects`, { waitUntil: 'networkidle0' })
    await page.waitForSelector('[data-testid="projects-empty-state"]', { timeout: 10000 })
    
    // Check metric totals
    const totalProjectsText = await page.$eval('[data-testid="metric-total-projects"]', (el) => el.textContent.trim())
    console.log(`✓ Confirmed initial Total Projects metric is: ${totalProjectsText}`)
    if (totalProjectsText !== '0') {
      throw new Error(`Expected Total Projects = 0, got ${totalProjectsText}`)
    }

    // Capture 1: project_empty.png
    await saveScreenshot(page, 'project_empty.png')

    // 3. Open Create Project Modal
    console.log('\n[Step 3] Opening Create Project Modal...')
    await page.click('[data-testid="empty-create-project-btn"]')
    await page.waitForSelector('[data-testid="create-project-modal"]', { timeout: 5000 })

    const projectName = 'GraphRAG Literature Review'
    const projectDesc = 'Analyzing knowledge graph construction over biomedical literature corpora and multi-hop reasoning.'

    await fillInput(page, '#create-project-name', projectName)
    await fillInput(page, '#create-project-desc', projectDesc)
    await sleep(300)

    // Capture 2: project_create_modal.png
    await saveScreenshot(page, 'project_create_modal.png')

    // 4. Submit Create Project
    console.log('\n[Step 4] Submitting New Project Creation...')
    await page.click('[data-testid="submit-create-project"]')
    await sleep(2000)

    const modalError = await page
      .$eval('[data-testid="project-modal-error"]', (el) => el.textContent)
      .catch(() => null)
    if (modalError) {
      console.log('❌ [Form Error on Modal]:', modalError)
    }

    // Wait for create modal to disappear
    await page.waitForFunction(() => !document.querySelector('[data-testid="create-project-modal"]'), { timeout: 10000 })
    await sleep(500)
    await page.waitForSelector('[data-testid="projects-grid"]', { timeout: 10000 })
    await sleep(500)

    // Verify card is present
    const projectCards = await page.$$('[data-testid^="project-card-"]')
    console.log(`✓ Found ${projectCards.length} project card(s) in grid.`)
    if (projectCards.length !== 1) {
      throw new Error(`Expected 1 project card, got ${projectCards.length}`)
    }

    // Capture 3: project_list_populated.png
    await saveScreenshot(page, 'project_list_populated.png')

    // Extract created project ID from card
    const cardIdAttr = await page.$eval('[data-testid^="project-card-"]', (el) => el.getAttribute('data-testid'))
    const projectId = cardIdAttr.replace('project-card-', '')
    console.log(`✓ Extracted Project ID: ${projectId}`)

    // 5. Open Project Workspace (/projects/:projectId)
    console.log(`\n[Step 5] Opening Project Workspace (/projects/${projectId})...`)
    await page.click(`[data-testid="open-project-btn-${projectId}"]`)
    await page.waitForSelector('[data-testid="project-workspace-container"]', { timeout: 10000 })
    await sleep(500)

    const workspaceTitle = await page.$eval('[data-testid="project-workspace-title"]', (el) => el.textContent.trim())
    console.log(`✓ Project Workspace Title: "${workspaceTitle}"`)
    if (workspaceTitle !== projectName) {
      throw new Error(`Expected title "${projectName}", got "${workspaceTitle}"`)
    }

    // Capture 4: project_workspace.png
    await saveScreenshot(page, 'project_workspace.png')

    // 6. Test Browser Refresh Persistence
    console.log('\n[Step 6] Testing Browser Refresh Persistence on Project Workspace...')
    await page.reload({ waitUntil: 'networkidle0' })
    await page.waitForSelector('[data-testid="project-workspace-container"]', { timeout: 10000 })
    const refreshedTitle = await page.$eval('[data-testid="project-workspace-title"]', (el) => el.textContent.trim())
    if (refreshedTitle !== projectName) {
      throw new Error(`Reload failed: expected "${projectName}", got "${refreshedTitle}"`)
    }
    console.log('✓ Project Workspace persisted cleanly across browser reload.')

    // 7. Edit Project Modal & Submit
    console.log('\n[Step 7] Opening Edit Project Modal...')
    await page.click('[data-testid="edit-project-btn"]')
    await page.waitForSelector('[data-testid="edit-project-modal"]', { timeout: 5000 })

    const updatedName = 'GraphRAG Research Analysis'
    const updatedDesc = 'Updated research analysis on biomedical knowledge graph construction and reasoning.'

    await fillInput(page, '#workspace-edit-name', updatedName)
    await fillInput(page, '#workspace-edit-desc', updatedDesc)
    await sleep(300)

    // Capture 5: project_edit_modal.png
    await saveScreenshot(page, 'project_edit_modal.png')

    console.log('Submitting updated project details...')
    await page.click('[data-testid="submit-workspace-edit-btn"]')
    await sleep(1000)

    const titleAfterEdit = await page.$eval('[data-testid="project-workspace-title"]', (el) => el.textContent.trim())
    console.log(`✓ Project Workspace Title after edit: "${titleAfterEdit}"`)
    if (titleAfterEdit !== updatedName) {
      throw new Error(`Expected updated title "${updatedName}", got "${titleAfterEdit}"`)
    }

    // 8. Verify Dashboard Integration with Project Count & Recent Projects
    console.log('\n[Step 8] Checking Dashboard Integration (/)...')
    await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle0' })
    await sleep(1000)

    const dashboardProjectCount = await page.$eval('[data-testid="metric-active-projects"]', (el) => el.textContent.trim())
    console.log(`✓ Dashboard Active Projects metric: ${dashboardProjectCount}`)
    if (dashboardProjectCount !== '1') {
      throw new Error(`Expected Dashboard Active Projects = 1, got ${dashboardProjectCount}`)
    }

    // Capture 7: project_dashboard_with_project.png
    await saveScreenshot(page, 'project_dashboard_with_project.png')

    // 9. Verify Ownership Isolation (User B cannot access User A's project)
    console.log('\n[Step 9] Verifying Ownership Isolation with User B...')
    // Logout User A
    await page.click('[data-testid="header-user-menu-trigger"]')
    await sleep(400)
    await page.waitForSelector('[data-testid="header-menu-logout"]', { timeout: 3000 })
    await page.click('[data-testid="header-menu-logout"]')
    await page.waitForFunction(() => window.location.pathname === '/login', { timeout: 8000 })
    await sleep(800)

    // Login as User B
    console.log(`Logging in as User B (${userB.email})...`)
    await fillInput(page, '#email', userB.email)
    await fillInput(page, '#password', userB.password)
    await page.click('button[type="submit"]')
    await page.waitForFunction(() => window.location.pathname === '/', { timeout: 8000 })
    await sleep(800)

    // User B visits /projects -> should see empty state
    await page.goto(`${baseUrl}/projects`, { waitUntil: 'networkidle0' })
    await page.waitForSelector('[data-testid="projects-empty-state"]', { timeout: 10000 })
    console.log("✓ User B sees 0 projects (User A's project is strictly isolated).")

    // User B attempts to access User A's project URL directly
    console.log(`User B attempting to open User A's project directly: /projects/${projectId}...`)
    await page.goto(`${baseUrl}/projects/${projectId}`, { waitUntil: 'networkidle0' })
    await sleep(1000)

    // Should show "Project Unavailable"
    const unavailableNotice = await page.$eval('h2', (el) => el.textContent.trim())
    console.log(`✓ User B received access block: "${unavailableNotice}"`)
    if (!unavailableNotice.includes('Project Unavailable')) {
      throw new Error(`Expected "Project Unavailable", got "${unavailableNotice}"`)
    }

    // 10. Switch back to User A and Delete the Project
    console.log('\n[Step 10] Switching back to User A to test deletion...')
    await page.click('[data-testid="header-user-menu-trigger"]')
    await sleep(400)
    await page.waitForSelector('[data-testid="header-menu-logout"]', { timeout: 3000 })
    await page.click('[data-testid="header-menu-logout"]')
    await page.waitForFunction(() => window.location.pathname === '/login', { timeout: 8000 })
    await sleep(800)

    // Login User A
    await fillInput(page, '#email', userA.email)
    await fillInput(page, '#password', userA.password)
    await page.click('button[type="submit"]')
    await page.waitForFunction(() => window.location.pathname !== '/login', { timeout: 8000 })
    await sleep(800)

    // Go to projects list
    await page.goto(`${baseUrl}/projects`, { waitUntil: 'networkidle0' })
    await page.waitForSelector(`[data-testid="project-options-${projectId}"]`, { timeout: 10000 })

    // Open options dropdown and click Delete
    await page.click(`[data-testid="project-options-${projectId}"]`)
    await sleep(400)
    await page.waitForSelector(`[data-testid="delete-project-menu-btn-${projectId}"]`, { timeout: 5000 })
    await page.click(`[data-testid="delete-project-menu-btn-${projectId}"]`)

    await page.waitForSelector('[data-testid="delete-project-modal"]', { timeout: 5000 })
    await sleep(300)

    // Capture 6: project_delete_confirm.png
    await saveScreenshot(page, 'project_delete_confirm.png')

    // Confirm Delete
    console.log('Confirming project deletion...')
    await page.click('[data-testid="confirm-delete-project-btn"]')
    await page.waitForSelector('[data-testid="projects-empty-state"]', { timeout: 10000 })
    console.log('✓ Project deleted successfully, Projects list returned to empty state.')

    // Final dashboard check
    await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle0' })
    await sleep(1000)
    const finalDashboardCount = await page.$eval('[data-testid="metric-active-projects"]', (el) => el.textContent.trim())
    console.log(`✓ Final Dashboard Active Projects metric after deletion: ${finalDashboardCount}`)
    if (finalDashboardCount !== '0') {
      throw new Error(`Expected 0 after deletion, got ${finalDashboardCount}`)
    }

    console.log('\n======================================================')
    console.log('✓ ALL 7 SCREENSHOTS CAPTURED & VISUAL CHECKS PASSED!')
    console.log('======================================================\n')
  } finally {
    await browser.close()
    if (backendProc) {
      try {
        backendProc.kill()
      } catch {}
    }
    if (frontendProc) {
      try {
        frontendProc.kill()
      } catch {}
    }
  }
}

runVisualVerification().catch((err) => {
  console.error('\n❌ Visual Verification FAILED:', err)
  process.exit(1)
})

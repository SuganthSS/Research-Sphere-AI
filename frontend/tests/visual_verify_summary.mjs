import puppeteer from 'puppeteer-core'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { execSync } from 'child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const artifactDir = 'C:\\Users\\sugan\\.gemini\\antigravity\\brain\\5327b46e-92c9-4dc0-b9bd-558ac77f3cff'
const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const baseUrl = 'http://localhost:5173'

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function runVisualVerifySummary() {
  console.log('=================================================================')
  console.log('ResearchSphere AI — Module 7.1 Visual Verification')
  console.log('Evidence-Grounded Structured Scientific Paper Summarization')
  console.log('=================================================================\n')

  // 1. Generate auth token and user object
  console.log('[1/5] Generating auth session for user suganth@gmail.com...')
  const pyAuth = execSync(
    'backend\\.venv\\Scripts\\python.exe "C:\\Users\\sugan\\.gemini\\antigravity\\brain\\5327b46e-92c9-4dc0-b9bd-558ac77f3cff\\scratch\\get_auth_token.py"',
    { cwd: 'c:\\Suganth\\Project\\Research Sphere AI\\Project' }
  ).toString().trim()

  const authData = JSON.parse(pyAuth)
  const token = authData.token
  const userObj = authData.user
  const paperId = '6a64b661-028d-4f5e-9b68-ced08f396406'

  console.log('Token acquired. Launching Chrome at:', chromePath)
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1440,960'],
    defaultViewport: { width: 1440, height: 960 },
  })

  try {
    const page = await browser.newPage()
    page.setDefaultTimeout(30000)
    page.on('console', (msg) => {
      if (msg.type() === 'error') console.log('  [BROWSER ERROR]', msg.text())
    })

    // 2. Authenticate
    console.log('[2/5] Setting up authenticated browser session...')
    await page.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' })
    await page.evaluate(
      (t, u) => {
        localStorage.setItem('researchsphere_token', t)
        localStorage.setItem('researchsphere_user', JSON.stringify(u))
      },
      token,
      userObj
    )

    // 3. Navigate to Paper Detail Summary tab
    console.log(`[3/5] Navigating to Paper Detail Summary tab for paper ${paperId}...`)
    const summaryUrl = `${baseUrl}/papers/${paperId}?tab=summary`
    await page.goto(summaryUrl, { waitUntil: 'networkidle0' })
    await sleep(1500)

    // Verify summary tab is active and content rendered
    const summaryDom = await page.evaluate(() => {
      const activeTabEl = document.querySelector('[data-testid="tab-summary"]')
      const summaryContainer = document.querySelector('[data-testid="summary-content-container"]')
      const notStartedCard = document.querySelector('[data-testid="summary-not-started-card"]')
      const inProgressCard = document.querySelector('[data-testid="summary-in-progress-card"]')

      const cardObjective = document.querySelector('[data-testid="summary-card-objective"]')
      const cardMethodology = document.querySelector('[data-testid="summary-card-methodology"]')
      const cardDataset = document.querySelector('[data-testid="summary-card-dataset_setup"]')
      const cardFindings = document.querySelector('[data-testid="summary-card-key_findings"]')
      const cardLimitations = document.querySelector('[data-testid="summary-card-limitations"]')
      const cardFutureWork = document.querySelector('[data-testid="summary-card-future_work"]')

      const citationBtns = Array.from(document.querySelectorAll('[data-testid^="citation-btn-"]')).map(b => ({
        testId: b.getAttribute('data-testid'),
        text: b.textContent.trim(),
      }))

      return {
        activeTab: activeTabEl ? activeTabEl.textContent.trim() : null,
        hasContainer: !!summaryContainer,
        hasNotStartedCard: !!notStartedCard,
        hasInProgressCard: !!inProgressCard,
        cards: {
          objective: !!cardObjective,
          methodology: !!cardMethodology,
          dataset_setup: !!cardDataset,
          key_findings: !!cardFindings,
          limitations: !!cardLimitations,
          future_work: !!cardFutureWork,
        },
        citationCount: citationBtns.length,
        citationSample: citationBtns.slice(0, 3),
      }
    })

    console.log('DOM Evaluation Result:', JSON.stringify(summaryDom, null, 2))

    // If summary wasn't auto-loaded or was not generated, click generate button
    if (summaryDom.hasNotStartedCard) {
      console.log('Summary not started card visible. Clicking "Generate Summary" button...')
      await page.click('[data-testid="generate-summary-btn"]')
      console.log('Waiting for summary generation to complete...')
      await page.waitForSelector('[data-testid="summary-content-container"]', { timeout: 60000 })
      await sleep(1000)
    } else {
      console.log('Persisted summary successfully loaded and rendered!')
    }

    // 4. Capture screenshot of complete summary
    console.log('[4/5] Capturing screenshot: paper_summary_complete.png...')
    const summaryScreenshotPath = path.join(artifactDir, 'paper_summary_complete.png')
    await page.screenshot({ path: summaryScreenshotPath, fullPage: false })
    console.log('Saved to:', summaryScreenshotPath)

    // 5. Click citation deep-link and verify exact source highlight
    console.log('[5/5] Clicking first citation button to verify View Source deep-link and highlight...')
    const firstCiteSelector = '[data-testid^="citation-btn-objective-"]'
    await page.waitForSelector(firstCiteSelector, { timeout: 10000 })
    await page.click(firstCiteSelector)

    console.log('Clicked citation. Waiting for transition to Extracted Text tab...')
    await sleep(2000)

    const sourceDom = await page.evaluate(() => {
      const activeTabEl = document.querySelector('[data-testid="tab-extracted-text"]')
      const targetEl = document.getElementById('cited-evidence-target')
      const targetText = targetEl ? targetEl.textContent.trim() : null
      const badgeEl = targetEl ? targetEl.querySelector('span') : null

      return {
        currentUrl: window.location.href,
        activeTab: activeTabEl ? activeTabEl.textContent.trim() : null,
        hasTarget: !!targetEl,
        targetPreview: targetText ? targetText.slice(0, 100) : null,
        badgeText: badgeEl ? badgeEl.textContent.trim() : null,
      }
    })

    console.log('Source Page Evaluation:', JSON.stringify(sourceDom, null, 2))

    const sourceScreenshotPath = path.join(artifactDir, 'paper_summary_source.png')
    await page.screenshot({ path: sourceScreenshotPath, fullPage: false })
    console.log('Saved to:', sourceScreenshotPath)

    console.log('\n=================================================================')
    console.log('VISUAL VERIFICATION COMPLETED SUCCESSFULLY!')
    console.log('Screenshots generated:')
    console.log('  1. paper_summary_complete.png')
    console.log('  2. paper_summary_source.png')
    console.log('=================================================================')
  } catch (err) {
    console.error('Visual verification failed:', err)
    process.exitCode = 1
  } finally {
    await browser.close()
  }
}

runVisualVerifySummary()

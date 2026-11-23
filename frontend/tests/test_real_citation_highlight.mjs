import puppeteer from 'puppeteer-core'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { execSync } from 'child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const artifactDir = 'C:\\Users\\sugan\\.gemini\\antigravity\\brain\\5327b46e-92c9-4dc0-b9bd-558ac77f3cff'
const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const baseUrl = 'http://127.0.0.1:5173'

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function runRealCitationVerification() {
  console.log('=================================================================')
  console.log('ResearchSphere AI — Real Citation Highlighting Test (Page 20 / Citation 5)')
  console.log('=================================================================\n')

  // Get auth token and user data for suganth@gmail.com
  const pyAuth = execSync('"c:\\Suganth\\Project\\Research Sphere AI\\Project\\backend\\.venv\\Scripts\\python.exe" "c:\\Suganth\\Project\\Research Sphere AI\\Project\\scratch\\get_auth_token.py"').toString().trim()
  const authData = JSON.parse(pyAuth)
  const token = authData.token
  const userObj = authData.user
  const paperId = '6a64b661-028d-4f5e-9b68-ced08f396406'
  const chunk30Id = '5b3c825a-900e-4f2d-ab1d-62953a840943'
  const chunk31Id = '6ab0dabf-54b0-4e6c-be2f-61cfcb7c434a'
  const chunk32Id = '8fcc8708-0ab3-47ce-8cd8-f383f8398343'

  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1440,960'],
    defaultViewport: { width: 1440, height: 960 },
  })

  try {
    const page = await browser.newPage()
    page.setDefaultTimeout(30000)
    page.on('console', msg => console.log('  [BROWSER]', msg.type(), msg.text()))
    page.on('pageerror', err => console.log('  [BROWSER ERROR]', err.message))

    // Pre-seed auth state in localStorage
    await page.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' })
    await page.evaluate((t, u) => {
      localStorage.setItem('researchsphere_token', t)
      localStorage.setItem('researchsphere_user', JSON.stringify(u))
    }, token, userObj)

    // =========================================================================
    // TEST 1: The Failing Real Page 20 / Citation 5 Case
    // =========================================================================
    console.log('[TEST 1] Verifying Real Page 20 / Citation 5 (Chunk 30)...')
    const urlP20C5 = `${baseUrl}/papers/${paperId}?tab=extracted-text&page=20&chunk=${chunk30Id}&citation=5`
    await page.goto(urlP20C5, { waitUntil: 'networkidle0' })
    await sleep(1000)
    console.log('Current URL:', page.url())
    const domInfo = await page.evaluate(() => {
      const activeTabEl = document.querySelector('[data-testid="tab-extracted-text"]')
      const pageCard20 = document.querySelector('[data-testid="extracted-page-card-20"]')
      const banner = document.querySelector('[data-testid="cited-evidence-banner"]')
      const highlight = document.querySelector('[data-testid="cited-evidence-highlight"]')
      const pagesContainer = document.querySelector('[data-testid="pages-container"]')
      return {
        tabActive: activeTabEl?.className,
        hasPage20: !!pageCard20,
        hasBanner: !!banner,
        bannerText: banner?.textContent,
        hasHighlight: !!highlight,
        highlightText: highlight?.textContent,
        hasPagesContainer: !!pagesContainer,
        firstPageRendered: pagesContainer?.firstElementChild?.getAttribute('data-testid')
      }
    })
    console.log('DOM Info:', JSON.stringify(domInfo, null, 2))

    // Wait for chunk highlight element to appear
    await page.waitForSelector('[data-testid="cited-evidence-highlight"]', { timeout: 10000 })
    await sleep(600)

    // Verify Page 20 is selected
    const p20Badge = await page.$('[data-testid="extracted-page-card-20"]')
    if (!p20Badge) throw new Error('Page 20 card must be visible')

    // Verify label text
    const label5 = await page.$eval('[data-testid="citation-indicator-label"]', el => el.textContent)
    console.log(`  Citation Label: "${label5}"`)
    if (!label5.includes('Cited Source [5]')) {
      throw new Error(`Expected 'Cited Source [5]', got '${label5}'`)
    }

    // Verify highlighted text content
    const highlightText5 = await page.$eval('[data-testid="cited-evidence-highlight"]', el => el.textContent)
    console.log(`  Highlighted text snippet: "${highlightText5.replace(/\s+/g, ' ').slice(0, 120)}..."`)
    if (!highlightText5.includes('research problem') && !highlightText5.includes('collaborators')) {
      throw new Error('Highlighted text does not contain expected supporting evidence')
    }
    console.log('  ✓ Page 20 / Citation 5 successfully highlighted supporting evidence!\n')

    // Capture visual verification screenshot
    const screenshotName = 'assistant_exact_source_highlight_real.png'
    const screenshotLocal = path.join(__dirname, 'screenshots', screenshotName)
    const screenshotArtifact = path.join(artifactDir, screenshotName)
    await page.screenshot({ path: screenshotLocal, fullPage: false })
    fs.copyFileSync(screenshotLocal, screenshotArtifact)
    console.log(`  ✓ Captured screenshot: ${screenshotArtifact}\n`)

    // =========================================================================
    // TEST 2: Multi-Page Chunk on Page 20 (Chunk 31 / Citation 3)
    // =========================================================================
    console.log('[TEST 2] Verifying Multi-Page Chunk on Page 20 (Chunk 31 / Citation 3)...')
    const urlP20C3 = `${baseUrl}/papers/${paperId}?tab=extracted-text&page=20&chunk=${chunk31Id}&citation=3`
    await page.goto(urlP20C3, { waitUntil: 'networkidle0' })
    await page.waitForSelector('[data-testid="cited-evidence-highlight"]', { timeout: 10000 })
    await sleep(500)

    const label3 = await page.$eval('[data-testid="citation-indicator-label"]', el => el.textContent)
    console.log(`  Citation Label: "${label3}"`)
    if (!label3.includes('Cited Source [3]')) {
      throw new Error(`Expected 'Cited Source [3]', got '${label3}'`)
    }
    const highlightText3 = await page.$eval('[data-testid="cited-evidence-highlight"]', el => el.textContent)
    console.log(`  Highlighted text snippet: "${highlightText3.replace(/\s+/g, ' ').slice(0, 120)}..."`)
    if (!highlightText3.includes('available publication') && !highlightText3.includes('reproducible retrieval')) {
      throw new Error('Multi-page chunk on Page 20 did not match expected start-page portion')
    }
    console.log('  ✓ Multi-page Chunk 31 successfully matched and highlighted on Page 20!\n')

    // =========================================================================
    // TEST 3: Citation on Another Page (Page 21 / Citation 2 / Chunk 32)
    // =========================================================================
    console.log('[TEST 3] Verifying Citation on Another Page (Page 21 / Citation 2 / Chunk 32)...')
    const urlP21C2 = `${baseUrl}/papers/${paperId}?tab=extracted-text&page=21&chunk=${chunk32Id}&citation=2`
    await page.goto(urlP21C2, { waitUntil: 'networkidle0' })
    await page.waitForSelector('[data-testid="cited-evidence-highlight"]', { timeout: 10000 })
    await sleep(500)

    const p21Badge = await page.$('[data-testid="extracted-page-card-21"]')
    if (!p21Badge) throw new Error('Page 21 card must be visible')

    const label2 = await page.$eval('[data-testid="citation-indicator-label"]', el => el.textContent)
    console.log(`  Citation Label: "${label2}"`)
    if (!label2.includes('Cited Source [2]')) {
      throw new Error(`Expected 'Cited Source [2]', got '${label2}'`)
    }
    const highlightText2 = await page.$eval('[data-testid="cited-evidence-highlight"]', el => el.textContent)
    console.log(`  Highlighted text snippet: "${highlightText2.replace(/\s+/g, ' ').slice(0, 120)}..."`)
    if (!highlightText2.includes('recommendation indicates a possible match')) {
      throw new Error('Page 21 chunk did not match expected text')
    }
    console.log('  ✓ Page 21 / Citation 2 successfully highlighted supporting evidence!\n')

    console.log('=================================================================')
    console.log('ALL TARGETED CITATION TESTS PASSED WITH VISIBLE HIGHLIGHTS!')
    console.log('=================================================================')
  } finally {
    await browser.close()
  }
}

runRealCitationVerification().catch(err => {
  console.error('Test failed:', err)
  process.exit(1)
})

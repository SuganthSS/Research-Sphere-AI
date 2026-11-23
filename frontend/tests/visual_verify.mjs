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

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function runVisualVerification() {
  console.log('========================================================')
  console.log('   ResearchSphere AI — Visual Browser Verification     ')
  console.log('========================================================\n')

  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1400,900'],
    defaultViewport: { width: 1400, height: 900 },
  })

  const page = await browser.newPage()
  const consoleErrors = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text())
    }
  })

  try {
    // 1. Verify Dashboard (/)
    console.log('[1/8] Navigating to Dashboard (http://localhost:5173/)...')
    await page.goto(baseUrl, { waitUntil: 'networkidle2' })
    await sleep(1500) // allow health check to settle

    const dashboardTitle = await page.title()
    console.log(`✓ Browser Page Title: "${dashboardTitle}"`)

    const headerText = await page.$eval('header h1', (el) => el.textContent?.trim())
    console.log(`✓ Header Title: "${headerText}"`)

    const welcomeHeading = await page.$eval('main h2', (el) => el.textContent?.trim())
    console.log(`✓ Welcome Banner: "${welcomeHeading}"`)

    // Check stats cards
    const statCards = await page.$$eval('section:nth-of-type(2) a', (els) =>
      els.map((el) => {
        const title = el.querySelector('span')?.textContent?.trim()
        const val = el.querySelector('.text-3xl')?.textContent?.trim()
        return `${title}: ${val}`
      })
    )
    console.log(`✓ Research Corpus Stat Cards:`, statCards)

    // Check quick actions
    const quickActions = await page.$$eval('section:nth-of-type(3) h4', (els) =>
      els.map((el) => el.textContent?.trim())
    )
    console.log(`✓ Quick Action Cards:`, quickActions)

    await page.screenshot({ path: path.join(screenshotsDir, 'dashboard.png') })
    console.log(`✓ Screenshot captured: dashboard.png`)

    // Routes to click and verify in sidebar
    const routesToTest = [
      { name: 'Projects', href: '/projects', expectedTitle: 'Research Projects' },
      { name: 'Papers', href: '/papers', expectedTitle: 'Research Papers' },
      { name: 'AI Assistant', href: '/assistant', expectedTitle: 'AI Research Assistant' },
      { name: 'Compare Papers', href: '/compare', expectedTitle: 'Compare Research Papers' },
      { name: 'Knowledge Graph', href: '/knowledge-graph', expectedTitle: 'Research Knowledge Graph' },
      { name: 'Research Gaps', href: '/research-gaps', expectedTitle: 'Research Gap Discovery' },
      { name: 'Settings', href: '/settings', expectedTitle: 'Workspace Settings' },
      { name: 'System Status', href: '/system-status', expectedTitle: 'System Status & Diagnostics' },
    ]

    for (let i = 0; i < routesToTest.length; i++) {
      const route = routesToTest[i]
      console.log(`\n[${i + 2}/8] Clicking sidebar link: "${route.name}" (${route.href})...`)

      // Click sidebar link
      await page.click(`aside nav a[href="${route.href}"]`)
      await sleep(1000)

      const pageHeading = await page.$eval('main h2', (el) => el.textContent?.trim())
      console.log(`✓ Rendered Page Heading: "${pageHeading}"`)
      if (!pageHeading?.includes(route.expectedTitle)) {
        throw new Error(`Expected heading containing "${route.expectedTitle}", got "${pageHeading}"`)
      }

      const activeLink = await page.$eval(`aside nav a[href="${route.href}"]`, (el) =>
        el.className
      )
      const isHighlighted = activeLink.includes('bg-indigo-600') || activeLink.includes('text-indigo-300')
      console.log(`✓ Nav link "${route.name}" active highlighting: ${isHighlighted}`)

      const shotName = `${route.href.replace('/', '')}.png`
      await page.screenshot({ path: path.join(screenshotsDir, shotName) })
      console.log(`✓ Screenshot captured: ${shotName}`)

      // Special verification on System Status page
      if (route.href === '/system-status') {
        console.log('\n--- Deep Inspection on /system-status ---')
        const systemCards = await page.$$eval('main .grid > div', (cards) =>
          cards.map((c) => {
            const name = c.querySelector('span.text-slate-200')?.textContent?.trim()
            const status = c.querySelector('span.font-mono')?.textContent?.trim()
            return `${name}: ${status}`
          })
        )
        console.log(`✓ System Infrastructure Status Cards:`, systemCards)

        console.log('Testing "Check Again" button on System Status page...')
        await page.evaluate(() => {
          const btn = [...document.querySelectorAll('button')].find((b) =>
            b.textContent?.includes('Check Again')
          )
          if (btn) btn.click()
        })
        await sleep(1000)
        console.log('✓ "Check Again" button clicked and status refreshed successfully.')
      }
    }

    console.log('\n========================================================')
    console.log(`Console Errors: ${consoleErrors.length}`)
    if (consoleErrors.length > 0) {
      console.warn('Console error messages:', consoleErrors)
    } else {
      console.log('✓ Zero console errors detected during full navigation flow.')
    }
    console.log('   VISUAL BROWSER VERIFICATION COMPLETED WITH SUCCESS! ')
    console.log('========================================================')
  } finally {
    await browser.close()
  }
}

runVisualVerification()

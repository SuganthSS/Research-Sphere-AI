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
const registerUrl = 'http://localhost:5173/register'

async function sleep(ms) {
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

async function runVisualRegistrationTest() {
  console.log('========================================================')
  console.log('   ResearchSphere AI — Visual Registration E2E Test    ')
  console.log('========================================================\n')

  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1400,900'],
    defaultViewport: { width: 1400, height: 900 },
  })

  const page = await browser.newPage()

  try {
    // 1. Navigate to Registration page
    console.log('[Step 1] Navigating to /register...')
    await page.goto(registerUrl, { waitUntil: 'networkidle2' })
    await sleep(1000)

    const title = await page.$eval('main h2', (el) => el.textContent?.trim())
    console.log(`✓ Registration Heading: "${title}"`)
    await page.screenshot({ path: path.join(screenshotsDir, 'register_form_initial.png') })

    // 2. Test Password Mismatch validation
    console.log('\n[Step 2] Testing Password Mismatch validation...')
    await fillInput(page, '#name', 'Dr. Rosalind Franklin')
    await fillInput(page, '#email', 'rosalind@dna-research.org')
    await fillInput(page, '#password', 'HelixPassword123!')
    await fillInput(page, '#confirmPassword', 'HelixPasswordWrong!')
    await page.click('button[type="submit"]')
    await sleep(500)

    const mismatchError = await page.$eval('p.text-rose-400', (el) => el.textContent?.trim())
    console.log(`✓ Client Validation Error Caught: "${mismatchError}"`)
    if (mismatchError !== 'Passwords do not match.') {
      throw new Error(`Expected "Passwords do not match.", got "${mismatchError}"`)
    }
    await page.screenshot({ path: path.join(screenshotsDir, 'register_password_mismatch.png') })

    // 3. Test Invalid Email validation
    console.log('\n[Step 3] Testing Invalid Email validation...')
    await fillInput(page, '#email', 'not-a-valid-email')
    await fillInput(page, '#confirmPassword', 'HelixPassword123!')
    await page.click('button[type="submit"]')
    await sleep(500)

    const emailError = await page.$eval('p.text-rose-400', (el) => el.textContent?.trim())
    console.log(`✓ Client Email Error Caught: "${emailError}"`)
    if (emailError !== 'Please enter a valid email address.') {
      throw new Error(`Expected "Please enter a valid email address.", got "${emailError}"`)
    }
    await page.screenshot({ path: path.join(screenshotsDir, 'register_invalid_email.png') })

    // 4. Test Valid Registration Workflow (Real PostgreSQL Persistence)
    console.log('\n[Step 4] Submitting Valid Registration (Real PostgreSQL Persistence)...')
    const uniqueEmail = `rosalind_${Date.now()}@dna-research.org`
    await fillInput(page, '#email', uniqueEmail)
    await fillInput(page, '#confirmPassword', 'HelixPassword123!')
    await page.click('button[type="submit"]')

    // Wait for success screen
    await page.waitForSelector('[data-testid="registration-success"]', { timeout: 8000 })
    const successTitle = await page.$eval('[data-testid="registration-success"] h2', (el) =>
      el.textContent?.trim()
    )
    console.log(`✓ Registration Success Title: "${successTitle}"`)

    const successDetails = await page.$$eval('[data-testid="registration-success"] .flex', (rows) =>
      rows.map((r) => r.textContent?.replace(/\s+/g, ' ').trim())
    )
    console.log(`✓ Displayed Researcher Profile:`, successDetails)
    await page.screenshot({ path: path.join(screenshotsDir, 'register_success_view.png') })

    // 5. Test Duplicate Email Rejection (409 Conflict from FastAPI)
    console.log('\n[Step 5] Testing Duplicate Email Rejection (FastAPI 409 Conflict)...')
    // Click "Register another account"
    await page.evaluate(() => {
      [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('Register another'))?.click()
    })
    await sleep(800)

    // Re-fill form with the SAME email
    await fillInput(page, '#name', 'Dr. Rosalind Franklin')
    await fillInput(page, '#email', uniqueEmail)
    await fillInput(page, '#password', 'HelixPassword123!')
    await fillInput(page, '#confirmPassword', 'HelixPassword123!')
    await page.click('button[type="submit"]')

    // Wait for API error banner
    await page.waitForSelector('[data-testid="api-error-banner"]', { timeout: 8000 })
    const duplicateErrorMsg = await page.$eval('[data-testid="api-error-banner"]', (el) =>
      el.textContent?.trim()
    )
    console.log(`✓ Duplicate Account Error Banner: "${duplicateErrorMsg}"`)
    if (!duplicateErrorMsg.includes('already exists')) {
      throw new Error(`Expected duplicate message, got: ${duplicateErrorMsg}`)
    }
    await page.screenshot({ path: path.join(screenshotsDir, 'register_duplicate_error.png') })

    console.log('\n========================================================')
    console.log('   ALL REGISTRATION E2E SCENARIOS VERIFIED IN BROWSER! ')
    console.log('========================================================')
  } finally {
    await browser.close()
  }
}

runVisualRegistrationTest()

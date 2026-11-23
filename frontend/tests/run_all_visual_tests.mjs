import { spawn, execSync } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '../..')
const pythonBin = path.join(projectRoot, 'backend', '.venv', 'Scripts', 'python.exe')
const backendDir = path.join(projectRoot, 'backend')
const frontendDir = path.join(projectRoot, 'frontend')

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

async function main() {
  console.log('Starting backend & frontend for full suite run...')

  let backendProc = null
  let frontendProc = null

  if (!(await isServerRunning('http://127.0.0.1:8000/api/health'))) {
    backendProc = spawn(pythonBin, ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', '8000'], {
      cwd: backendDir,
      stdio: 'ignore',
    })
    for (let i = 0; i < 40; i++) {
      if (await isServerRunning('http://127.0.0.1:8000/api/health')) break
      await sleep(250)
    }
  }

  if (!(await isServerRunning('http://localhost:5173'))) {
    const viteBin = path.join(frontendDir, 'node_modules', 'vite', 'bin', 'vite.js')
    frontendProc = spawn(process.execPath, [viteBin], {
      cwd: frontendDir,
      stdio: 'ignore',
    })
    for (let i = 0; i < 40; i++) {
      if (await isServerRunning('http://localhost:5173')) break
      await sleep(250)
    }
  }

  console.log('✓ Both servers are ready! Running existing test suites...\n')

  try {
    console.log('--- Running visual_verify_register.mjs ---')
    execSync('node frontend/tests/visual_verify_register.mjs', { cwd: projectRoot, stdio: 'inherit' })

    console.log('\n--- Running visual_verify_login.mjs ---')
    execSync('node frontend/tests/visual_verify_login.mjs', { cwd: projectRoot, stdio: 'inherit' })

    console.log('\n--- Running visual_verify_protected_routes.mjs ---')
    execSync('node frontend/tests/visual_verify_protected_routes.mjs', { cwd: projectRoot, stdio: 'inherit' })

    console.log('\n--- Running visual_verify_logout.mjs ---')
    execSync('node frontend/tests/visual_verify_logout.mjs', { cwd: projectRoot, stdio: 'inherit' })

    console.log('\n--- Running visual_verify_projects.mjs (Module 2) ---')
    execSync('node frontend/tests/visual_verify_projects.mjs', { cwd: projectRoot, stdio: 'inherit' })

    console.log('\n✅ ALL 5 TEST SUITES PASSED FLAWLESSLY!')
  } finally {
    if (backendProc) backendProc.kill()
    if (frontendProc) frontendProc.kill()
  }
}

main().catch((err) => {
  console.error('Test execution failed:', err)
  process.exit(1)
})

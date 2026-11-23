import { spawn } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '../..')
const pythonBin = path.join(projectRoot, 'backend', '.venv', 'Scripts', 'python.exe')
const backendDir = path.join(projectRoot, 'backend')
const baseUrl = 'http://127.0.0.1:8000'

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

function startBackend() {
  const proc = spawn(pythonBin, ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', '8000'], {
    cwd: backendDir,
    stdio: 'ignore',
  })
  return proc
}

async function waitForServer(timeoutMs = 6000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${baseUrl}/api/health`)
      if (res.ok) return true
    } catch {}
    await sleep(200)
  }
  throw new Error(`Server failed to start within ${timeoutMs}ms`)
}

async function testHealthEndpoints() {
  console.log('\n[Integration 1: Health Endpoints]')
  const healthRes = await fetch(`${baseUrl}/api/health`)
  if (!healthRes.ok) throw new Error(`Health endpoint failed: ${healthRes.status}`)
  console.log('✓ GET /api/health returned 200 OK')

  const dbRes = await fetch(`${baseUrl}/api/health/database`)
  if (!dbRes.ok) throw new Error(`Database health failed: ${dbRes.status}`)
  const dbData = await dbRes.json()
  if (dbData.status !== 'healthy' || dbData.database !== 'connected') {
    throw new Error(`Unexpected db health data: ${JSON.stringify(dbData)}`)
  }
  console.log('✓ GET /api/health/database returned 200 OK (PostgreSQL connected)')
}

async function testUserRegistrationFlow() {
  console.log('\n[Integration 2: User Registration via API]')
  const uniqueEmail = `integration_${Date.now()}@example.com`
  const payload = {
    name: 'Dr. Jane Goodall',
    email: uniqueEmail,
    password: 'PrimateResearch2026!',
  }

  // 1. Submit Registration
  const res = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload),
  })

  if (res.status !== 201) {
    throw new Error(`Expected 201 Created, got ${res.status}: ${await res.text()}`)
  }

  const data = await res.json()
  console.log('✓ Registration returned HTTP 201 Created')
  console.log('✓ User ID assigned:', data.id)
  console.log('✓ User email confirmed:', data.email)

  if (data.password || data.password_hash) {
    throw new Error('SECURITY VIOLATION: Password hash leaked in response!')
  }
  console.log('✓ Verified: Sensitive credentials omitted from API response')

  // 2. Test Duplicate Email
  console.log('\n[Integration 3: Duplicate Email Rejection]')
  const dupRes = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload),
  })

  if (dupRes.status !== 409) {
    throw new Error(`Expected 409 Conflict, got ${dupRes.status}`)
  }
  const dupData = await dupRes.json()
  console.log('✓ Duplicate email rejected with HTTP 409 Conflict')
  console.log('✓ Detail message:', dupData.detail)

  return payload
}

async function testUserLoginFlow(registeredUser) {
  console.log('\n[Integration 4: User Login via API]')

  // 1. Successful Login
  const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      email: registeredUser.email,
      password: registeredUser.password,
    }),
  })

  if (loginRes.status !== 200) {
    throw new Error(`Expected 200 OK for login, got ${loginRes.status}: ${await loginRes.text()}`)
  }

  const loginData = await loginRes.json()
  console.log('✓ Login returned HTTP 200 OK')

  if (!loginData.access_token || typeof loginData.access_token !== 'string') {
    throw new Error('Missing or invalid access_token in login response')
  }
  if (loginData.token_type !== 'bearer') {
    throw new Error(`Expected token_type 'bearer', got '${loginData.token_type}'`)
  }
  const tokenParts = loginData.access_token.split('.')
  if (tokenParts.length !== 3) {
    throw new Error('Access token is not a valid 3-part JWT')
  }
  console.log('✓ Received valid JWT access token (HS256 3-part structure)')

  if (!loginData.user || loginData.user.email !== registeredUser.email) {
    throw new Error(`User in login response mismatch: ${JSON.stringify(loginData.user)}`)
  }
  console.log('✓ User identity in response matches:', loginData.user.name, `(${loginData.user.email})`)

  if (loginData.user.password || loginData.user.password_hash) {
    throw new Error('SECURITY VIOLATION: Password hash exposed in login response user object!')
  }
  console.log('✓ Verified: Sensitive credentials omitted from login response')

  // 2. Failed Login - Wrong Password
  console.log('\n[Integration 5: Login with Wrong Password]')
  const wrongPassRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      email: registeredUser.email,
      password: 'IncorrectPassword999!',
    }),
  })

  if (wrongPassRes.status !== 401) {
    throw new Error(`Expected 401 Unauthorized for wrong password, got ${wrongPassRes.status}`)
  }
  const wrongPassData = await wrongPassRes.json()
  if (wrongPassData.detail !== 'Invalid email or password.') {
    throw new Error(`Unexpected error detail: ${wrongPassData.detail}`)
  }
  console.log('✓ Wrong password rejected with HTTP 401 Unauthorized')
  console.log('✓ Generic detail message verified:', wrongPassData.detail)

  // 3. Failed Login - Unknown Email
  console.log('\n[Integration 6: Login with Unknown Email]')
  const unknownEmailRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      email: `nonexistent_${Date.now()}@example.com`,
      password: 'SomePassword123!',
    }),
  })

  if (unknownEmailRes.status !== 401) {
    throw new Error(`Expected 401 Unauthorized for unknown email, got ${unknownEmailRes.status}`)
  }
  const unknownEmailData = await unknownEmailRes.json()
  if (unknownEmailData.detail !== 'Invalid email or password.') {
    throw new Error(`Unexpected error detail for unknown email: ${unknownEmailData.detail}`)
  }
  console.log('✓ Unknown email rejected with HTTP 401 Unauthorized')
  console.log('✓ Generic detail message matches wrong password (no user enumeration leak):', unknownEmailData.detail)

  return loginData
}

async function testAuthMeFlow(loginData) {
  console.log('\n[Integration 7: GET /api/auth/me Verification]')

  // 1. Valid Bearer Token
  const meRes = await fetch(`${baseUrl}/api/auth/me`, {
    headers: {
      Authorization: `Bearer ${loginData.access_token}`,
      Accept: 'application/json',
    },
  })

  if (meRes.status !== 200) {
    throw new Error(`Expected 200 OK for /api/auth/me, got ${meRes.status}: ${await meRes.text()}`)
  }

  const meData = await meRes.json()
  console.log('✓ GET /api/auth/me returned HTTP 200 OK')
  if (meData.id !== loginData.user.id || meData.email !== loginData.user.email) {
    throw new Error(`Mismatch in authenticated user details: ${JSON.stringify(meData)}`)
  }
  console.log('✓ Server-verified user identity matches:', meData.name, `(${meData.email})`)

  if (meData.password || meData.password_hash) {
    throw new Error('SECURITY VIOLATION: Password hash leaked in /api/auth/me!')
  }
  console.log('✓ Verified: Sensitive credentials omitted from /api/auth/me')

  // 2. Missing Token
  console.log('\n[Integration 8: GET /api/auth/me Without Token]')
  const unauthRes = await fetch(`${baseUrl}/api/auth/me`)
  if (unauthRes.status !== 401) {
    throw new Error(`Expected 401 Unauthorized, got ${unauthRes.status}`)
  }
  console.log('✓ Missing token rejected with HTTP 401 Unauthorized')

  // 3. Malformed Token
  console.log('\n[Integration 9: GET /api/auth/me With Malformed Token]')
  const malformedRes = await fetch(`${baseUrl}/api/auth/me`, {
    headers: { Authorization: 'Bearer totally-invalid-token' },
  })
  if (malformedRes.status !== 401) {
    throw new Error(`Expected 401 Unauthorized, got ${malformedRes.status}`)
  }
  console.log('✓ Malformed token rejected with HTTP 401 Unauthorized')
}

async function run() {
  console.log('========================================================')
  console.log('   ResearchSphere AI — Integration Test Suite          ')
  console.log('========================================================')

  let serverProc = null

  try {
    console.log('[Setup] Launching FastAPI backend process...')
    serverProc = startBackend()
    await waitForServer()

    await testHealthEndpoints()
    const registeredUser = await testUserRegistrationFlow()
    const loginData = await testUserLoginFlow(registeredUser)
    await testAuthMeFlow(loginData)

    console.log('\n========================================================')
    console.log('   ALL INTEGRATION TESTS PASSED SUCCESSFULLY!          ')
    console.log('========================================================')
  } finally {
    if (serverProc) {
      serverProc.kill('SIGKILL')
    }
  }
}

run()

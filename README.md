# ResearchSphere AI

An AI-powered scientific research platform designed to accelerate scientific discovery, paper analysis, and knowledge synthesis.

## Current Development Status

- **Module**: Module 1 — Core Application Shell & Workspace
- **Iteration**: 1.5 — User Profile & Logout
- **Status**: Implemented & Ready for Manual User Verification *(Awaiting User Freeze)*

In this final iteration of Module 1, the user profile and session termination workflows were implemented:
1. **Interactive Header User Menu**: Extended the top-right researcher avatar badge into an interactive dropdown menu displaying user identity, email, active session status, link to Profile & Settings, and a prominent Logout action.
2. **Researcher Profile & Account Screen (`/settings`)**: Enhanced the workspace settings area with a dedicated Profile & Account section rendering real, server-verified researcher information (name, email, unique account UUID, registration date, session type) alongside a direct Logout button.
3. **Client-Side Session Termination (Logout)**: Purges access tokens and user records from `localStorage` and resets authenticated React context state, immediately redirecting to `/login` and rendering protected routes inaccessible.
4. **Browser History & Back-Button Protection**: Pressing browser Back after logout cannot bypass protection; route guards instantly intercept and re-route to `/login`.
5. **Cross-Tab Logout Synchronization**: Listens for native browser `storage` events so logging out in one tab immediately logs out and secures all other open tabs.
6. **Stateless JWT Security Architecture**: Clarified stateless JWT architecture where client-side token disposal clears local access, preserving server simplicity prior to future token-revocation modules.

---

## Technology Stack (Iteration 1.5)

### Frontend
- **Framework**: React 19 with TypeScript
- **Routing**: React Router v7 (`react-router-dom`) with route guards (`ProtectedRoute`, `PublicOnlyRoute`)
- **Icons**: Lucide React (`lucide-react`)
- **Build Tool**: Vite
- **Styling**: Tailwind CSS v4
- **State & Auth**: React Context API (`AuthContext`) with server-verified session persistence & cross-tab sync

### Backend
- **Framework**: FastAPI
- **Security & Tokens**: `PyJWT` (`pyjwt`), `bcrypt` password hashing, `HTTPBearer`
- **Data Validation & Schemas**: Pydantic v2 with `email-validator`
- **ORM**: SQLAlchemy 2.x (`2.1.9`)
- **Database Driver**: `psycopg2-binary` (`2.9.13`)
- **Migrations**: Alembic (`1.20.1`)
- **ASGI Server**: Uvicorn
- **Testing**: pytest, HTTPX

---

## Running the Application

### 1. Start Backend API (FastAPI)

```bash
cd backend
.\.venv\Scripts\activate   # Linux/macOS: source .venv/bin/activate
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

- **API Base**: [http://127.0.0.1:8000](http://127.0.0.1:8000)
- **API Swagger Documentation**: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)
- **Session Verification**: `GET http://127.0.0.1:8000/api/auth/me`
- **Login Endpoint**: `POST http://127.0.0.1:8000/api/auth/login`
- **Registration Endpoint**: `POST http://127.0.0.1:8000/api/auth/register`

### 2. Start Frontend Client (Vite + React)

```bash
cd frontend
npm run dev
```

- **Workspace Dashboard**: [http://localhost:5173/](http://localhost:5173/)
- **Profile & Settings**: [http://localhost:5173/settings](http://localhost:5173/settings)
- **Login Page**: [http://localhost:5173/login](http://localhost:5173/login)
- **Registration Page**: [http://localhost:5173/register](http://localhost:5173/register)

---

## Manual Visual Test Instructions for User

You can personally test the Iteration 1.5 features in your browser:

### Test A — Header Account Menu
1. Log in at **[http://localhost:5173/login](http://localhost:5173/login)**.
2. In the top-right header, click the **Researcher Badge** (your initials and name).
3. **Observe**: A clean dropdown menu opens displaying your researcher identity, email, active session badge, "Profile & Settings" link, and a "Sign Out" button.

### Test B — View Real Profile Information
1. In the dropdown, click **Profile & Settings** (or navigate to `/settings`).
2. **Observe**: The page visibly displays your real account data:
   - Full Name
   - Email Address
   - Researcher UUID
   - Account Creation Date
   - Live Session Status

### Test C — Logout Action
1. Click **Sign Out / Logout** (either from the header dropdown or the Profile card).
2. **Observe**: You are immediately redirected to **[http://localhost:5173/login](http://localhost:5173/login)**.
3. The top header no longer displays the researcher badge, showing "Sign In" and "Register" instead.

### Test D — Protected Route Inaccessible After Logout
1. While logged out, try opening **[http://localhost:5173/knowledge-graph](http://localhost:5173/knowledge-graph)** directly in the URL bar.
2. **Observe**: You are immediately intercepted and redirected back to `/login`.

### Test E — Browser Back Button Protection
1. On the `/login` screen after logging out, click the browser **Back** button.
2. **Observe**: The route guard prevents access to the cached protected route and immediately keeps you on `/login`.

### Test F — Page Refresh After Logout
1. Press **F5 (Reload Page)** on `/login`.
2. **Observe**: You remain logged out. No session is restored.

---

## Automated Verification

### Frontend Production Build:
```bash
cd frontend
npm run build
```

### Backend Automated Pytest Suite (23 Tests):
```bash
cd backend
pytest -v
```

### Real PostgreSQL Integration Tests (9 Tests):
```bash
node frontend/tests/integration.test.mjs
```

### Visual E2E Protected Route Tests (6 Tests):
```bash
node frontend/tests/visual_verify_protected_routes.mjs
```

### Visual E2E Logout & Profile Tests (7 Tests):
```bash
node frontend/tests/visual_verify_logout.mjs
```

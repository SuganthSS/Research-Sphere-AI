import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { ProtectedRoute } from './components/auth/ProtectedRoute'
import { PublicOnlyRoute } from './components/auth/PublicOnlyRoute'
import { AppLayout } from './components/layout/AppLayout'
import { DashboardPage } from './pages/DashboardPage'
import { ProjectsPage } from './pages/ProjectsPage'
import { ProjectWorkspacePage } from './pages/ProjectWorkspacePage'
import { PapersPage } from './pages/PapersPage'
import { PaperDetailPage } from './pages/PaperDetailPage'
import { AssistantPage } from './pages/AssistantPage'
import { ComparePage } from './pages/ComparePage'
import { KnowledgeGraphPage } from './pages/KnowledgeGraphPage'
import { ResearchGapsPage } from './pages/ResearchGapsPage'
import { SettingsPage } from './pages/SettingsPage'
import { SystemStatusPage } from './pages/SystemStatusPage'
import { RegisterPage } from './pages/RegisterPage'
import { LoginPage } from './pages/LoginPage'

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public authentication routes (redirected to / if already authenticated) */}
          <Route element={<PublicOnlyRoute />}>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
          </Route>

          {/* Protected research workspace routes (redirected to /login if unauthenticated) */}
          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<AppLayout />}>
              <Route index element={<DashboardPage />} />
              <Route path="projects" element={<ProjectsPage />} />
              <Route path="projects/:projectId" element={<ProjectWorkspacePage />} />
              <Route path="papers" element={<PapersPage />} />
              <Route path="papers/:paperId" element={<PaperDetailPage />} />
              <Route path="assistant" element={<AssistantPage />} />
              <Route path="compare" element={<ComparePage />} />
              <Route path="knowledge-graph" element={<KnowledgeGraphPage />} />
              <Route path="research-gaps" element={<ResearchGapsPage />} />
              <Route path="system-status" element={<SystemStatusPage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App

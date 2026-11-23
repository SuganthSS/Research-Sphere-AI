import React from 'react'
import { Navigate, useLocation, Outlet } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { Loader2 } from 'lucide-react'

interface ProtectedRouteProps {
  children?: React.ReactNode
}

/**
 * Route guard that requires authenticated researcher session.
 *
 * - While session is verifying via GET /api/auth/me: displays an elegant loading screen.
 * - When unauthenticated: redirects to /login with original location stored in state.
 * - When authenticated: renders requested child or <Outlet />.
 */
export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth()
  const location = useLocation()

  if (isLoading) {
    return (
      <div
        data-testid="auth-verifying-loader"
        className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 space-y-4 text-slate-100 selection:bg-indigo-500 selection:text-white"
      >
        <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-indigo-500 to-cyan-400 flex items-center justify-center shadow-lg shadow-indigo-500/20 animate-pulse">
          <span className="font-bold text-white text-xl">R</span>
        </div>
        <div className="flex items-center space-x-2.5 text-xs text-slate-400 font-medium">
          <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
          <span>Verifying researcher session...</span>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  return children ? <>{children}</> : <Outlet />
}

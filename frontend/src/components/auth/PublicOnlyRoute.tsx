import React from 'react'
import { Outlet } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { Loader2 } from 'lucide-react'

interface PublicOnlyRouteProps {
  children?: React.ReactNode
}

/**
 * Route wrapper for public auth pages (/login, /register).
 *
 * - While session is verifying via GET /api/auth/me: displays an unobtrusive loading screen.
 * - Delegates authenticated redirection to auth pages so in-flow success cards can animate cleanly.
 */
export const PublicOnlyRoute: React.FC<PublicOnlyRouteProps> = ({ children }) => {
  const { isLoading } = useAuth()

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

  return children ? <>{children}</> : <Outlet />
}

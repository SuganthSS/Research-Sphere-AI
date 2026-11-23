import React, { useState, useEffect } from 'react'
import { Link, useLocation, useNavigate, Navigate } from 'react-router-dom'
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Shield,
  FileCheck,
  Share2,
  RefreshCw,
} from 'lucide-react'
import { loginUser, ApiError } from '../services/api'
import { useAuth } from '../context/AuthContext'
import { getSafeRedirectPath } from '../utils/navigation'
import type { UserResponse } from '../types'

export const LoginPage: React.FC = () => {
  const { isAuthenticated, login } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  // Safely extract and validate intended destination
  const fromLocation = (location.state as { from?: { pathname?: string; search?: string } })?.from
  const destination = getSafeRedirectPath(fromLocation?.pathname)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(true)

  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [apiError, setApiError] = useState<string | null>(null)
  const [loginSuccessUser, setLoginSuccessUser] = useState<UserResponse | null>(null)

  // Auto-navigate to intended destination after brief success display
  useEffect(() => {
    if (loginSuccessUser) {
      const timer = setTimeout(() => {
        navigate(destination, { replace: true })
      }, 1000)
      return () => clearTimeout(timer)
    }
  }, [loginSuccessUser, navigate, destination])

  // If already authenticated and not actively displaying successful login, redirect to Dashboard
  if (isAuthenticated && !loginSuccessUser) {
    return <Navigate to="/" replace />
  }

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {}

    const trimmedEmail = email.trim()
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!trimmedEmail) {
      errors.email = 'Email address is required.'
    } else if (!emailRegex.test(trimmedEmail)) {
      errors.email = 'Please enter a valid email address.'
    }

    if (!password) {
      errors.password = 'Password is required.'
    }

    setValidationErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setApiError(null)

    if (!validateForm()) {
      return
    }

    setIsSubmitting(true)

    try {
      const data = await loginUser({
        email: email.trim().toLowerCase(),
        password,
      })
      // Update global auth context and local storage persistence
      login(data.access_token, data.user)
      setLoginSuccessUser(data.user)
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setApiError(err.message)
      } else {
        setApiError('Unable to sign in. Check your credentials and try again.')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-[#F8FAFC] text-[#0F172A] antialiased selection:bg-[#2563EB] selection:text-white">
      {/* LEFT PANEL: Scientific Brand & Conceptual Evidence Visualization (~45% on desktop) */}
      <div className="w-full lg:w-[45%] bg-[#0F172A] text-white flex flex-col justify-between p-8 sm:p-12 lg:p-16 relative overflow-hidden shrink-0 border-b lg:border-b-0 lg:border-r border-slate-800">
        {/* Subtle ambient scientific grid backdrop */}
        <div
          className="absolute inset-0 opacity-[0.035] pointer-events-none"
          style={{
            backgroundImage: 'radial-gradient(#94a3b8 1px, transparent 1px)',
            backgroundSize: '24px 24px',
          }}
        />

        {/* Top Branding: Logo Lockup */}
        <div className="relative z-10 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-[#2563EB] flex items-center justify-center text-white shadow-sm ring-1 ring-white/20 font-bold text-base">
              RS
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="font-semibold text-lg tracking-tight text-white">
                ResearchSphere
              </span>
              <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-400/30">
                AI
              </span>
            </div>
          </Link>
        </div>

        {/* Mid Content: Headline, Description & Conceptual Scientific Evidence Graph */}
        <div className="relative z-10 my-10 lg:my-auto max-w-lg">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-800/90 border border-slate-700 text-xs font-medium text-slate-300 mb-6">
            <span className="w-2 h-2 rounded-full bg-[#0D9488]" />
            <span>Scientific Discovery Workspace</span>
          </div>

          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-white leading-[1.2] mb-4">
            Research with clarity.
          </h1>
          <p className="text-slate-300 text-sm sm:text-base leading-relaxed mb-8">
            Your unified workspace for scientific papers, research insights, and evidence-grounded AI.
          </p>

          {/* Compact Conceptual Scientific Visualization Card */}
          <div className="rounded-xl bg-slate-800/70 border border-slate-700/80 p-5 backdrop-blur-sm shadow-xl relative overflow-hidden">
            <div className="flex items-center justify-between pb-3.5 mb-4 border-b border-slate-700/60 text-xs">
              <div className="flex items-center gap-2 text-slate-300 font-medium">
                <Share2 className="w-4 h-4 text-[#0D9488]" />
                <span>Evidence Graph &amp; Literature Synthesis</span>
              </div>
              <span className="text-slate-400 font-mono text-[11px]">Peer-Reviewed Grounding</span>
            </div>

            {/* SVG Visualizing Connected Nodes & Evidence Paths */}
            <div className="relative h-44 w-full flex items-center justify-center">
              <svg
                className="w-full h-full"
                viewBox="0 0 420 180"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                {/* Background connection grid lines */}
                <line x1="80" y1="90" x2="210" y2="45" stroke="#334155" strokeWidth="1.5" strokeDasharray="3 3" />
                <line x1="80" y1="90" x2="210" y2="135" stroke="#334155" strokeWidth="1.5" strokeDasharray="3 3" />
                <line x1="210" y1="45" x2="340" y2="90" stroke="#2563EB" strokeWidth="1.5" strokeOpacity="0.8" />
                <line x1="210" y1="135" x2="340" y2="90" stroke="#0D9488" strokeWidth="1.5" strokeOpacity="0.8" />

                {/* Left Node: Primary Corpus Paper */}
                <g transform="translate(40, 66)">
                  <rect width="80" height="48" rx="8" fill="#1E293B" stroke="#475569" strokeWidth="1" />
                  <circle cx="16" cy="18" r="4" fill="#2563EB" />
                  <text x="26" y="21" fill="#F8FAFC" fontSize="10" fontWeight="600" fontFamily="Inter, sans-serif">
                    Source Study
                  </text>
                  <text x="14" y="36" fill="#94A3B8" fontSize="8.5" fontFamily="monospace">
                    DOI: 10.1038
                  </text>
                </g>

                {/* Central Upper Node: Verified Evidence Link */}
                <g transform="translate(170, 20)">
                  <rect width="90" height="48" rx="8" fill="#0F172A" stroke="#0D9488" strokeWidth="1.2" />
                  <circle cx="16" cy="18" r="4" fill="#0D9488" />
                  <text x="26" y="21" fill="#2DD4BF" fontSize="10" fontWeight="600" fontFamily="Inter, sans-serif">
                    Evidence Anchor
                  </text>
                  <text x="14" y="36" fill="#94A3B8" fontSize="8.5" fontFamily="monospace">
                    p &lt; 0.001 (n=140)
                  </text>
                </g>

                {/* Central Lower Node: Cross-Corpus Synthesizer */}
                <g transform="translate(170, 110)">
                  <rect width="90" height="48" rx="8" fill="#0F172A" stroke="#2563EB" strokeWidth="1.2" />
                  <circle cx="16" cy="18" r="4" fill="#3B82F6" />
                  <text x="26" y="21" fill="#93C5FD" fontSize="10" fontWeight="600" fontFamily="Inter, sans-serif">
                    Synthesis Link
                  </text>
                  <text x="14" y="36" fill="#94A3B8" fontSize="8.5" fontFamily="monospace">
                    34 Papers Indexed
                  </text>
                </g>

                {/* Right Node: Grounded Insight Target */}
                <g transform="translate(300, 66)" className="node-pulse">
                  <rect width="88" height="48" rx="8" fill="#1E293B" stroke="#38BDF8" strokeWidth="1.2" />
                  <circle cx="16" cy="18" r="4" fill="#0284C7" />
                  <text x="26" y="21" fill="#F8FAFC" fontSize="10" fontWeight="600" fontFamily="Inter, sans-serif">
                    Synthesized AI
                  </text>
                  <text x="14" y="36" fill="#7DD3FC" fontSize="8.5" fontFamily="monospace">
                    Validated Output
                  </text>
                </g>
              </svg>
            </div>

            {/* Evidence micro footer */}
            <div className="mt-2 pt-3 border-t border-slate-700/60 flex items-center justify-between text-[11px] text-slate-400">
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#0D9488]" />
                Deterministic citations &amp; verifiable anchors
              </span>
              <span className="font-mono text-slate-400">v2.4 Standard</span>
            </div>
          </div>

          {/* Key Value Props Badges */}
          <div className="mt-6 flex flex-wrap gap-2.5 text-xs text-slate-300">
            <div className="flex items-center gap-1.5 bg-slate-800/60 px-3 py-1.5 rounded-lg border border-slate-700/50">
              <Shield className="w-3.5 h-3.5 text-[#0D9488]" />
              <span>Strict Epistemic Grounding</span>
            </div>
            <div className="flex items-center gap-1.5 bg-slate-800/60 px-3 py-1.5 rounded-lg border border-slate-700/50">
              <FileCheck className="w-3.5 h-3.5 text-[#2563EB]" />
              <span>No AI Hallucinations</span>
            </div>
          </div>
        </div>

        {/* Bottom Panel Footer */}
        <div className="relative z-10 pt-6 mt-6 border-t border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between text-xs text-slate-400 gap-2">
          <p>© 2026 ResearchSphere AI. Multidisciplinary Research Standard.</p>
          <div className="flex items-center gap-3">
            <a href="#" className="hover:text-slate-200 transition-colors">Privacy</a>
            <span>·</span>
            <a href="#" className="hover:text-slate-200 transition-colors">Security</a>
            <span>·</span>
            <a href="#" className="hover:text-slate-200 transition-colors">Ethics Policy</a>
          </div>
        </div>
      </div>

      {/* RIGHT PANEL: Authentication Form (~55% on desktop) */}
      <main className="w-full lg:w-[55%] bg-[#F8FAFC] flex flex-col justify-between p-6 sm:p-12 lg:p-16 relative min-h-screen">
        {/* Top Utility Header */}
        <div className="flex items-center justify-between w-full max-w-[400px] mx-auto mb-6">
          <div className="flex lg:hidden items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-[#2563EB] flex items-center justify-center text-white text-xs font-bold">
              RS
            </div>
            <span className="font-semibold text-[#0F172A] text-sm">ResearchSphere</span>
          </div>

          <div className="hidden lg:block" />

          <div className="flex items-center gap-3 text-xs text-[#64748B]">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              Systems Normal
            </span>
            <span>·</span>
            <a href="#" className="hover:text-[#0F172A] transition-colors inline-flex items-center gap-1">
              <HelpCircle className="w-3.5 h-3.5" />
              Support
            </a>
          </div>
        </div>

        {/* Centered Authentication Form Box */}
        <div className="w-full max-w-[400px] mx-auto my-auto py-4">
          {/* Success State */}
          {loginSuccessUser ? (
            <div
              data-testid="login-success-card"
              className="rounded-xl border border-teal-200 bg-white p-6 sm:p-8 text-center space-y-5 shadow-sm"
            >
              <div className="w-12 h-12 rounded-full bg-teal-50 border border-teal-200 flex items-center justify-center mx-auto text-[#0D9488]">
                <CheckCircle2 className="w-6 h-6" />
              </div>

              <div className="space-y-1">
                <h2 className="text-xl font-bold text-[#0F172A] tracking-tight">
                  Login successful
                </h2>
                <p className="text-xs text-[#64748B]">
                  Welcome back to ResearchSphere AI. JWT credentials verified and active.
                </p>
              </div>

              {/* Authenticated researcher info */}
              <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-4 text-left space-y-2 text-xs">
                <div className="flex justify-between items-center pb-2 border-b border-[#E2E8F0]">
                  <span className="text-[#64748B]">Status:</span>
                  <span className="inline-flex items-center gap-1.5 text-[#0D9488] font-medium">
                    <span className="w-2 h-2 rounded-full bg-[#0D9488] animate-pulse" />
                    Authentication: Active
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#64748B]">Researcher:</span>
                  <span className="font-semibold text-[#0F172A]">{loginSuccessUser.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#64748B]">Email:</span>
                  <span className="font-mono text-[#2563EB]">{loginSuccessUser.email}</span>
                </div>
              </div>

              <div className="pt-2">
                <Link
                  to={destination}
                  className="inline-flex items-center justify-center w-full h-10 px-4 rounded-lg bg-[#2563EB] hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition-colors"
                >
                  Proceed to Workspace Dashboard
                </Link>
              </div>

              <div className="text-[11px] text-[#64748B]">
                Redirecting to <span className="font-mono font-medium text-[#0F172A]">{destination}</span>...
              </div>
            </div>
          ) : (
            <div>
              {/* Form Header */}
              <div className="mb-6">
                <h2 className="text-2xl font-semibold tracking-tight text-[#0F172A]">
                  Welcome back
                </h2>
                <p className="text-sm text-[#64748B] mt-1 leading-relaxed">
                  Sign in to your research workspace.
                </p>
              </div>

              {/* Intended destination banner */}
              {fromLocation && (
                <div
                  data-testid="redirect-notice"
                  className="mb-5 p-3 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-800 flex items-start gap-2.5"
                >
                  <AlertCircle className="w-4 h-4 shrink-0 text-[#2563EB] mt-0.5" />
                  <div>
                    <span className="font-semibold">Authentication required:</span> Please sign in to access{' '}
                    <code className="font-mono bg-blue-100 px-1 py-0.5 rounded text-blue-900">
                      {fromLocation.pathname}
                    </code>
                    .
                  </div>
                </div>
              )}

              {/* Alert Error Box */}
              {apiError && (
                <div
                  role="alert"
                  className="mb-5 p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start gap-2.5"
                >
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
                  <div className="leading-relaxed">{apiError}</div>
                </div>
              )}

              {/* Social / Single Sign-On Primary Option: Continue with Google */}
              <button
                type="button"
                className="w-full h-11 px-4 rounded-lg border border-[#E2E8F0] bg-white text-[#0F172A] text-sm font-medium hover:bg-slate-50 transition-colors flex items-center justify-center gap-3 shadow-xs focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                </svg>
                <span>Continue with Google</span>
              </button>

              {/* Divider */}
              <div className="relative my-6 text-center">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-[#E2E8F0]" />
                </div>
                <div className="relative flex justify-center text-xs uppercase tracking-wider">
                  <span className="bg-[#F8FAFC] px-3 text-[#64748B] font-medium">
                    or sign in with email
                  </span>
                </div>
              </div>

              {/* Email & Password Form */}
              <form className="space-y-4" onSubmit={handleSubmit} noValidate>
                {/* Email Input */}
                <div>
                  <label htmlFor="email" className="block text-xs font-semibold text-[#0F172A] mb-1.5">
                    Work or Institutional Email
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#64748B]">
                      <Mail className="w-4 h-4" />
                    </div>
                    <input
                      id="email"
                      name="email"
                      type="email"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value)
                        if (validationErrors.email) {
                          setValidationErrors((prev) => ({ ...prev, email: '' }))
                        }
                      }}
                      placeholder="name@institution.edu"
                      className={`w-full h-11 pl-10 pr-3.5 rounded-lg border bg-white text-sm text-[#0F172A] placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#2563EB] transition-colors shadow-xs ${
                        validationErrors.email
                          ? 'border-rose-500 focus:border-rose-500'
                          : 'border-[#E2E8F0] focus:border-[#2563EB]'
                      }`}
                    />
                  </div>
                  {validationErrors.email && (
                    <p className="text-xs text-rose-500 text-rose-400 mt-1.5 flex items-center gap-1 font-medium">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>{validationErrors.email}</span>
                    </p>
                  )}
                </div>

                {/* Password Input */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label htmlFor="password" className="block text-xs font-semibold text-[#0F172A]">
                      Password
                    </label>
                    <a
                      href="#"
                      className="text-xs font-medium text-[#2563EB] hover:text-blue-700 hover:underline transition-colors"
                    >
                      Forgot password?
                    </a>
                  </div>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#64748B]">
                      <Lock className="w-4 h-4" />
                    </div>
                    <input
                      id="password"
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value)
                        if (validationErrors.password) {
                          setValidationErrors((prev) => ({ ...prev, password: '' }))
                        }
                      }}
                      placeholder="Enter your password"
                      className={`w-full h-11 pl-10 pr-10 rounded-lg border bg-white text-sm text-[#0F172A] placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#2563EB] transition-colors shadow-xs ${
                        validationErrors.password
                          ? 'border-rose-500 focus:border-rose-500'
                          : 'border-[#E2E8F0] focus:border-[#2563EB]'
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-[#64748B] hover:text-[#0F172A] transition-colors focus:outline-none"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                  {validationErrors.password && (
                    <p className="text-xs text-rose-500 text-rose-400 mt-1.5 flex items-center gap-1 font-medium">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>{validationErrors.password}</span>
                    </p>
                  )}
                </div>

                {/* Remember Me Checkbox */}
                <div className="flex items-center justify-between pt-1">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      id="rememberMe"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="w-4 h-4 rounded text-[#2563EB] border-[#E2E8F0] focus:ring-[#2563EB] cursor-pointer"
                    />
                    <span className="text-xs text-[#64748B] font-medium">
                      Remember on this device (30 days)
                    </span>
                  </label>
                </div>

                {/* Submit Button */}
                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full h-11 px-4 rounded-lg bg-[#2563EB] hover:bg-blue-700 text-white text-sm font-medium transition-colors flex items-center justify-center gap-2 shadow-xs focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
                  >
                    {isSubmitting ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin text-white" />
                        <span>Authenticating...</span>
                      </>
                    ) : (
                      <span>Sign in</span>
                    )}
                  </button>
                </div>
              </form>

              {/* Registration CTA */}
              <div className="mt-8 text-center text-xs text-[#64748B]">
                <span>New to ResearchSphere AI?</span>
                <Link
                  to="/register"
                  className="font-semibold text-[#2563EB] hover:text-blue-700 hover:underline ml-1 transition-colors"
                >
                  Create an account
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* Bottom Security / Privacy Footer */}
        <div className="w-full max-w-[400px] mx-auto pt-6 text-center text-[11px] text-slate-400 flex items-center justify-center gap-4">
          <a href="#" className="hover:text-[#0F172A] transition-colors">Privacy Policy</a>
          <span>·</span>
          <a href="#" className="hover:text-[#0F172A] transition-colors">Terms of Service</a>
        </div>
      </main>
    </div>
  )
}

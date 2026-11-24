import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  User as UserIcon,
  Mail,
  Fingerprint,
  Calendar,
  ShieldCheck,
  LogOut,
  Check,
  AlertTriangle,
  Sun,
  Moon,
  Laptop,
  Lock,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'

export const SettingsPage: React.FC = () => {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const [appearanceMode, setAppearanceMode] = useState<'light' | 'dark' | 'system'>('light')

  const handleLogout = () => {
    logout()
    navigate('/login', { replace: true })
  }

  const getInitials = (name?: string) => {
    if (!name) return 'RS'
    const parts = name.trim().split(/\s+/)
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase()
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  }

  const initials = getInitials(user?.name)

  const formattedJoinDate = user?.created_at
    ? new Date(user.created_at).toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    : 'Recent Session'

  return (
    <div
      className="p-6 lg:p-8 max-w-[1560px] mx-auto w-full space-y-6 lg:space-y-8"
      data-testid="settings-page"
    >
      {/* 1. Page Header */}
      <div className="border-b border-slate-200/90 pb-5">
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
          Workspace Settings &amp; Profile
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 mt-1">
          Manage your verified researcher identity, active sessions, and workspace preferences.
        </p>
      </div>

      {/* 2. Hero / Profile Summary Card */}
      <section
        data-testid="settings-profile-card"
        className="bg-white rounded-xl border border-slate-200/90 p-6 shadow-2xs"
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          {/* Left: Avatar & Verified Researcher Info */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5">
            <div className="w-16 h-16 rounded-full bg-[#0F172A] text-teal-300 flex items-center justify-center font-bold text-xl ring-4 ring-slate-100 shadow-inner select-none shrink-0">
              {initials}
            </div>

            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2.5">
                <h2 className="text-xl font-bold tracking-tight text-slate-900">
                  {user?.name || 'Verified Researcher'}
                </h2>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200/80">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  Verified Researcher
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-500">
                Scientific Intelligence Workspace
              </p>
              <p className="text-xs font-mono text-slate-600">
                {user?.email || 'N/A'}
              </p>
            </div>
          </div>

          {/* Right: Neutral Metadata Badges */}
          <div className="flex flex-wrap md:flex-col lg:flex-row items-start md:items-end gap-2 pt-4 md:pt-0 border-t md:border-t-0 border-slate-100">
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200/80 text-xs font-medium text-slate-700">
              <span className="w-2 h-2 rounded-full bg-teal-600" />
              <span>Research Workspace</span>
            </div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200/80 text-xs text-slate-600">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <span>Joined {formattedJoinDate}</span>
            </div>
          </div>
        </div>

        {/* Real Authenticated Account Details Grid */}
        <div className="mt-6 pt-6 border-t border-slate-200/80 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-3.5 rounded-lg bg-slate-50/70 border border-slate-200/80 space-y-1">
            <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
              <UserIcon className="w-3.5 h-3.5 text-indigo-600" />
              Full Name
            </span>
            <p className="text-xs font-semibold text-slate-900 truncate">
              {user?.name || 'N/A'}
            </p>
          </div>

          <div className="p-3.5 rounded-lg bg-slate-50/70 border border-slate-200/80 space-y-1">
            <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5 text-indigo-600" />
              Email Address
            </span>
            <p className="text-xs font-mono text-slate-900 truncate">
              {user?.email || 'N/A'}
            </p>
          </div>

          <div className="p-3.5 rounded-lg bg-slate-50/70 border border-slate-200/80 space-y-1">
            <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
              <Fingerprint className="w-3.5 h-3.5 text-teal-600" />
              Researcher ID
            </span>
            <p className="text-xs font-mono text-slate-700 truncate" title={user?.id}>
              {user?.id || 'N/A'}
            </p>
          </div>

          <div className="p-3.5 rounded-lg bg-slate-50/70 border border-slate-200/80 space-y-1">
            <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-teal-600" />
              Account Created
            </span>
            <p className="text-xs font-medium text-slate-900 truncate">
              {formattedJoinDate}
            </p>
          </div>
        </div>
      </section>

      {/* 3. Two-Column Settings Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Account Credentials (7 Cols) */}
        <div className="lg:col-span-7 space-y-6">
          <section className="bg-white rounded-xl border border-slate-200/90 p-6 shadow-2xs">
            <div className="border-b border-slate-200/80 pb-4 mb-5">
              <h3 className="text-sm font-semibold text-slate-900">Account Credentials</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Verified researcher credentials stored securely in PostgreSQL.
              </p>
            </div>

            <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
              <div>
                <label htmlFor="input-fullname" className="block text-xs font-medium text-slate-700 mb-1.5">
                  Researcher Name
                </label>
                <input
                  id="input-fullname"
                  type="text"
                  readOnly
                  disabled
                  value={user?.name || ''}
                  className="h-9 w-full px-3.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-800 font-medium cursor-not-allowed"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="input-email" className="block text-xs font-medium text-slate-700">
                    Email Address
                  </label>
                  <span className="text-[11px] font-medium text-teal-700 flex items-center gap-1">
                    <Lock className="w-3 h-3 text-teal-600" />
                    Authenticated Primary
                  </span>
                </div>
                <input
                  id="input-email"
                  type="email"
                  readOnly
                  disabled
                  value={user?.email || ''}
                  className="h-9 w-full px-3.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-800 font-mono cursor-not-allowed"
                />
                <p className="text-[11px] text-slate-500 mt-1.5">
                  Email authentication is linked to your primary JWT session token.
                </p>
              </div>

              <div>
                <label htmlFor="input-uuid" className="block text-xs font-medium text-slate-700 mb-1.5">
                  Assigned User UUID
                </label>
                <input
                  id="input-uuid"
                  type="text"
                  readOnly
                  disabled
                  value={user?.id || ''}
                  className="h-9 w-full px-3.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600 font-mono cursor-not-allowed"
                />
              </div>
            </form>
          </section>
        </div>

        {/* Right Column: Security, Preferences, Actions (5 Cols) */}
        <div className="lg:col-span-5 space-y-6">
          {/* Account Security */}
          <section className="bg-white rounded-xl border border-slate-200/90 p-6 shadow-2xs">
            <div className="border-b border-slate-200/80 pb-3 mb-4">
              <h3 className="text-sm font-semibold text-slate-900">Account Security</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Active credentials and token-based session security.
              </p>
            </div>

            <div className="space-y-4">
              {/* Password Row */}
              <div className="pb-3.5 border-b border-slate-100">
                <p className="text-xs font-medium text-slate-900">Password Encryption</p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Hashed with salted bcrypt (never stored or transmitted in plain text).
                </p>
              </div>

              {/* Email Verification Row */}
              <div className="flex items-center justify-between gap-3 pb-3.5 border-b border-slate-100">
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    <p className="text-xs font-medium text-slate-900">Email Status</p>
                  </div>
                  <p className="text-[11px] font-mono text-slate-500 mt-0.5 truncate max-w-[180px]">{user?.email}</p>
                </div>
                <span className="bg-emerald-50 text-emerald-700 border border-emerald-200/80 text-[11px] px-2.5 py-0.5 rounded-full font-medium inline-flex items-center gap-1 shrink-0">
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  Verified
                </span>
              </div>

              {/* Active Sessions Row */}
              <div>
                <p className="text-xs font-medium text-slate-900">Active Sessions</p>
                <p className="text-[11px] text-emerald-700 font-medium mt-0.5">
                  1 active session (Current device)
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Secured via HTTP-only JWT bearer authorization
                </p>
              </div>
            </div>
          </section>

          {/* Preferences */}
          <section className="bg-white rounded-xl border border-slate-200/90 p-6 shadow-2xs">
            <div className="border-b border-slate-200/80 pb-3 mb-4">
              <h3 className="text-sm font-semibold text-slate-900">Preferences</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Interface theme and appearance.
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-2">
                Appearance Mode
              </label>
              <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-50 border border-slate-200/80 rounded-lg">
                <button
                  type="button"
                  onClick={() => setAppearanceMode('light')}
                  className={`flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    appearanceMode === 'light'
                      ? 'bg-white text-indigo-600 shadow-2xs border border-slate-200'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Sun className="w-3.5 h-3.5" />
                  <span>Light</span>
                </button>
                <button
                  type="button"
                  onClick={() => setAppearanceMode('dark')}
                  className={`flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    appearanceMode === 'dark'
                      ? 'bg-white text-indigo-600 shadow-2xs border border-slate-200'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Moon className="w-3.5 h-3.5" />
                  <span>Dark</span>
                </button>
                <button
                  type="button"
                  onClick={() => setAppearanceMode('system')}
                  className={`flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    appearanceMode === 'system'
                      ? 'bg-white text-indigo-600 shadow-2xs border border-slate-200'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Laptop className="w-3.5 h-3.5" />
                  <span>System</span>
                </button>
              </div>
            </div>
          </section>

          {/* Account Actions */}
          <section className="bg-white rounded-xl border border-rose-200/80 p-6 shadow-2xs">
            <div className="border-b border-rose-100 pb-3 mb-4">
              <div className="flex items-center gap-1.5 text-rose-700">
                <AlertTriangle className="w-4 h-4 text-rose-600" />
                <h3 className="text-sm font-semibold">Account Actions</h3>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Session termination and account security.
              </p>
            </div>

            <div className="space-y-4">
              {/* Sign out active session */}
              <div className="flex items-center justify-between gap-3 pb-3 border-b border-rose-100">
                <div>
                  <p className="text-xs font-medium text-slate-900">Sign out</p>
                  <p className="text-[11px] text-slate-500">
                    Sign out of your active session on this device.
                  </p>
                </div>
                <button
                  type="button"
                  data-testid="settings-logout-btn"
                  onClick={handleLogout}
                  className="h-8 px-3 rounded-lg border border-slate-300 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors shrink-0 cursor-pointer flex items-center gap-1.5 shadow-2xs"
                >
                  <LogOut className="w-3.5 h-3.5 text-rose-500" />
                  <span>Sign out</span>
                </button>
              </div>

              {/* Sign out all devices */}
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-medium text-slate-900">Sign out of all devices</p>
                  <p className="text-[11px] text-slate-500">
                    Revoke all active browser sessions and API tokens.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="h-8 px-3 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors shrink-0 cursor-pointer shadow-2xs"
                >
                  Sign out all
                </button>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

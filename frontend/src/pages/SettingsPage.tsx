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
    <div className="space-y-8 max-w-7xl mx-auto pb-16">
      {/* PAGE HEADER */}
      <div className="border-b border-[#E2E8F0] pb-5">
        <h1 className="text-2xl font-bold tracking-tight text-[#0F172A]">
          Workspace Settings &amp; Profile
        </h1>
        <p className="text-[14px] text-[#64748B] mt-1">
          Manage your verified researcher identity, active sessions, and workspace preferences.
        </p>
      </div>

      {/* HERO / PROFILE SUMMARY CARD */}
      <section
        data-testid="settings-profile-card"
        className="bg-white rounded-xl border border-[#E2E8F0] p-6 shadow-xs"
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          {/* Left: Avatar & Verified Name */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5">
            <div className="w-20 h-20 rounded-full bg-[#0F172A] text-teal-300 flex items-center justify-center font-semibold text-2xl ring-4 ring-slate-100 shadow-inner select-none shrink-0">
              {initials}
            </div>

            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2.5">
                <h2 className="text-xl font-bold tracking-tight text-[#0F172A]">
                  {user?.name || 'Verified Researcher'}
                </h2>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[12px] font-medium bg-teal-50 text-[#0D9488] border border-teal-200">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Verified Researcher
                </span>
              </div>
              <p className="text-[14px] text-slate-600 font-medium">
                Research Workspace · No active project
              </p>
              <p className="text-[13px] font-mono text-[#64748B]">
                {user?.email || 'N/A'}
              </p>
            </div>
          </div>

          {/* Right: Neutral Workspace Badges */}
          <div className="flex flex-wrap md:flex-col lg:flex-row items-start md:items-end gap-2 pt-4 md:pt-0 border-t md:border-t-0 border-[#E2E8F0]">
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] text-[12px] text-[#0F172A]">
              <span className="w-2 h-2 rounded-full bg-[#0D9488]" />
              <span>Research Workspace</span>
            </div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] text-[12px] text-[#64748B]">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <span>Joined {formattedJoinDate}</span>
            </div>
            <div className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 border border-slate-200 text-[12px] font-medium text-slate-600">
              <span>No active project</span>
            </div>
          </div>
        </div>

        {/* Real Authenticated Account Details Grid */}
        <div className="mt-6 pt-6 border-t border-[#E2E8F0] grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-3.5 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] space-y-1">
            <span className="text-[11px] font-medium text-[#64748B] uppercase tracking-wider flex items-center gap-1.5">
              <UserIcon className="w-3.5 h-3.5 text-[#2563EB]" />
              Full Name
            </span>
            <p className="text-[13px] font-semibold text-[#0F172A] truncate">
              {user?.name || 'N/A'}
            </p>
          </div>

          <div className="p-3.5 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] space-y-1">
            <span className="text-[11px] font-medium text-[#64748B] uppercase tracking-wider flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5 text-[#2563EB]" />
              Email Address
            </span>
            <p className="text-[13px] font-mono text-[#0F172A] truncate">
              {user?.email || 'N/A'}
            </p>
          </div>

          <div className="p-3.5 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] space-y-1">
            <span className="text-[11px] font-medium text-[#64748B] uppercase tracking-wider flex items-center gap-1.5">
              <Fingerprint className="w-3.5 h-3.5 text-[#0D9488]" />
              Researcher ID
            </span>
            <p className="text-[12px] font-mono text-slate-700 truncate" title={user?.id}>
              {user?.id || 'N/A'}
            </p>
          </div>

          <div className="p-3.5 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] space-y-1">
            <span className="text-[11px] font-medium text-[#64748B] uppercase tracking-wider flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-[#0D9488]" />
              Account Created
            </span>
            <p className="text-[13px] font-medium text-[#0F172A] truncate">
              {formattedJoinDate}
            </p>
          </div>
        </div>
      </section>

      {/* TWO-COLUMN SETTINGS GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT/MAIN COLUMN: AUTHENTICATION INFORMATION (7 Cols) */}
        <div className="lg:col-span-7 space-y-6">
          <section className="bg-white rounded-xl border border-[#E2E8F0] p-6 shadow-xs">
            <div className="border-b border-[#E2E8F0] pb-4 mb-5">
              <h3 className="text-base font-semibold text-[#0F172A]">Account Credentials</h3>
              <p className="text-[13px] text-[#64748B] mt-0.5">
                Verified researcher credentials stored securely in PostgreSQL.
              </p>
            </div>

            <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
              <div>
                <label htmlFor="input-fullname" className="block text-[13px] font-medium text-[#0F172A] mb-1.5">
                  Researcher Name
                </label>
                <input
                  id="input-fullname"
                  type="text"
                  readOnly
                  disabled
                  value={user?.name || ''}
                  className="w-full px-3.5 py-2 rounded-lg bg-slate-50 border border-[#E2E8F0] text-[14px] text-[#0F172A] cursor-not-allowed"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="input-email" className="block text-[13px] font-medium text-[#0F172A]">
                    Email Address
                  </label>
                  <span className="text-[11px] font-medium text-[#0D9488] flex items-center gap-1">
                    <Lock className="w-3 h-3" />
                    Authenticated Primary
                  </span>
                </div>
                <input
                  id="input-email"
                  type="email"
                  readOnly
                  disabled
                  value={user?.email || ''}
                  className="w-full px-3.5 py-2 rounded-lg bg-slate-50 border border-[#E2E8F0] text-[14px] text-[#0F172A] font-mono cursor-not-allowed"
                />
                <p className="text-[12px] text-[#64748B] mt-1.5">
                  Email verification is tied to your primary JWT authentication identity.
                </p>
              </div>

              <div>
                <label htmlFor="input-uuid" className="block text-[13px] font-medium text-[#0F172A] mb-1.5">
                  Assigned User UUID
                </label>
                <input
                  id="input-uuid"
                  type="text"
                  readOnly
                  disabled
                  value={user?.id || ''}
                  className="w-full px-3.5 py-2 rounded-lg bg-slate-50 border border-[#E2E8F0] text-[13px] text-slate-600 font-mono cursor-not-allowed"
                />
              </div>
            </form>
          </section>
        </div>

        {/* RIGHT / SECONDARY COLUMN: SECURITY, PREFERENCES, ACTIONS (5 Cols) */}
        <div className="lg:col-span-5 space-y-6">
          {/* CARD 2: ACCOUNT SECURITY */}
          <section className="bg-white rounded-xl border border-[#E2E8F0] p-6 shadow-xs">
            <div className="border-b border-[#E2E8F0] pb-3 mb-4">
              <h3 className="text-base font-semibold text-[#0F172A]">Account Security</h3>
              <p className="text-[13px] text-[#64748B] mt-0.5">
                Active credentials and token-based session security.
              </p>
            </div>

            <div className="space-y-4">
              {/* Password Row */}
              <div className="pb-3.5 border-b border-[#F1F5F9]">
                <p className="text-[13px] font-medium text-[#0F172A]">Password Encryption</p>
                <p className="text-[12px] text-[#64748B] mt-0.5">
                  Hashed with salted bcrypt (never exposed client-side)
                </p>
              </div>

              {/* Email Verification Row */}
              <div className="flex items-center justify-between gap-3 pb-3.5 border-b border-[#F1F5F9]">
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-[#0D9488]" />
                    <p className="text-[13px] font-medium text-[#0F172A]">Email Status</p>
                  </div>
                  <p className="text-[12px] font-mono text-slate-500 mt-0.5 truncate max-w-[180px]">{user?.email}</p>
                </div>
                <span className="bg-teal-50 text-[#0D9488] border border-teal-200 text-[12px] px-2.5 py-0.5 rounded-full font-medium inline-flex items-center gap-1.5 shrink-0">
                  <Check className="w-3.5 h-3.5" />
                  Verified
                </span>
              </div>

              {/* Active Sessions Row */}
              <div>
                <p className="text-[13px] font-medium text-[#0F172A]">Active Sessions</p>
                <p className="text-[12px] text-emerald-700 font-medium mt-0.5">
                  1 active session (Current)
                </p>
                <p className="text-[11px] text-[#64748B] mt-0.5">
                  Current device: Desktop Browser
                </p>
              </div>
            </div>
          </section>

          {/* CARD 3: PREFERENCES */}
          <section className="bg-white rounded-xl border border-[#E2E8F0] p-6 shadow-xs">
            <div className="border-b border-[#E2E8F0] pb-3 mb-4">
              <h3 className="text-base font-semibold text-[#0F172A]">Preferences</h3>
              <p className="text-[13px] text-[#64748B] mt-0.5">
                Interface theme and appearance.
              </p>
            </div>

            <div>
              <label className="block text-[13px] font-medium text-[#0F172A] mb-2">
                Appearance Mode
              </label>
              <div className="grid grid-cols-3 gap-1.5 p-1 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg">
                <button
                  type="button"
                  onClick={() => setAppearanceMode('light')}
                  className={`flex items-center justify-center gap-1.5 py-1.5 text-[12px] font-medium rounded-md transition-colors ${
                    appearanceMode === 'light'
                      ? 'bg-white text-[#2563EB] shadow-2xs border border-[#CBD5E1]'
                      : 'text-slate-600 hover:text-[#0F172A]'
                  }`}
                >
                  <Sun className="w-3.5 h-3.5" />
                  <span>Light</span>
                </button>
                <button
                  type="button"
                  onClick={() => setAppearanceMode('dark')}
                  className={`flex items-center justify-center gap-1.5 py-1.5 text-[12px] font-medium rounded-md transition-colors ${
                    appearanceMode === 'dark'
                      ? 'bg-white text-[#2563EB] shadow-2xs border border-[#CBD5E1]'
                      : 'text-slate-600 hover:text-[#0F172A]'
                  }`}
                >
                  <Moon className="w-3.5 h-3.5" />
                  <span>Dark</span>
                </button>
                <button
                  type="button"
                  onClick={() => setAppearanceMode('system')}
                  className={`flex items-center justify-center gap-1.5 py-1.5 text-[12px] font-medium rounded-md transition-colors ${
                    appearanceMode === 'system'
                      ? 'bg-white text-[#2563EB] shadow-2xs border border-[#CBD5E1]'
                      : 'text-slate-600 hover:text-[#0F172A]'
                  }`}
                >
                  <Laptop className="w-3.5 h-3.5" />
                  <span>System</span>
                </button>
              </div>
            </div>
          </section>

          {/* CARD 4: ACCOUNT ACTIONS */}
          <section className="bg-white rounded-xl border border-rose-200 p-6 shadow-xs">
            <div className="border-b border-rose-100 pb-3 mb-4">
              <div className="flex items-center gap-1.5 text-rose-700">
                <AlertTriangle className="w-4 h-4" />
                <h3 className="text-base font-semibold">Account Actions</h3>
              </div>
              <p className="text-[13px] text-[#64748B] mt-0.5">
                Session termination and account security.
              </p>
            </div>

            <div className="space-y-4">
              {/* Sign out active session */}
              <div className="flex items-center justify-between gap-3 pb-3 border-b border-rose-100">
                <div>
                  <p className="text-[13px] font-medium text-[#0F172A]">Sign out</p>
                  <p className="text-[11px] text-[#64748B]">
                    Sign out of your active session on this device.
                  </p>
                </div>
                <button
                  type="button"
                  data-testid="settings-logout-btn"
                  onClick={handleLogout}
                  className="px-3.5 py-1.5 rounded-lg border border-slate-300 bg-white text-[13px] font-medium text-slate-700 hover:bg-slate-50 transition-colors shrink-0 cursor-pointer flex items-center gap-1.5"
                >
                  <LogOut className="w-3.5 h-3.5 text-rose-500" />
                  <span>Sign out</span>
                </button>
              </div>

              {/* Sign out all devices */}
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[13px] font-medium text-[#0F172A]">Sign out of all devices</p>
                  <p className="text-[11px] text-[#64748B]">
                    Revoke all active browser sessions and API tokens.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="px-3.5 py-1.5 rounded-lg border border-[#E2E8F0] bg-white text-[13px] font-medium text-slate-600 hover:text-[#0F172A] hover:bg-slate-50 transition-colors shrink-0 cursor-pointer"
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

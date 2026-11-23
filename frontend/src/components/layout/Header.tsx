import React, { useState, useRef, useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  Menu,
  Search,
  FlaskConical,
  Bell,
  ChevronRight,
  LogOut,
  Settings,
  Activity,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import type { HealthCheckStatus, DatabaseCheckStatus } from '../../types'

interface HeaderProps {
  onToggleMobileSidebar: () => void
  backendStatus: HealthCheckStatus
  dbStatus: DatabaseCheckStatus
  lastChecked: Date | null
  onRetry: () => void
}

const routeBreadcrumbs: Record<string, { group: string; page: string }> = {
  '/': { group: 'Workspace', page: 'Dashboard' },
  '/projects': { group: 'Workspace', page: 'Research Projects' },
  '/papers': { group: 'Workspace', page: 'Research Papers' },
  '/assistant': { group: 'Workspace', page: 'AI Assistant' },
  '/compare': { group: 'Research Intelligence', page: 'Compare Papers' },
  '/knowledge-graph': { group: 'Research Intelligence', page: 'Knowledge Graph' },
  '/research-gaps': { group: 'Research Intelligence', page: 'Research Gaps' },
  '/system-status': { group: 'System', page: 'System Status' },
  '/settings': { group: 'Settings', page: 'Workspace Settings' },
}

export const Header: React.FC<HeaderProps> = ({
  onToggleMobileSidebar,
  backendStatus,
  dbStatus,
  onRetry,
}) => {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, logout } = useAuth()

  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Close dropdown on outside click or Escape
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false)
      }
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsDropdownOpen(false)
      }
    }

    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('keydown', handleKeyDown)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isDropdownOpen])

  const handleLogout = () => {
    setIsDropdownOpen(false)
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
  const currentBreadcrumb = routeBreadcrumbs[location.pathname] || {
    group: 'Workspace',
    page: 'ResearchSphere',
  }

  return (
    <header className="h-16 bg-white border-b border-[#E2E8F0] z-30 flex items-center justify-between px-4 sm:px-8 shadow-[0_1px_2px_rgba(0,0,0,0.03)] sticky top-0">
      {/* Left Area: Mobile Menu Toggle & Breadcrumbs */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onToggleMobileSidebar}
          className="lg:hidden p-2 rounded-lg text-[#64748B] hover:text-[#0F172A] hover:bg-slate-100 transition-colors"
          aria-label="Toggle navigation menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Stitch Breadcrumb Navigation */}
        <div className="flex items-center gap-1.5 sm:gap-2 text-[13px] text-[#64748B]">
          <span>{currentBreadcrumb.group}</span>
          <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
          <h1 className="text-[#0F172A] font-semibold text-[13px] inline m-0 p-0 leading-none">{currentBreadcrumb.page}</h1>
        </div>
      </div>

      {/* Center Global Search (Hidden on small mobile) */}
      <div className="flex-1 max-w-md mx-4 sm:mx-8 hidden md:block">
        <div className="relative flex items-center w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none" />
          <input
            type="text"
            placeholder="Search papers, methods, datasets..."
            className="w-full pl-9 pr-14 py-1.5 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] text-[#0F172A] placeholder:text-[#64748B] text-[13px] focus:outline-none focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB] transition-all"
          />
          <kbd className="absolute right-2.5 px-1.5 py-0.5 rounded bg-white border border-[#E2E8F0] text-[11px] font-medium text-[#64748B] pointer-events-none">
            ⌘K
          </kbd>
        </div>
      </div>

      {/* Right Top Actions */}
      <div className="flex items-center gap-2 sm:gap-4">
        {/* Neutral Research Workspace Context Pill */}
        <div className="hidden xl:flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[#E2E8F0] bg-white hover:bg-slate-50 transition-colors cursor-pointer text-left">
          <FlaskConical className="w-4 h-4 text-[#0D9488]" />
          <div className="flex flex-col">
            <span className="text-[12px] font-medium text-[#0F172A] leading-tight">
              Research Workspace
            </span>
            <span className="text-[11px] text-[#64748B] leading-none">No active project</span>
          </div>
        </div>

        {/* Infrastructure Health Status Pill (Live Backend + Real PostgreSQL) */}
        <Link
          to="/system-status"
          className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-[#E2E8F0] bg-white hover:bg-slate-50 text-[12px] transition-colors"
          title="Open System Diagnostics"
        >
          <div className="flex items-center gap-1.5 pr-2 border-r border-[#E2E8F0]">
            <span
              className={`w-2 h-2 rounded-full ${
                backendStatus === 'connected'
                  ? 'bg-[#0D9488]'
                  : backendStatus === 'loading'
                  ? 'bg-amber-400 animate-ping'
                  : 'bg-rose-500'
              }`}
            />
            <span className="font-mono text-[11px] text-[#64748B]">API</span>
          </div>

          <div className="flex items-center gap-1.5">
            <span
              className={`w-2 h-2 rounded-full ${
                dbStatus === 'connected'
                  ? 'bg-[#0D9488]'
                  : dbStatus === 'loading'
                  ? 'bg-amber-400 animate-ping'
                  : 'bg-rose-500'
              }`}
            />
            <span className="font-mono text-[11px] text-[#64748B]">DB</span>
          </div>
        </Link>

        {/* Quick Refresh Status Button */}
        <button
          type="button"
          onClick={onRetry}
          title="Re-check infrastructure status"
          className="p-2 rounded-lg text-[#64748B] hover:text-[#0F172A] hover:bg-slate-100 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
        </button>

        {/* Notification Bell */}
        <button
          type="button"
          className="relative p-2 rounded-lg text-[#64748B] hover:text-[#0F172A] hover:bg-slate-100 transition-colors"
          title="Notifications"
        >
          <Bell className="w-4 h-4" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-amber-500" />
        </button>

        {/* Avatar Trigger & Account Dropdown Menu */}
        <div className="relative shrink-0 flex items-center gap-2" ref={dropdownRef}>
          <div
            title={`Logged in as ${user?.name || 'Researcher'} (${user?.email || 'N/A'})`}
            onClick={() => setIsDropdownOpen((prev) => !prev)}
            className="flex items-center gap-2 cursor-pointer"
          >
            <div className="hidden sm:flex flex-col text-right leading-tight">
              <span className="text-[12px] font-medium text-[#0F172A] max-w-[140px] truncate">
                {user?.name || 'Researcher'}
              </span>
              <span className="text-[10px] text-[#64748B] max-w-[140px] truncate">
                {user?.email || ''}
              </span>
            </div>

            <button
              type="button"
              data-testid="header-user-menu-trigger"
              className="relative flex items-center shrink-0 rounded-full focus:outline-none focus:ring-2 focus:ring-[#2563EB] cursor-pointer"
              aria-label="User account menu"
              aria-expanded={isDropdownOpen}
            >
              <div className="w-8 h-8 rounded-full bg-slate-800 text-teal-300 flex items-center justify-center font-medium text-xs ring-2 ring-white">
                {initials}
              </div>
              <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-[#0D9488] border-2 border-white" />
            </button>
          </div>

          {/* Interactive Stitch Dropdown Menu */}
          {isDropdownOpen && (
            <div
              data-testid="header-user-dropdown"
              className="absolute right-0 mt-2 w-72 rounded-xl bg-white border border-[#E2E8F0] shadow-xl py-2 z-50 animate-in fade-in zoom-in-95 duration-100"
            >
              {/* Account Identity Header */}
              <div className="px-4 py-3 border-b border-[#E2E8F0]">
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-[14px] font-semibold text-[#0F172A] truncate">
                    {user?.name || 'Dr. Elena Rostova'}
                  </p>
                  <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-teal-50 text-[#0D9488] border border-teal-200">
                    <CheckCircle2 className="w-2.5 h-2.5" />
                    Verified
                  </span>
                </div>
                <p className="text-[12px] font-mono text-[#64748B] truncate">
                  {user?.email || 'researcher@institution.edu'}
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Research Workspace
                </p>
              </div>

              {/* Navigation Options */}
              <div className="py-1">
                <Link
                  to="/settings"
                  data-testid="header-menu-settings"
                  onClick={() => setIsDropdownOpen(false)}
                  className="flex items-center gap-2.5 px-4 py-2 text-[13px] text-[#0F172A] hover:bg-slate-50 transition-colors"
                >
                  <Settings className="w-4 h-4 text-[#64748B]" />
                  <span>Profile &amp; Settings</span>
                </Link>

                <Link
                  to="/system-status"
                  onClick={() => setIsDropdownOpen(false)}
                  className="flex items-center gap-2.5 px-4 py-2 text-[13px] text-[#0F172A] hover:bg-slate-50 transition-colors"
                >
                  <Activity className="w-4 h-4 text-[#64748B]" />
                  <span>System Diagnostics</span>
                </Link>
              </div>

              {/* Sign Out Action */}
              <div className="pt-1 mt-1 border-t border-[#E2E8F0]">
                <button
                  type="button"
                  data-testid="header-menu-logout"
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2.5 px-4 py-2 text-[13px] text-rose-600 hover:bg-rose-50 transition-colors text-left font-medium"
                >
                  <LogOut className="w-4 h-4 text-rose-500" />
                  <span>Sign out</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}

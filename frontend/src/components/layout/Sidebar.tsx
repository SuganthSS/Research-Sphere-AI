import React from 'react'
import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  Folder,
  BookOpen,
  Bot,
  ArrowLeftRight,
  Network,
  Compass,
  TrendingUp,
  Users,
  Activity,
  Settings,
  X,
  ChevronsUpDown,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'

interface SidebarProps {
  isOpen: boolean
  onClose: () => void
}

interface NavItem {
  label: string
  path: string
  icon: React.ComponentType<{ className?: string }>
  indicator?: boolean
}

interface NavGroup {
  group: string
  items: NavItem[]
}

const navigationGroups: NavGroup[] = [
  {
    group: 'Workspace',
    items: [
      { label: 'Dashboard', path: '/', icon: LayoutDashboard },
      { label: 'Projects', path: '/projects', icon: Folder },
      { label: 'Paper Library', path: '/papers', icon: BookOpen },
      { label: 'AI Assistant', path: '/assistant', icon: Bot },
    ],
  },
  {
    group: 'Research Intelligence',
    items: [
      { label: 'Compare Papers', path: '/compare', icon: ArrowLeftRight },
      { label: 'Knowledge Graph', path: '/knowledge-graph', icon: Network },
      { label: 'Research Gaps', path: '/research-gaps', icon: Compass },
      { label: 'Recommendations', path: '/recommendations', icon: TrendingUp },
      { label: 'Researchers', path: '/researchers', icon: Users },
    ],
  },
  {
    group: 'System',
    items: [
      { label: 'System Status', path: '/system-status', icon: Activity, indicator: true },
      { label: 'Settings', path: '/settings', icon: Settings },
    ],
  },
]

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose }) => {
  const { user } = useAuth()

  // Generate initials from user name or fallback
  const getInitials = (name?: string) => {
    if (!name) return 'RS'
    const parts = name.trim().split(/\s+/)
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase()
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  }

  const initials = getInitials(user?.name)

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-xs z-40 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Fixed Left Sidebar (248px, Deep Navy #0F172A) */}
      <aside
        className={`fixed left-0 top-0 h-full w-[248px] bg-[#0F172A] text-slate-300 z-50 flex flex-col justify-between shadow-sm border-r border-slate-800 transition-transform duration-200 ease-in-out lg:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex flex-col flex-1 overflow-y-auto">
          {/* App Brand Logo Header */}
          <div className="h-16 px-4 flex items-center justify-between border-b border-slate-800/80">
            <NavLink to="/" className="flex items-center gap-2.5" onClick={onClose}>
              <div className="w-8 h-8 rounded-lg bg-[#2563EB] flex items-center justify-center text-white shadow-sm font-semibold text-base tracking-tight">
                RS
              </div>
              <span className="font-semibold text-[16px] text-white tracking-tight">
                ResearchSphere
              </span>
            </NavLink>

            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-medium px-1.5 py-0.5 rounded bg-slate-800 text-teal-400 border border-teal-500/20">
                v2.4
              </span>
              <button
                type="button"
                onClick={onClose}
                className="lg:hidden p-1 text-slate-400 hover:text-white rounded-md transition-colors"
                aria-label="Close sidebar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Navigation Hierarchy */}
          <nav className="flex-1 px-3 py-4 space-y-6">
            {navigationGroups.map((group) => (
              <div key={group.group} className="space-y-1">
                <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  {group.group}
                </p>
                {group.items.map((item) => {
                  const Icon = item.icon
                  return (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      onClick={onClose}
                      end={item.path === '/'}
                      className={({ isActive }) =>
                        `flex items-center justify-between px-3 py-2 rounded-lg text-[14px] transition-colors ${
                          isActive
                            ? 'bg-[#2563EB] text-white font-medium shadow-sm'
                            : 'text-slate-300 hover:bg-slate-800 hover:text-white font-normal'
                        }`
                      }
                    >
                      <div className="flex items-center gap-2.5">
                        <Icon className="w-[18px] h-[18px] shrink-0" />
                        <span>{item.label}</span>
                      </div>
                      {item.indicator && (
                        <span className="w-2 h-2 rounded-full bg-[#0D9488]" />
                      )}
                    </NavLink>
                  )
                })}
              </div>
            ))}
          </nav>
        </div>

        {/* User Profile Footer */}
        <div className="p-3 border-t border-slate-800 flex flex-col gap-2">
          <NavLink
            to="/settings"
            onClick={onClose}
            className="flex items-center justify-between p-2 rounded-xl bg-slate-800/60 border border-slate-700/50 hover:bg-slate-800 transition-colors cursor-pointer group"
          >
            <div className="flex items-center gap-2.5 overflow-hidden">
              <div className="w-8 h-8 rounded-full bg-slate-700 text-teal-300 flex items-center justify-center font-medium text-xs shrink-0 ring-1 ring-slate-600">
                {initials}
              </div>
              <div className="truncate">
                <p className="text-[13px] font-medium text-white truncate leading-tight group-hover:text-teal-200 transition-colors">
                  {user?.name || 'Dr. Elena Rostova'}
                </p>
                <p className="text-[11px] text-slate-400 truncate">
                  {user?.email || 'researcher@institution.edu'}
                </p>
              </div>
            </div>
            <ChevronsUpDown className="w-4 h-4 text-slate-400 shrink-0 group-hover:text-slate-200 transition-colors" />
          </NavLink>
        </div>
      </aside>
    </>
  )
}

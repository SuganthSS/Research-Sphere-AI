import React from 'react'
import { useOutletContext } from 'react-router-dom'
import { Activity, Server, Database, Globe, RefreshCw, CheckCircle2, XCircle } from 'lucide-react'
import { envConfig } from '../config/env'
import type { HealthCheckStatus, DatabaseCheckStatus, HealthResponse, DatabaseHealthResponse } from '../types'

interface OutletContextType {
  backendStatus: HealthCheckStatus
  backendData: HealthResponse | null
  backendError: string | null
  dbStatus: DatabaseCheckStatus
  dbData: DatabaseHealthResponse | null
  dbError: string | null
  lastChecked: Date | null
  retry: () => void
}

export const SystemStatusPage: React.FC = () => {
  const {
    backendStatus,
    backendData,
    backendError,
    dbStatus,
    dbError,
    lastChecked,
    retry,
  } = useOutletContext<OutletContextType>()

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-slate-800">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <Activity className="w-5 h-5 text-indigo-400" />
            System Status & Diagnostics
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Real-time infrastructure health and connectivity monitor (Module 0 Foundation).
          </p>
        </div>

        <button
          type="button"
          onClick={retry}
          className="inline-flex items-center space-x-2 px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition cursor-pointer shadow-sm shadow-indigo-600/30 self-start sm:self-auto"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Check Again</span>
        </button>
      </div>

      {/* Target configuration banner */}
      <div className="px-4 py-3 rounded-xl border border-slate-800 bg-slate-900/60 flex items-center justify-between text-xs">
        <span className="text-slate-400">Configured API Base Target:</span>
        <span className="font-mono text-indigo-300">{envConfig.apiBaseUrl}</span>
      </div>

      {/* Signals Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Signal 1: Frontend Client */}
        <div className="p-5 rounded-xl border border-slate-800 bg-slate-900/40 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Globe className="w-4 h-4 text-indigo-400" />
              <span className="text-xs font-semibold text-slate-200">Frontend Client</span>
            </div>
            <span className="inline-flex items-center gap-1 text-[11px] font-mono text-emerald-400 px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20">
              <CheckCircle2 className="w-3 h-3" />
              Operational
            </span>
          </div>

          <div className="text-xs space-y-1.5 text-slate-300">
            <div className="flex justify-between">
              <span className="text-slate-400">Framework:</span>
              <span className="font-mono text-slate-200">React 19 + Vite</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Styling:</span>
              <span className="font-mono text-slate-200">Tailwind CSS v4</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Routing:</span>
              <span className="font-mono text-slate-200">React Router v7</span>
            </div>
          </div>
        </div>

        {/* Signal 2: FastAPI Backend */}
        <div className="p-5 rounded-xl border border-slate-800 bg-slate-900/40 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Server className="w-4 h-4 text-indigo-400" />
              <span className="text-xs font-semibold text-slate-200">Backend API</span>
            </div>

            {backendStatus === 'connected' && (
              <span className="inline-flex items-center gap-1 text-[11px] font-mono text-emerald-400 px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20">
                <CheckCircle2 className="w-3 h-3" />
                200 OK
              </span>
            )}
            {backendStatus === 'loading' && (
              <span className="text-[11px] font-mono text-amber-400 px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20">
                Checking...
              </span>
            )}
            {backendStatus === 'unavailable' && (
              <span className="inline-flex items-center gap-1 text-[11px] font-mono text-rose-400 px-2 py-0.5 rounded bg-rose-500/10 border border-rose-500/20">
                <XCircle className="w-3 h-3" />
                Offline
              </span>
            )}
          </div>

          <div className="text-xs space-y-1.5 text-slate-300">
            <div className="flex justify-between">
              <span className="text-slate-400">Endpoint:</span>
              <span className="font-mono text-slate-200">GET /api/health</span>
            </div>
            {backendData && (
              <div className="flex justify-between">
                <span className="text-slate-400">Service:</span>
                <span className="font-mono text-slate-200">{backendData.service}</span>
              </div>
            )}
            {backendError && (
              <p className="text-[11px] text-rose-300/90 pt-1 leading-relaxed">
                {backendError}
              </p>
            )}
          </div>
        </div>

        {/* Signal 3: PostgreSQL Database */}
        <div className="p-5 rounded-xl border border-slate-800 bg-slate-900/40 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Database className="w-4 h-4 text-indigo-400" />
              <span className="text-xs font-semibold text-slate-200">PostgreSQL</span>
            </div>

            {dbStatus === 'connected' && (
              <span className="inline-flex items-center gap-1 text-[11px] font-mono text-emerald-400 px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20">
                <CheckCircle2 className="w-3 h-3" />
                Connected
              </span>
            )}
            {dbStatus === 'loading' && (
              <span className="text-[11px] font-mono text-amber-400 px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20">
                Checking...
              </span>
            )}
            {dbStatus === 'unavailable' && (
              <span className="inline-flex items-center gap-1 text-[11px] font-mono text-rose-400 px-2 py-0.5 rounded bg-rose-500/10 border border-rose-500/20">
                <XCircle className="w-3 h-3" />
                Unavailable
              </span>
            )}
            {dbStatus === 'unreachable' && (
              <span className="text-[11px] font-mono text-slate-400 px-2 py-0.5 rounded bg-slate-800 border border-slate-700">
                Unreachable
              </span>
            )}
          </div>

          <div className="text-xs space-y-1.5 text-slate-300">
            <div className="flex justify-between">
              <span className="text-slate-400">Check:</span>
              <span className="font-mono text-slate-200">SELECT 1</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Endpoint:</span>
              <span className="font-mono text-slate-200">/api/health/database</span>
            </div>
            {dbError && (
              <p className="text-[11px] text-rose-300/90 pt-1 leading-relaxed">
                {dbError}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Diagnostics details & timestamp */}
      <div className="p-4 rounded-xl border border-slate-800/80 bg-slate-900/30 text-xs text-slate-400 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <span>
          {lastChecked
            ? `Last Infrastructure Verification: ${lastChecked.toLocaleTimeString()}`
            : 'Verifying connectivity...'}
        </span>
        <span className="font-mono text-slate-400 text-[11px]">
          ResearchSphere AI · Core Runtime Integrity
        </span>
      </div>
    </div>
  )
}

import React from 'react'
import { useHealthCheck } from '../hooks/useHealthCheck'
import { envConfig } from '../config/env'

export const FoundationPage: React.FC = () => {
  const {
    backendStatus,
    backendData,
    backendError,
    dbStatus,
    dbData,
    dbError,
    lastChecked,
    retry,
  } = useHealthCheck()

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between selection:bg-indigo-500 selection:text-white">
      {/* Top Navigation Bar / Brand Header */}
      <header className="border-b border-slate-800/80 bg-slate-900/50 backdrop-blur px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-indigo-500 to-cyan-400 flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-500/25">
              R
            </div>
            <span className="text-lg font-semibold tracking-tight text-white">
              ResearchSphere AI
            </span>
          </div>
          <span className="text-xs font-mono px-3 py-1 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
            v0.3.0-foundation
          </span>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="max-w-3xl w-full text-center space-y-8">
          {/* Module / Iteration Badge */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-indigo-500/30 bg-indigo-500/10 text-indigo-300 text-xs font-medium tracking-wide">
            <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
            Module 0 · Iteration 0.3 — PostgreSQL Database Foundation
          </div>

          {/* Headings */}
          <div className="space-y-3">
            <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight bg-gradient-to-b from-white via-slate-100 to-slate-400 bg-clip-text text-transparent">
              ResearchSphere AI
            </h1>
            <p className="text-base sm:text-lg text-slate-300 max-w-xl mx-auto font-normal">
              AI-Powered Scientific Research Assistant
            </p>
          </div>

          {/* Infrastructure Foundation Card */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6 text-left max-w-xl mx-auto shadow-2xl backdrop-blur-sm space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Application Foundation Status
              </span>
              <span className="text-xs font-mono text-slate-500">
                {envConfig.apiBaseUrl}
              </span>
            </div>

            {/* Static Stack Overview */}
            <div className="space-y-2.5 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Frontend Client</span>
                <span className="font-mono text-xs text-indigo-300">React + TypeScript + Vite</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Styling System</span>
                <span className="font-mono text-xs text-indigo-300">Tailwind CSS</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Persistence Layer</span>
                <span className="font-mono text-xs text-indigo-300">SQLAlchemy 2.x + Alembic</span>
              </div>
            </div>

            {/* Live Infrastructure Signals */}
            <div className="space-y-3 pt-3 border-t border-slate-800/80">
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Live Infrastructure Health
              </div>

              {/* Signal 1: FastAPI Backend */}
              <div className="rounded-lg bg-slate-800/40 border border-slate-800 p-3.5 space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2.5">
                    {backendStatus === 'loading' && (
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping" />
                    )}
                    {backendStatus === 'connected' && (
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                    )}
                    {backendStatus === 'unavailable' && (
                      <span className="w-2.5 h-2.5 rounded-full bg-rose-400" />
                    )}
                    <span className="text-sm font-medium text-slate-200">Backend API</span>
                  </div>

                  {backendStatus === 'loading' && (
                    <span className="text-xs font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-300">
                      Checking...
                    </span>
                  )}
                  {backendStatus === 'connected' && (
                    <span className="text-xs font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                      Connected (200 OK)
                    </span>
                  )}
                  {backendStatus === 'unavailable' && (
                    <span className="text-xs font-mono px-2 py-0.5 rounded bg-rose-500/20 text-rose-300">
                      Unavailable
                    </span>
                  )}
                </div>

                {backendStatus === 'connected' && backendData && (
                  <p className="text-xs text-slate-400 pl-5">
                    {backendData.service} · GET /api/health
                  </p>
                )}
                {backendStatus === 'unavailable' && (
                  <p className="text-xs text-rose-300/80 pl-5">
                    {backendError || 'Unable to connect to FastAPI service.'}
                  </p>
                )}
              </div>

              {/* Signal 2: PostgreSQL Database */}
              <div className="rounded-lg bg-slate-800/40 border border-slate-800 p-3.5 space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2.5">
                    {dbStatus === 'loading' && (
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping" />
                    )}
                    {dbStatus === 'connected' && (
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                    )}
                    {dbStatus === 'unavailable' && (
                      <span className="w-2.5 h-2.5 rounded-full bg-rose-400" />
                    )}
                    {dbStatus === 'unreachable' && (
                      <span className="w-2.5 h-2.5 rounded-full bg-slate-500" />
                    )}
                    <span className="text-sm font-medium text-slate-200">PostgreSQL Database</span>
                  </div>

                  {dbStatus === 'loading' && (
                    <span className="text-xs font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-300">
                      Checking...
                    </span>
                  )}
                  {dbStatus === 'connected' && (
                    <span className="text-xs font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                      Connected (200 OK)
                    </span>
                  )}
                  {dbStatus === 'unavailable' && (
                    <span className="text-xs font-mono px-2 py-0.5 rounded bg-rose-500/20 text-rose-300">
                      Unavailable (503)
                    </span>
                  )}
                  {dbStatus === 'unreachable' && (
                    <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-700 text-slate-400">
                      Unreachable
                    </span>
                  )}
                </div>

                {dbStatus === 'connected' && dbData && (
                  <p className="text-xs text-slate-400 pl-5">
                    Verified via SQLAlchemy SELECT 1 · GET /api/health/database
                  </p>
                )}
                {dbStatus === 'unavailable' && (
                  <p className="text-xs text-rose-300/80 pl-5">
                    {dbError || 'PostgreSQL database connection failed.'}
                  </p>
                )}
                {dbStatus === 'unreachable' && (
                  <p className="text-xs text-slate-400 pl-5">
                    Database status cannot be checked while FastAPI is offline.
                  </p>
                )}
              </div>
            </div>

            {/* Footer action bar inside card */}
            <div className="pt-3 border-t border-slate-800 flex items-center justify-between text-xs">
              <span className="text-slate-400">
                {lastChecked ? `Last Checked: ${lastChecked.toLocaleTimeString()}` : 'Initializing...'}
              </span>
              <button
                type="button"
                onClick={() => retry()}
                className="px-3 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition cursor-pointer shadow-sm shadow-indigo-600/30"
              >
                Check Again
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 py-4 px-6 text-center text-xs text-slate-400">
        ResearchSphere AI · Iteration 0.3 · PostgreSQL Database Foundation
      </footer>
    </div>
  )
}

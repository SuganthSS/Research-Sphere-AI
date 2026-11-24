import React, { useState, useEffect, useCallback } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Activity, Server, Database, Globe, RefreshCw, CheckCircle2, XCircle, Sparkles, AlertCircle, Network } from 'lucide-react'
import { envConfig } from '../config/env'
import { getGroqHealth, getNeo4jStatus } from '../services/api'
import type { HealthCheckStatus, DatabaseCheckStatus, HealthResponse, DatabaseHealthResponse, GroqHealthResponse, Neo4jStatusResponse } from '../types'

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

  const [groqData, setGroqData] = useState<GroqHealthResponse | null>(null)
  const [groqStatus, setGroqStatus] = useState<'loading' | 'configured' | 'not_configured' | 'unavailable'>('loading')
  const [neo4jData, setNeo4jData] = useState<Neo4jStatusResponse | null>(null)
  const [neo4jStatus, setNeo4jStatus] = useState<'loading' | 'Connected' | 'Not configured' | 'Unavailable'>('loading')

  const checkGroqHealth = useCallback(async () => {
    setGroqStatus('loading')
    try {
      const data = await getGroqHealth()
      setGroqData(data)
      if (data.configured) {
        setGroqStatus('configured')
      } else {
        setGroqStatus('not_configured')
      }
    } catch {
      setGroqStatus('unavailable')
    }
  }, [])

  const checkNeo4jHealth = useCallback(async () => {
    setNeo4jStatus('loading')
    try {
      const data = await getNeo4jStatus()
      setNeo4jData(data)
      setNeo4jStatus(data.status as 'Connected' | 'Not configured' | 'Unavailable')
    } catch {
      setNeo4jStatus('Unavailable')
    }
  }, [])

  useEffect(() => {
    checkGroqHealth()
    checkNeo4jHealth()
  }, [checkGroqHealth, checkNeo4jHealth, lastChecked])

  const handleRefreshAll = () => {
    retry()
    checkGroqHealth()
    checkNeo4jHealth()
  }

  return (
    <div className="p-6 lg:p-8 max-w-[1560px] mx-auto w-full space-y-6 lg:space-y-8" data-testid="system-status-container">
      {/* Header */}
      <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shadow-2xs">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                System Status & Diagnostics
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 mt-1">
                Real-time infrastructure health and runtime connectivity monitor.
              </p>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={handleRefreshAll}
          className="inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-semibold shadow-2xs transition-colors cursor-pointer self-start sm:self-auto"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Check Again</span>
        </button>
      </div>

      {/* Target configuration banner */}
      <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
        <span className="font-semibold text-slate-700 flex items-center gap-2">
          <Globe className="w-4 h-4 text-slate-400" />
          <span>Configured API Base Target:</span>
        </span>
        <span className="font-mono text-blue-600 font-semibold bg-blue-50 px-2.5 py-1 rounded-md border border-blue-200/70 self-start sm:self-auto">
          {envConfig.apiBaseUrl}
        </span>
      </div>

      {/* Signals Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {/* Signal 1: Frontend Client */}
        <div className="bg-white p-5 rounded-xl border border-slate-200/90 shadow-2xs space-y-4 hover:border-slate-300 transition-colors">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center space-x-2">
              <div className="p-1.5 rounded-lg bg-blue-50 text-blue-600">
                <Globe className="w-4 h-4" />
              </div>
              <span className="text-xs font-bold text-slate-900">Frontend Client</span>
            </div>
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200/80">
              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
              Operational
            </span>
          </div>

          <div className="text-xs space-y-2 text-slate-600">
            <div className="flex justify-between items-center">
              <span className="text-slate-500">Framework:</span>
              <span className="font-medium text-slate-900">React 19 + Vite</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-500">Styling:</span>
              <span className="font-medium text-slate-900">Tailwind CSS v4</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-500">Routing:</span>
              <span className="font-medium text-slate-900">React Router v7</span>
            </div>
          </div>
        </div>

        {/* Signal 2: FastAPI Backend */}
        <div className="bg-white p-5 rounded-xl border border-slate-200/90 shadow-2xs space-y-4 hover:border-slate-300 transition-colors">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center space-x-2">
              <div className="p-1.5 rounded-lg bg-blue-50 text-blue-600">
                <Server className="w-4 h-4" />
              </div>
              <span className="text-xs font-bold text-slate-900">Backend API</span>
            </div>

            {backendStatus === 'connected' && (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200/80">
                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                200 OK
              </span>
            )}
            {backendStatus === 'loading' && (
              <span className="text-[11px] font-semibold text-amber-700 px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200/80">
                Checking...
              </span>
            )}
            {backendStatus === 'unavailable' && (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-700 px-2 py-0.5 rounded-full bg-rose-50 border border-rose-200/80">
                <XCircle className="w-3 h-3 text-rose-600" />
                Offline
              </span>
            )}
          </div>

          <div className="text-xs space-y-2 text-slate-600">
            <div className="flex justify-between items-center">
              <span className="text-slate-500">Endpoint:</span>
              <span className="font-mono text-slate-800 text-[11px]">/api/health</span>
            </div>
            {backendData && (
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Service:</span>
                <span className="font-medium text-slate-900">{backendData.service}</span>
              </div>
            )}
            {backendError && (
              <p className="text-[11px] text-rose-600 pt-1 leading-relaxed">
                {backendError}
              </p>
            )}
          </div>
        </div>

        {/* Signal 3: PostgreSQL Database */}
        <div className="bg-white p-5 rounded-xl border border-slate-200/90 shadow-2xs space-y-4 hover:border-slate-300 transition-colors">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center space-x-2">
              <div className="p-1.5 rounded-lg bg-teal-50 text-teal-600">
                <Database className="w-4 h-4" />
              </div>
              <span className="text-xs font-bold text-slate-900">PostgreSQL</span>
            </div>

            {dbStatus === 'connected' && (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200/80">
                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                Connected
              </span>
            )}
            {dbStatus === 'loading' && (
              <span className="text-[11px] font-semibold text-amber-700 px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200/80">
                Checking...
              </span>
            )}
            {dbStatus === 'unavailable' && (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-700 px-2 py-0.5 rounded-full bg-rose-50 border border-rose-200/80">
                <XCircle className="w-3 h-3 text-rose-600" />
                Unavailable
              </span>
            )}
            {dbStatus === 'unreachable' && (
              <span className="text-[11px] font-medium text-slate-600 px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200">
                Unreachable
              </span>
            )}
          </div>

          <div className="text-xs space-y-2 text-slate-600">
            <div className="flex justify-between items-center">
              <span className="text-slate-500">Check:</span>
              <span className="font-mono text-slate-800 text-[11px]">SELECT 1</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-500">Endpoint:</span>
              <span className="font-mono text-slate-800 text-[11px]">/api/health/database</span>
            </div>
            {dbError && (
              <p className="text-[11px] text-rose-600 pt-1 leading-relaxed">
                {dbError}
              </p>
            )}
          </div>
        </div>

        {/* Signal 4: Groq LLM Provider */}
        <div className="bg-white p-5 rounded-xl border border-slate-200/90 shadow-2xs space-y-4 hover:border-slate-300 transition-colors">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center space-x-2">
              <div className="p-1.5 rounded-lg bg-amber-50 text-amber-600">
                <Sparkles className="w-4 h-4" />
              </div>
              <span className="text-xs font-bold text-slate-900">Groq LLM</span>
            </div>

            {groqStatus === 'configured' && (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200/80">
                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                Configured
              </span>
            )}
            {groqStatus === 'loading' && (
              <span className="text-[11px] font-semibold text-amber-700 px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200/80">
                Checking...
              </span>
            )}
            {groqStatus === 'not_configured' && (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200/80">
                <AlertCircle className="w-3 h-3" />
                Not Configured
              </span>
            )}
            {groqStatus === 'unavailable' && (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-700 px-2 py-0.5 rounded-full bg-rose-50 border border-rose-200/80">
                <XCircle className="w-3 h-3 text-rose-600" />
                Unavailable
              </span>
            )}
          </div>

          <div className="text-xs space-y-2 text-slate-600">
            <div className="flex justify-between items-center">
              <span className="text-slate-500">Model:</span>
              <span className="font-mono text-slate-800 text-[11px] truncate max-w-[130px]" title={groqData?.model}>
                {groqData?.model || 'llama-3.3-70b-versatile'}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-500">Endpoint:</span>
              <span className="font-mono text-slate-800 text-[11px]">/api/health/groq</span>
            </div>
            {groqData?.message && (
              <p className="text-[11px] text-slate-500 pt-1 leading-relaxed truncate" title={groqData.message}>
                {groqData.message}
              </p>
            )}
          </div>
        </div>

        {/* Signal 5: Neo4j Graph Database */}
        <div className="bg-white p-5 rounded-xl border border-slate-200/90 shadow-2xs space-y-4 hover:border-slate-300 transition-colors">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center space-x-2">
              <div className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600">
                <Network className="w-4 h-4" />
              </div>
              <span className="text-xs font-bold text-slate-900">Neo4j Graph</span>
            </div>

            {neo4jStatus === 'Connected' && (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200/80">
                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                Connected
              </span>
            )}
            {neo4jStatus === 'loading' && (
              <span className="text-[11px] font-semibold text-amber-700 px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200/80">
                Checking...
              </span>
            )}
            {neo4jStatus === 'Not configured' && (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200/80">
                <AlertCircle className="w-3 h-3" />
                Not Configured
              </span>
            )}
            {neo4jStatus === 'Unavailable' && (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-700 px-2 py-0.5 rounded-full bg-rose-50 border border-rose-200/80">
                <XCircle className="w-3 h-3 text-rose-600" />
                Unavailable
              </span>
            )}
          </div>

          <div className="text-xs space-y-2 text-slate-600">
            <div className="flex justify-between items-center">
              <span className="text-slate-500">URI:</span>
              <span className="font-mono text-slate-800 text-[11px] truncate max-w-[130px]" title={neo4jData?.uri}>
                {neo4jData?.uri || 'bolt://localhost:7687'}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-500">Endpoint:</span>
              <span className="font-mono text-slate-800 text-[11px]">/api/graphs/status</span>
            </div>
            {neo4jData?.message && (
              <p className="text-[11px] text-slate-500 pt-1 leading-relaxed truncate" title={neo4jData.message}>
                {neo4jData.message}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Diagnostics details & timestamp */}
      <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs p-4 text-xs text-slate-500 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <span className="font-medium text-slate-700">
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

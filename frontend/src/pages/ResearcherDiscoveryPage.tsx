import React, { useState, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  Users,
  Folder,
  Loader2,
  Tag,
  Wrench,
  AlertCircle,
  ExternalLink,
  ShieldAlert,
  Sparkles,
  BookOpen,
  UserCheck,
  RefreshCw,
  X,
} from 'lucide-react'
import {
  getProjects,
  discoverResearchers,
  ApiError,
} from '../services/api'
import type {
  Project,
  ResearcherDiscoveryResponse,
  ResearcherProfile,
} from '../types'

export const ResearcherDiscoveryPage: React.FC = () => {
  const [searchParams] = useSearchParams()

  // State
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState<string>('')

  const [isLoadingProjects, setIsLoadingProjects] = useState<boolean>(true)
  const [isLoadingResearchers, setIsLoadingResearchers] = useState<boolean>(false)
  const [researchersError, setResearchersError] = useState<string | null>(null)
  const [discoveryData, setDiscoveryData] = useState<ResearcherDiscoveryResponse | null>(null)

  // Selected Researcher Profile Modal
  const [selectedProfile, setSelectedProfile] = useState<ResearcherProfile | null>(null)

  // 1. Load Projects on mount
  useEffect(() => {
    async function loadProjects() {
      setIsLoadingProjects(true)
      try {
        const data = await getProjects()
        setProjects(data.projects)

        const urlProjectId = searchParams.get('projectId')
        if (urlProjectId && data.projects.some((p) => p.id === urlProjectId)) {
          setSelectedProjectId(urlProjectId)
        }
      } catch (err: unknown) {
        console.error('Failed to load projects:', err)
      } finally {
        setIsLoadingProjects(false)
      }
    }
    loadProjects()
  }, [searchParams])

  // 2. Fetch Researchers when project filter changes
  const fetchResearchers = async () => {
    setIsLoadingResearchers(true)
    setResearchersError(null)

    try {
      const data = await discoverResearchers(selectedProjectId || null)
      setDiscoveryData(data)
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setResearchersError(err.message)
      } else {
        setResearchersError('Failed to discover researchers across corpus.')
      }
    } finally {
      setIsLoadingResearchers(false)
    }
  }

  useEffect(() => {
    fetchResearchers()
  }, [selectedProjectId])

  const getInitials = (name: string) => {
    const parts = name.trim().split(/\s+/)
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase()
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  }

  return (
    <div className="p-6 lg:p-8 max-w-[1560px] mx-auto w-full space-y-6 lg:space-y-8" data-testid="researcher-discovery-container">
      {/* ==================== PAGE HEADER ==================== */}
      <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs p-5 sm:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shadow-2xs">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                Researcher Discovery & Collaboration
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 mt-1">
                Identify authors in your ResearchSphere corpus and discover potential collaboration alignments.
              </p>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={fetchResearchers}
          disabled={isLoadingResearchers}
          data-testid="refresh-researchers-btn"
          className="inline-flex items-center gap-2 h-9 px-4 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs sm:text-sm font-semibold shadow-2xs transition cursor-pointer self-start md:self-auto shrink-0"
        >
          <RefreshCw className={`w-4 h-4 ${isLoadingResearchers ? 'animate-spin text-indigo-600' : ''}`} />
          <span>Refresh Discovery</span>
        </button>
      </div>

      {/* ==================== COLLABORATION CAUTION NOTICE ==================== */}
      <div
        data-testid="collaboration-caution-notice"
        className="p-4 rounded-xl border border-amber-200/80 bg-amber-50/70 text-amber-900 text-xs sm:text-sm flex items-start gap-3 shadow-2xs"
      >
        <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-bold text-amber-950 flex items-center gap-1.5">
            <span>Corpus-Scoped Collaboration Notice</span>
          </p>
          <p className="text-xs text-amber-800/90 leading-relaxed">
            Collaboration suggestions are inferred from publications available in your ResearchSphere corpus and do not indicate researcher availability or willingness to collaborate.
          </p>
        </div>
      </div>

      {/* ==================== PROJECT FILTER CARD ==================== */}
      <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <label className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5 shrink-0">
            <Folder className="w-3.5 h-3.5 text-blue-600" />
            <span>Filter by Project:</span>
          </label>
          <select
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            data-testid="researchers-project-select"
            disabled={isLoadingProjects || isLoadingResearchers}
            className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-xs sm:text-sm font-medium text-slate-900 focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15 disabled:bg-slate-50 cursor-pointer min-w-[220px]"
          >
            <option value="">All Projects in Corpus</option>
            {projects.map((proj) => (
              <option key={proj.id} value={proj.id}>
                {proj.name}
              </option>
            ))}
          </select>
        </div>

        {discoveryData && (
          <div className="text-xs text-slate-500 font-medium">
            <span>Discovered <strong className="text-slate-800">{discoveryData.total_researchers}</strong> authors in active corpus</span>
          </div>
        )}
      </div>

      {/* Error Banner */}
      {researchersError && (
        <div
          data-testid="researchers-error-banner"
          className="p-4 rounded-xl border border-rose-200 bg-rose-50 text-rose-800 text-xs sm:text-sm flex items-start gap-3"
        >
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold text-rose-900">Researcher Discovery Error</p>
            <p className="text-xs text-rose-700 leading-relaxed">{researchersError}</p>
          </div>
        </div>
      )}

      {/* ==================== LOADING STATE ==================== */}
      {isLoadingResearchers && (
        <div
          data-testid="researchers-loading-state"
          className="bg-white rounded-xl border border-indigo-100 shadow-xs p-10 text-center space-y-3"
        >
          <div className="w-10 h-10 rounded-full bg-indigo-50 border border-indigo-200 flex items-center justify-center mx-auto text-indigo-600 animate-pulse">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
          <p className="text-sm font-semibold text-[#0F172A]">
            Discovering authors and synthesizing collaboration suggestions...
          </p>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Extracting Author relationships from Neo4j subgraphs and mapping expertise across publications.
          </p>
        </div>
      )}

      {/* ==================== RESEARCHERS GRID ==================== */}
      {!isLoadingResearchers && discoveryData && (
        <div className="space-y-4" data-testid="researchers-results-container">
          {discoveryData.total_researchers === 0 ? (
            <div
              data-testid="researchers-empty-state"
              className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center max-w-lg mx-auto space-y-3"
            >
              <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-500">
                <Users className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold text-[#0F172A]">No Authors Discovered</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                {discoveryData.message ||
                  'No author nodes identified in your corpus yet. Ensure papers are indexed and generate knowledge graphs to discover researchers.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {discoveryData.researchers.map((res: ResearcherProfile, idx: number) => {
                const matchPct = Math.round(res.relevance_score * 100)
                return (
                  <div
                    key={res.author_id}
                    data-testid={`researcher-card-${idx}`}
                    className="bg-white rounded-xl border border-slate-200/90 shadow-2xs p-5 flex flex-col justify-between space-y-4 hover:border-slate-300 transition-all"
                  >
                    <div className="space-y-3.5">
                      {/* Researcher Header */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-blue-600 text-white font-bold text-sm flex items-center justify-center shadow-2xs shrink-0">
                            {getInitials(res.name)}
                          </div>
                          <div>
                            <h3 className="text-base font-bold text-slate-900 leading-tight">
                              {res.name}
                            </h3>
                            <span className="text-xs text-slate-500">
                              {res.papers_count} Publication{res.papers_count === 1 ? '' : 's'} in Corpus
                            </span>
                          </div>
                        </div>

                        {/* Match Label */}
                        <div
                          data-testid={`researcher-match-label-${idx}`}
                          className="px-2.5 py-0.5 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-[10px] font-bold font-mono shrink-0"
                        >
                          {res.match_label}
                        </div>
                      </div>

                      {/* Relevance Score Bar */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-slate-600">Domain Match:</span>
                          <span className="font-bold text-blue-600 font-mono">{matchPct}%</span>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                          <div
                            className="bg-blue-600 h-1.5 rounded-full"
                            style={{ width: `${matchPct}%` }}
                          />
                        </div>
                      </div>

                      {/* Collaboration Rationale */}
                      <div className="bg-slate-50/90 p-3 rounded-lg border border-slate-100 text-xs text-slate-700 leading-relaxed font-sans">
                        <span className="font-bold text-slate-900 block mb-1 flex items-center gap-1">
                          <Sparkles className="w-3 h-3 text-blue-600" />
                          <span>Collaboration Alignment:</span>
                        </span>
                        {res.collaboration_explanation}
                      </div>

                      {/* Topics & Methods Chips */}
                      <div className="space-y-2">
                        {res.topics.length > 0 && (
                          <div className="flex flex-wrap items-center gap-1">
                            <Tag className="w-3 h-3 text-blue-500 shrink-0" />
                            {res.topics.slice(0, 3).map((t, ti) => (
                              <span
                                key={ti}
                                className="px-2 py-0.5 rounded text-[11px] font-medium bg-blue-50 text-blue-800 border border-blue-200/80 truncate max-w-[160px]"
                              >
                                {t}
                              </span>
                            ))}
                          </div>
                        )}

                        {res.methods.length > 0 && (
                          <div className="flex flex-wrap items-center gap-1">
                            <Wrench className="w-3 h-3 text-teal-600 shrink-0" />
                            {res.methods.slice(0, 2).map((m, mi) => (
                              <span
                                key={mi}
                                className="px-2 py-0.5 rounded text-[11px] font-medium bg-teal-50 text-teal-800 border border-teal-200/80 truncate max-w-[160px]"
                              >
                                {m}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Card Footer: View Profile */}
                    <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => setSelectedProfile(res)}
                        data-testid={`view-researcher-profile-${idx}`}
                        className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-slate-100 hover:bg-blue-600 hover:text-white text-slate-700 text-xs font-semibold transition cursor-pointer"
                      >
                        <UserCheck className="w-3.5 h-3.5" />
                        <span>View Profile Details</span>
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ==================== RESEARCHER PROFILE MODAL ==================== */}
      {selectedProfile && (
        <div
          data-testid="researcher-modal"
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4"
          onClick={() => setSelectedProfile(null)}
        >
          <div
            className="bg-white rounded-2xl border border-slate-200/90 shadow-2xl max-w-xl w-full p-6 space-y-5 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-start justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-blue-600 text-white font-bold text-base flex items-center justify-center shadow-2xs">
                  {getInitials(selectedProfile.name)}
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900">{selectedProfile.name}</h2>
                  <span className="text-xs text-blue-600 font-semibold">{selectedProfile.match_label}</span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedProfile(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Collaboration Explanation */}
            <div className="bg-blue-50/60 p-4 rounded-xl border border-blue-100 text-xs text-slate-800 leading-relaxed">
              <span className="font-bold text-slate-900 block mb-1">Collaboration Alignment Rationale:</span>
              <p>{selectedProfile.collaboration_explanation}</p>
            </div>

            {/* Authored Papers in Corpus */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <BookOpen className="w-3.5 h-3.5 text-blue-600" />
                <span>Publications in Your Corpus ({selectedProfile.papers.length}):</span>
              </h4>
              <div className="space-y-1.5">
                {selectedProfile.papers.map((p) => (
                  <Link
                    key={p.paper_id}
                    to={`/papers/${p.paper_id}`}
                    className="p-2.5 rounded-lg border border-slate-200 hover:border-blue-400 bg-slate-50/50 hover:bg-blue-50/30 flex items-center justify-between text-xs transition"
                  >
                    <span className="font-semibold text-slate-800 truncate pr-2">{p.paper_title}</span>
                    <ExternalLink className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                  </Link>
                ))}
              </div>
            </div>

            {/* Topics & Methods */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <div className="space-y-1.5">
                <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">Research Topics</span>
                <div className="flex flex-wrap gap-1">
                  {selectedProfile.topics.map((t, idx) => (
                    <span key={idx} className="px-2 py-0.5 rounded bg-blue-50 text-blue-800 text-[11px] font-medium border border-blue-200">
                      {t}
                    </span>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">Methodologies</span>
                <div className="flex flex-wrap gap-1">
                  {selectedProfile.methods.map((m, idx) => (
                    <span key={idx} className="px-2 py-0.5 rounded bg-teal-50 text-teal-800 text-[11px] font-medium border border-teal-200">
                      {m}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

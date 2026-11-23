import React, { useState, useEffect, useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  Sparkles,
  BookOpen,
  Folder,
  Loader2,
  ExternalLink,
  Tag,
  Wrench,
  AlertCircle,
  TrendingUp,
  RefreshCw,
} from 'lucide-react'
import {
  getProjects,
  getProjectPapers,
  getPaperRecommendations,
  ApiError,
} from '../services/api'
import type {
  Project,
  Paper,
  PaperRecommendationsResponse,
  PaperRecommendationItem,
} from '../types'

export const RecommendationsPage: React.FC = () => {
  const [searchParams] = useSearchParams()

  // State
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState<string>('')
  const [papers, setPapers] = useState<Paper[]>([])
  const [selectedPaperId, setSelectedPaperId] = useState<string>('')

  const [isLoadingProjects, setIsLoadingProjects] = useState<boolean>(true)
  const [isLoadingPapers, setIsLoadingPapers] = useState<boolean>(false)
  const [isLoadingRecs, setIsLoadingRecs] = useState<boolean>(false)
  const [recsError, setRecsError] = useState<string | null>(null)
  const [recommendationsData, setRecommendationsData] = useState<PaperRecommendationsResponse | null>(null)

  // 1. Fetch Projects on mount
  useEffect(() => {
    async function loadProjects() {
      setIsLoadingProjects(true)
      try {
        const data = await getProjects()
        setProjects(data.projects)

        const urlProjectId = searchParams.get('projectId')
        const urlPaperId = searchParams.get('paperId')

        if (urlProjectId && data.projects.some((p) => p.id === urlProjectId)) {
          setSelectedProjectId(urlProjectId)
        } else if (data.projects.length > 0) {
          setSelectedProjectId(data.projects[0].id)
        }

        if (urlPaperId) {
          setSelectedPaperId(urlPaperId)
        }
      } catch (err: unknown) {
        console.error('Failed to load projects:', err)
      } finally {
        setIsLoadingProjects(false)
      }
    }
    loadProjects()
  }, [searchParams])

  // 2. Fetch Papers when project changes
  useEffect(() => {
    if (!selectedProjectId) {
      setPapers([])
      setSelectedPaperId('')
      setRecommendationsData(null)
      return
    }

    async function loadPapers() {
      setIsLoadingPapers(true)
      try {
        const data = await getProjectPapers(selectedProjectId)
        setPapers(data.papers)

        const completed = data.papers.filter((p) => p.chunking_status === 'completed')
        if (completed.length > 0 && !selectedPaperId) {
          setSelectedPaperId(completed[0].id)
        }
      } catch (err: unknown) {
        console.error('Failed to load papers:', err)
      } finally {
        setIsLoadingPapers(false)
      }
    }
    loadPapers()
  }, [selectedProjectId])

  // 3. Fetch Recommendations
  const fetchRecommendations = async () => {
    if (!selectedProjectId) return

    setIsLoadingRecs(true)
    setRecsError(null)

    try {
      const data = await getPaperRecommendations(
        selectedPaperId || null,
        selectedProjectId || null,
        6
      )
      setRecommendationsData(data)
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setRecsError(err.message)
      } else {
        setRecsError('Failed to retrieve paper recommendations.')
      }
    } finally {
      setIsLoadingRecs(false)
    }
  }

  // Auto-fetch when selectedPaperId changes
  useEffect(() => {
    if (selectedPaperId || selectedProjectId) {
      fetchRecommendations()
    }
  }, [selectedPaperId, selectedProjectId])

  const indexedPapers = useMemo(() => {
    return papers.filter((p) => p.chunking_status === 'completed')
  }, [papers])

  const selectedPaper = useMemo(() => {
    return papers.find((p) => p.id === selectedPaperId)
  }, [papers, selectedPaperId])

  return (
    <div className="p-4 sm:p-8 max-w-[1560px] mx-auto w-full space-y-6" data-testid="recommendations-container">
      {/* ==================== PAGE HEADER ==================== */}
      <div className="bg-white rounded-xl border border-[#E2E8F0] shadow-xs p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center text-[#2563EB]">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-[#0F172A] tracking-tight">
                Literature Recommendations
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                Multi-signal paper discovery inferred from semantic embeddings and knowledge graph topics & methods.
              </p>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={fetchRecommendations}
          disabled={isLoadingRecs || !selectedProjectId}
          data-testid="refresh-recommendations-btn"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs sm:text-sm font-semibold shadow-2xs transition cursor-pointer self-start md:self-auto shrink-0"
        >
          <RefreshCw className={`w-4 h-4 ${isLoadingRecs ? 'animate-spin text-blue-600' : ''}`} />
          <span>Refresh Recommendations</span>
        </button>
      </div>

      {/* ==================== CONTROLS CARD ==================== */}
      <div className="bg-white rounded-xl border border-[#E2E8F0] shadow-xs p-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Project Selector */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
              <Folder className="w-3.5 h-3.5 text-[#2563EB]" />
              <span>Research Project</span>
            </label>
            <select
              value={selectedProjectId}
              onChange={(e) => {
                setSelectedProjectId(e.target.value)
                setSelectedPaperId('')
              }}
              data-testid="recommendations-project-select"
              disabled={isLoadingProjects || isLoadingRecs}
              className="w-full h-10 px-3 rounded-lg border border-[#E2E8F0] bg-white text-xs sm:text-sm font-medium text-[#0F172A] focus:outline-hidden focus:ring-2 focus:ring-[#2563EB] disabled:bg-slate-50 cursor-pointer"
            >
              {projects.length === 0 && <option value="">No projects available</option>}
              {projects.map((proj) => (
                <option key={proj.id} value={proj.id}>
                  {proj.name}
                </option>
              ))}
            </select>
          </div>

          {/* Reference Paper Selector */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <BookOpen className="w-3.5 h-3.5 text-[#2563EB]" />
                <span>Reference Paper (Seed)</span>
              </span>
              {selectedPaper && (
                <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  Active Reference
                </span>
              )}
            </label>
            <select
              value={selectedPaperId}
              onChange={(e) => setSelectedPaperId(e.target.value)}
              data-testid="recommendations-paper-select"
              disabled={isLoadingPapers || isLoadingRecs || indexedPapers.length === 0}
              className="w-full h-10 px-3 rounded-lg border border-[#E2E8F0] bg-white text-xs sm:text-sm font-medium text-[#0F172A] focus:outline-hidden focus:ring-2 focus:ring-[#2563EB] disabled:bg-slate-50 cursor-pointer"
            >
              {indexedPapers.length === 0 && <option value="">No indexed papers in project</option>}
              {indexedPapers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Error Banner */}
        {recsError && (
          <div
            data-testid="recommendations-error-banner"
            className="p-4 rounded-xl border border-rose-200 bg-rose-50 text-rose-800 text-xs sm:text-sm flex items-start gap-3"
          >
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold text-rose-900">Recommendation Query Failed</p>
              <p className="text-xs text-rose-700 leading-relaxed">{recsError}</p>
            </div>
          </div>
        )}
      </div>

      {/* ==================== LOADING STATE ==================== */}
      {isLoadingRecs && (
        <div
          data-testid="recommendations-loading-state"
          className="bg-white rounded-xl border border-blue-100 shadow-xs p-10 text-center space-y-3"
        >
          <div className="w-10 h-10 rounded-full bg-blue-50 border border-blue-200 flex items-center justify-center mx-auto text-[#2563EB] animate-pulse">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
          <p className="text-sm font-semibold text-[#0F172A]">
            Computing multi-signal paper recommendations...
          </p>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Synthesizing dense vector embeddings from Qdrant with topic and methodology subgraphs from Neo4j.
          </p>
        </div>
      )}

      {/* ==================== RECOMMENDATIONS LIST ==================== */}
      {!isLoadingRecs && recommendationsData && (
        <div className="space-y-4" data-testid="recommendations-results-container">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-200">
            <div>
              <h2 className="text-base sm:text-lg font-bold text-[#0F172A] flex items-center gap-2">
                <span>Recommended Papers</span>
                <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-200">
                  {recommendationsData.total_recommendations} Found
                </span>
              </h2>
              {recommendationsData.target_paper_title && (
                <p className="text-xs text-slate-500">
                  Ranked against seed: <strong>{recommendationsData.target_paper_title}</strong>
                </p>
              )}
            </div>
          </div>

          {recommendationsData.total_recommendations === 0 ? (
            <div
              data-testid="recommendations-empty-state"
              className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center max-w-lg mx-auto space-y-3"
            >
              <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-500">
                <BookOpen className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold text-[#0F172A]">No Related Papers Found</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                {recommendationsData.message ||
                  'No other indexed research papers available in your corpus to recommend. Upload and index more literature to discover connections.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {recommendationsData.recommendations.map((rec: PaperRecommendationItem, idx: number) => {
                const matchPct = Math.round(rec.relevance_score * 100)
                return (
                  <div
                    key={rec.paper_id}
                    data-testid={`recommendation-card-${idx}`}
                    className="bg-white rounded-xl border border-[#E2E8F0] shadow-xs p-5 flex flex-col justify-between space-y-4 hover:border-blue-300 transition-all"
                  >
                    <div className="space-y-3">
                      {/* Card Header */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1 flex-1">
                          <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">
                            Recommendation #{idx + 1}
                          </span>
                          <h3 className="text-sm sm:text-base font-bold text-[#0F172A] leading-snug">
                            {rec.paper_title}
                          </h3>
                        </div>

                        {/* Relevance Score Pill */}
                        <div
                          data-testid={`relevance-badge-${idx}`}
                          className="px-2.5 py-1 rounded-lg bg-blue-50 border border-blue-200 text-[#2563EB] text-xs font-bold font-mono shrink-0 flex items-center gap-1"
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>{matchPct}% Match</span>
                        </div>
                      </div>

                      {/* Transparent Rationale Box */}
                      <div className="bg-slate-50/80 p-3 rounded-lg border border-slate-100 text-xs text-slate-700 leading-relaxed font-sans">
                        <span className="font-semibold text-slate-900 block mb-1 flex items-center gap-1">
                          <Sparkles className="w-3 h-3 text-[#2563EB]" />
                          <span>Why Recommended:</span>
                        </span>
                        {rec.recommendation_reason}
                      </div>

                      {/* Shared Topics & Methods */}
                      <div className="space-y-2">
                        {rec.shared_topics.length > 0 && (
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-[11px] font-semibold text-slate-500 flex items-center gap-1">
                              <Tag className="w-3 h-3 text-indigo-500" />
                              <span>Shared Topics:</span>
                            </span>
                            {rec.shared_topics.map((t, ti) => (
                              <span
                                key={ti}
                                className="px-2 py-0.5 rounded text-[11px] font-medium bg-indigo-50 text-indigo-800 border border-indigo-200/80"
                              >
                                {t}
                              </span>
                            ))}
                          </div>
                        )}

                        {rec.shared_methods.length > 0 && (
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-[11px] font-semibold text-slate-500 flex items-center gap-1">
                              <Wrench className="w-3 h-3 text-emerald-500" />
                              <span>Shared Methods:</span>
                            </span>
                            {rec.shared_methods.map((m, mi) => (
                              <span
                                key={mi}
                                className="px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-50 text-emerald-800 border border-emerald-200/80"
                              >
                                {m}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Card Footer: View Paper */}
                    <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                      <span className="text-xs text-slate-400 truncate max-w-xs">
                        Project: {rec.project_name}
                      </span>

                      <Link
                        to={`/papers/${rec.paper_id}`}
                        data-testid={`view-recommended-paper-${idx}`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#2563EB] hover:bg-blue-700 text-white text-xs font-semibold shadow-2xs transition"
                      >
                        <span>View Paper</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

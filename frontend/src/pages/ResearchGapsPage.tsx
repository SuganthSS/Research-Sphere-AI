import React, { useState, useEffect, useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  Compass,
  Loader2,
  Folder,
  Layers,
  AlertCircle,
  ExternalLink,
  ShieldAlert,
  Sparkles,
  CheckCircle2,
  RefreshCw,
  AlertTriangle,
  Lightbulb,
} from 'lucide-react'
import {
  getProjects,
  getProjectPapers,
  analyzeResearchGaps,
  getLatestResearchGaps,
  ApiError,
} from '../services/api'
import type {
  Project,
  Paper,
  ResearchGapAnalysisResponse,
  PotentialResearchGap,
  GapCitationItem,
} from '../types'

export const ResearchGapsPage: React.FC = () => {
  const [searchParams] = useSearchParams()

  // Selection states
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState<string>('')
  const [papers, setPapers] = useState<Paper[]>([])
  const [selectedPaperIds, setSelectedPaperIds] = useState<string[]>([])
  const [scope, setScope] = useState<'project' | 'selected'>('project')

  // Analysis & Loading states
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false)
  const [isLoadingProjects, setIsLoadingProjects] = useState<boolean>(true)
  const [_isLoadingPapers, setIsLoadingPapers] = useState<boolean>(false)
  const [analysisError, setAnalysisError] = useState<string | null>(null)
  const [analysis, setAnalysis] = useState<ResearchGapAnalysisResponse | null>(null)

  // 1. Load projects on mount
  useEffect(() => {
    async function loadProjects() {
      setIsLoadingProjects(true)
      try {
        const data = await getProjects()
        setProjects(data.projects)

        const urlProjectId = searchParams.get('projectId')
        if (urlProjectId && data.projects.some((p) => p.id === urlProjectId)) {
          setSelectedProjectId(urlProjectId)
        } else if (data.projects.length > 0) {
          setSelectedProjectId(data.projects[0].id)
        }
      } catch (err: unknown) {
        console.error('Failed to load projects:', err)
      } finally {
        setIsLoadingProjects(false)
      }
    }
    loadProjects()
  }, [searchParams])

  // 2. Load papers whenever selectedProjectId changes
  useEffect(() => {
    if (!selectedProjectId) {
      setPapers([])
      setSelectedPaperIds([])
      setAnalysis(null)
      return
    }

    async function loadPapers() {
      setIsLoadingPapers(true)
      try {
        const data = await getProjectPapers(selectedProjectId)
        setPapers(data.papers)
        // Default: select all indexed papers
        const indexedIds = data.papers
          .filter((p) => p.chunking_status === 'completed')
          .map((p) => p.id)
        setSelectedPaperIds(indexedIds)

        // Try loading existing cached analysis
        try {
          const cached = await getLatestResearchGaps(selectedProjectId)
          setAnalysis(cached)
        } catch {
          setAnalysis(null)
        }
      } catch (err: unknown) {
        console.error('Failed to load papers:', err)
      } finally {
        setIsLoadingPapers(false)
      }
    }
    loadPapers()
  }, [selectedProjectId])

  const indexedPapers = useMemo(() => {
    return papers.filter((p) => p.chunking_status === 'completed')
  }, [papers])

  const hasIndexedPapers = indexedPapers.length > 0

  // Toggle paper selection
  const handlePaperToggle = (paperId: string) => {
    setSelectedPaperIds((prev) =>
      prev.includes(paperId) ? prev.filter((id) => id !== paperId) : [...prev, paperId]
    )
  }

  // Handle Analysis trigger
  const handleAnalyze = async (forceRegenerate: boolean = false) => {
    if (!selectedProjectId || isAnalyzing) return

    setIsAnalyzing(true)
    setAnalysisError(null)

    try {
      const targetIds = scope === 'selected' ? selectedPaperIds : null
      const res = await analyzeResearchGaps(
        selectedProjectId,
        {
          scope,
          paper_ids: targetIds,
          force_regenerate: forceRegenerate,
        }
      )
      setAnalysis(res)
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setAnalysisError(err.message)
      } else {
        setAnalysisError('An unexpected error occurred while analyzing research gaps.')
      }
    } finally {
      setIsAnalyzing(false)
    }
  }

  // Paper map for title display
  const paperTitleMap = useMemo(() => {
    const map = new Map<string, string>()
    papers.forEach((p) => map.set(p.id, p.title))
    return map
  }, [papers])

  // Gap type styling helper
  const getGapTypeBadge = (type: string) => {
    switch (type) {
      case 'Limitation-Derived Gap':
        return 'bg-amber-50 text-amber-800 border-amber-200'
      case 'Future-Work Gap':
        return 'bg-blue-50 text-blue-800 border-blue-200'
      case 'Cross-Paper Inconsistency / Underexplored Connection':
        return 'bg-purple-50 text-purple-800 border-purple-200'
      case 'Dataset / Evaluation Gap':
        return 'bg-emerald-50 text-emerald-800 border-emerald-200'
      case 'Methodological Gap':
      default:
        return 'bg-indigo-50 text-indigo-800 border-indigo-200'
    }
  }

  // Confidence badge helper
  const getConfidenceBadge = (confidence: string) => {
    switch (confidence) {
      case 'High':
        return 'bg-emerald-100 text-emerald-800 border-emerald-300'
      case 'Medium':
        return 'bg-blue-100 text-blue-800 border-blue-300'
      case 'Low':
      default:
        return 'bg-slate-100 text-slate-800 border-slate-300'
    }
  }

  return (
    <div className="p-6 lg:p-8 max-w-[1560px] mx-auto w-full space-y-6 lg:space-y-8" data-testid="research-gaps-container">
      {/* ==================== PAGE HEADER ==================== */}
      <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs p-5 sm:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-amber-50 border border-amber-100/80 flex items-center justify-center text-amber-600 shadow-2xs">
              <Compass className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                Potential Research Gap Identification
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 mt-1">
                Evidence-supported research gaps inferred from limitations, future work, and cross-paper synthesis.
              </p>
            </div>
          </div>
        </div>

        {/* Action Button */}
        <div className="flex items-center gap-2 self-start md:self-auto shrink-0">
          <button
            type="button"
            onClick={() => handleAnalyze(false)}
            disabled={!selectedProjectId || !hasIndexedPapers || isAnalyzing}
            data-testid="analyze-gaps-btn"
            className="inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs sm:text-sm font-semibold shadow-2xs transition-all cursor-pointer disabled:cursor-not-allowed"
          >
            {isAnalyzing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Analyzing Gaps...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>{analysis ? 'Re-Analyze Gaps' : 'Analyze Research Gaps'}</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* ==================== SCIENTIFIC CAUTION NOTICE ==================== */}
      <div
        data-testid="scientific-caution-notice"
        className="p-4 rounded-xl border border-amber-200/80 bg-amber-50/70 text-amber-900 text-xs sm:text-sm flex items-start gap-3 shadow-2xs"
      >
        <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-bold text-amber-950 flex items-center gap-1.5">
            <span>Scientific Safety &amp; Scoping Notice</span>
          </p>
          <p className="text-xs text-amber-800/90 leading-relaxed">
            Potential gaps are inferred from the selected literature and should be validated against the broader scientific literature before being treated as established research gaps.
          </p>
        </div>
      </div>

      {/* ==================== CONTROL & CONFIGURATION CARD ==================== */}
      <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs p-5 sm:p-6 space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* 1. Project Selector */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <Folder className="w-3.5 h-3.5 text-blue-600" />
              <span>Research Project</span>
            </label>
            <select
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              data-testid="gaps-project-select"
              disabled={isLoadingProjects || isAnalyzing}
              className="w-full h-9 px-3 rounded-lg border border-slate-200 bg-white text-xs sm:text-sm font-medium text-slate-900 focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15 disabled:bg-slate-50 disabled:opacity-60 cursor-pointer"
            >
              {projects.length === 0 && <option value="">No projects available</option>}
              {projects.map((proj) => (
                <option key={proj.id} value={proj.id}>
                  {proj.name}
                </option>
              ))}
            </select>
          </div>

          {/* 2. Scope Selector */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-blue-600" />
              <span>Corpus Scope</span>
            </label>
            <div className="grid grid-cols-2 gap-1.5 h-9 p-1 bg-slate-100/90 rounded-lg border border-slate-200/80">
              <button
                type="button"
                onClick={() => setScope('project')}
                data-testid="gaps-scope-project-btn"
                disabled={isAnalyzing}
                className={`flex items-center justify-center gap-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${scope === 'project'
                  ? 'bg-white text-blue-600 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
                  }`}
              >
                <Folder className="w-3.5 h-3.5" />
                <span>Entire Project</span>
              </button>

              <button
                type="button"
                onClick={() => setScope('selected')}
                data-testid="gaps-scope-selected-btn"
                disabled={isAnalyzing}
                className={`flex items-center justify-center gap-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${scope === 'selected'
                  ? 'bg-white text-blue-600 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
                  }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Selected Papers ({selectedPaperIds.length})</span>
              </button>
            </div>
          </div>

          {/* 3. Corpus Stats */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                <span>Indexed Literature Status</span>
              </span>
            </label>
            <div className="h-10 px-3.5 rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-between text-xs text-slate-700">
              <span>{indexedPapers.length} of {papers.length} Papers Indexed</span>
              <span className="font-semibold text-emerald-700">
                {hasIndexedPapers ? 'Ready for Analysis' : 'Requires Chunking'}
              </span>
            </div>
          </div>
        </div>

        {/* Selected Papers Checklist (Visible when scope === 'selected') */}
        {scope === 'selected' && (
          <div className="pt-2 border-t border-slate-100 space-y-2">
            <span className="text-xs font-semibold text-slate-700">
              Select target papers for gap analysis:
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto p-1">
              {papers.map((p) => {
                const isIndexed = p.chunking_status === 'completed'
                const isChecked = selectedPaperIds.includes(p.id)
                return (
                  <label
                    key={p.id}
                    className={`flex items-center gap-2.5 p-2 rounded-lg border text-xs cursor-pointer transition ${isChecked
                      ? 'border-blue-300 bg-blue-50/50 text-slate-900'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                      } ${!isIndexed ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      disabled={!isIndexed || isAnalyzing}
                      onChange={() => handlePaperToggle(p.id)}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="truncate flex-1 font-medium">{p.title}</span>
                    <span className="text-[10px] font-mono shrink-0">
                      {isIndexed ? '✓ Indexed' : 'Needs Chunking'}
                    </span>
                  </label>
                )
              })}
            </div>
          </div>
        )}

        {/* Error Banner */}
        {analysisError && (
          <div
            data-testid="gaps-error-banner"
            className="p-4 rounded-xl border border-rose-200 bg-rose-50 text-rose-800 text-xs sm:text-sm flex items-start gap-3"
          >
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold text-rose-900">Analysis Failed</p>
              <p className="text-xs text-rose-700 leading-relaxed">{analysisError}</p>
            </div>
          </div>
        )}
      </div>

      {/* ==================== LOADING STATE ==================== */}
      {isAnalyzing && (
        <div
          data-testid="gaps-loading-state"
          className="bg-white rounded-xl border border-blue-100 shadow-xs p-10 text-center space-y-3"
        >
          <div className="w-10 h-10 rounded-full bg-blue-50 border border-blue-200 flex items-center justify-center mx-auto text-[#2563EB] animate-pulse">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-semibold text-[#0F172A]">
              Extracting limitations, future work, and synthesizing potential research gaps...
            </p>
            <p className="text-xs text-slate-500 max-w-lg mx-auto leading-relaxed">
              Synthesizing cross-paper methodology constraints and open questions via Groq LLM grounded in authentic text chunks.
            </p>
          </div>
        </div>
      )}

      {/* ==================== RESULTS SECTION ==================== */}
      {!isAnalyzing && analysis && (
        <div className="space-y-5" data-testid="gaps-results-container">
          {/* Header Summary */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-200/80">
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2">
                <span>Discovered Potential Research Gaps</span>
                <span className="text-xs font-mono px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200/80 font-semibold">
                  {analysis.total_gaps} {analysis.total_gaps === 1 ? 'Gap' : 'Gaps'}
                </span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Inferred from {analysis.paper_ids.length} research {analysis.paper_ids.length === 1 ? 'paper' : 'papers'} · Revision v{analysis.version}
              </p>
            </div>

            <button
              type="button"
              onClick={() => handleAnalyze(true)}
              disabled={isAnalyzing}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-2xs transition cursor-pointer self-start sm:self-auto"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Regenerate Analysis</span>
            </button>
          </div>

          {/* Insufficient Evidence Notice */}
          {analysis.insufficient_evidence && (
            <div
              data-testid="gaps-insufficient-evidence"
              className="p-6 rounded-xl border border-slate-200/90 bg-white text-center space-y-3 shadow-2xs"
            >
              <div className="w-10 h-10 rounded-full bg-amber-50 border border-amber-200/80 flex items-center justify-center mx-auto text-amber-600">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-slate-900">Insufficient Evidence for Defensible Gaps</h3>
                <p className="text-xs text-slate-600 max-w-md mx-auto leading-relaxed">
                  {analysis.insufficient_evidence_reason ||
                    'The analyzed literature does not present clear explicit limitations or open research challenges. The system refuses to speculate.'}
                </p>
              </div>
            </div>
          )}

          {/* Gap Cards Grid */}
          <div className="grid grid-cols-1 gap-5">
            {analysis.gaps.map((gap: PotentialResearchGap, idx: number) => (
              <div
                key={gap.id || idx}
                data-testid={`potential-gap-card-${idx}`}
                className="bg-white rounded-xl border border-slate-200/90 shadow-2xs p-6 space-y-4 transition-all hover:border-slate-300"
              >
                {/* Card Header: Type Badge & Confidence */}
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 pb-3 border-b border-slate-100">
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                        Potential Research Gap #{idx + 1}
                      </span>
                      <span
                        className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${getGapTypeBadge(
                          gap.gap_type
                        )}`}
                      >
                        {gap.gap_type}
                      </span>
                    </div>

                    <h3 className="text-base sm:text-lg font-bold text-slate-900 leading-snug">
                      {gap.title}
                    </h3>
                  </div>

                  <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
                    <span className="text-[11px] font-medium text-slate-500">Evidence Confidence:</span>
                    <span
                      className={`text-[11px] font-bold px-2 py-0.5 rounded border ${getConfidenceBadge(
                        gap.confidence
                      )}`}
                      title="Confidence reflects evidence strength within this specific corpus, not global consensus."
                    >
                      {gap.confidence}
                    </span>
                  </div>
                </div>

                {/* Potential Gap Description */}
                <div className="space-y-1.5 bg-slate-50/70 p-3.5 rounded-lg border border-slate-100">
                  <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                    <Lightbulb className="w-3.5 h-3.5 text-amber-500" />
                    <span>Potential Research Gap Statement</span>
                  </span>
                  <p className="text-xs sm:text-sm text-slate-800 leading-relaxed font-medium">
                    {gap.potential_gap}
                  </p>
                </div>

                {/* Evidence & Rationale */}
                <div className="space-y-1.5">
                  <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Evidence / Corpus Rationale
                  </span>
                  <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                    {gap.rationale}
                  </p>
                </div>

                {/* Why It May Matter */}
                <div className="space-y-1.5">
                  <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Why It May Matter
                  </span>
                  <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                    {gap.why_it_matters}
                  </p>
                </div>

                {/* Citations & Supporting Papers Footer */}
                <div className="pt-3 border-t border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-3">
                  {/* Supporting Papers */}
                  <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                    <span className="font-semibold text-slate-700">Supporting Papers:</span>
                    {gap.supporting_papers.map((pid) => (
                      <span
                        key={pid}
                        className="px-2 py-0.5 rounded bg-slate-100 text-slate-800 border border-slate-200 text-[11px] font-medium truncate max-w-xs"
                      >
                        {paperTitleMap.get(pid) || pid}
                      </span>
                    ))}
                  </div>

                  {/* Citations Navigation */}
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                      Citations:
                    </span>
                    {gap.citations.map((src: GapCitationItem) => (
                      <Link
                        key={src.source_number}
                        to={`/papers/${src.paper_id}?tab=extracted-text&page=${src.start_page}&chunk=${src.chunk_id}&citation=${src.source_number}`}
                        data-testid={`view-gap-citation-${src.source_number}`}
                        title={`View Source [${src.source_number}] - ${src.paper_title} (Page ${src.start_page})`}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-bold font-mono bg-indigo-50 hover:bg-indigo-600 hover:text-white border border-indigo-200 text-indigo-700 transition cursor-pointer shadow-2xs"
                      >
                        <span>[{src.source_number}]</span>
                        <ExternalLink className="w-3 h-3" />
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Initial Empty State */}
      {!analysis && !isAnalyzing && (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center max-w-xl mx-auto space-y-4 my-8 shadow-2xs">
          <div className="w-12 h-12 rounded-xl bg-amber-50 border border-amber-200/80 flex items-center justify-center mx-auto text-amber-600 shadow-2xs">
            <Compass className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-slate-900">Discover Potential Research Gaps</h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              Select your literature corpus and click <strong>Analyze Research Gaps</strong> to identify evidence-supported methodology constraints, unaddressed limitations, and future directions.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

import React, { useState, useEffect, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  GitCompare,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
  ExternalLink,
  Search,
  FileText,
  RefreshCw,
  Target,
  Cpu,
  Database,
  TrendingUp,
  AlertTriangle,
  Layers,
  Check,
} from 'lucide-react'
import type {
  Paper,
  PaperComparisonResponse,
  ComparisonCitation,
} from '../types'
import {
  getPapers,
  comparePapers,
  getComparisonByPaperIds,
  ApiError,
} from '../services/api'

export const ComparePage: React.FC = () => {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  // Data state
  const [papers, setPapers] = useState<Paper[]>([])
  const [isLoadingPapers, setIsLoadingPapers] = useState(true)
  const [papersError, setPapersError] = useState<string | null>(null)

  // Selection state
  const [selectedPaperIds, setSelectedPaperIds] = useState<string[]>([])
  const [paperFilter, setPaperFilter] = useState('')

  // Comparison state
  const [comparison, setComparison] = useState<PaperComparisonResponse | null>(null)
  const [isComparing, setIsComparing] = useState(false)
  const [comparisonError, setComparisonError] = useState<string | null>(null)
  const [comparisonSuccessMsg, setComparisonSuccessMsg] = useState<string | null>(null)
  const [showSelectionView, setShowSelectionView] = useState(true)

  // 1. Fetch papers on mount
  useEffect(() => {
    const fetchPapersList = async () => {
      setIsLoadingPapers(true)
      setPapersError(null)
      try {
        const resp = await getPapers()
        setPapers(resp.papers || [])
      } catch (err: unknown) {
        if (err instanceof ApiError) {
          setPapersError(err.message)
        } else {
          setPapersError('Failed to load papers library.')
        }
      } finally {
        setIsLoadingPapers(false)
      }
    }
    fetchPapersList()
  }, [])

  // 2. Pre-select paper IDs from URL if provided (?papers=uuid1,uuid2)
  useEffect(() => {
    const papersParam = searchParams.get('papers')
    if (papersParam && papers.length > 0) {
      const ids = papersParam.split(',').filter(Boolean)
      const validIds = ids.filter((id) => papers.some((p) => p.id === id))
      if (validIds.length >= 2 && validIds.length <= 5) {
        setSelectedPaperIds(validIds)
        // Automatically check if comparison already exists
        checkExistingComparison(validIds)
      }
    }
  }, [searchParams, papers])

  const checkExistingComparison = async (ids: string[]) => {
    try {
      const existing = await getComparisonByPaperIds(ids)
      if (existing) {
        setComparison(existing)
        setShowSelectionView(false)
      }
    } catch {
      // No existing comparison, user can click Compare
    }
  }

  // Filter papers
  const eligiblePapers = useMemo(() => {
    return papers.filter(
      (p) => p.chunking_status === 'completed' && p.embedding_status === 'completed'
    )
  }, [papers])

  const ineligiblePapers = useMemo(() => {
    return papers.filter(
      (p) => p.chunking_status !== 'completed' || p.embedding_status !== 'completed'
    )
  }, [papers])

  const displayedEligiblePapers = useMemo(() => {
    if (!paperFilter.trim()) return eligiblePapers
    const q = paperFilter.toLowerCase()
    return eligiblePapers.filter(
      (p) => p.title.toLowerCase().includes(q) || p.original_filename.toLowerCase().includes(q)
    )
  }, [eligiblePapers, paperFilter])

  // Toggle selection
  const handleToggleSelect = (paperId: string) => {
    setSelectedPaperIds((prev) => {
      if (prev.includes(paperId)) {
        return prev.filter((id) => id !== paperId)
      }
      if (prev.length >= 5) {
        return prev
      }
      return [...prev, paperId]
    })
  }

  // Trigger comparison
  const handleCompareSubmit = async () => {
    if (selectedPaperIds.length < 2 || selectedPaperIds.length > 5) return

    setIsComparing(true)
    setComparisonError(null)
    setComparisonSuccessMsg(null)

    try {
      const result = await comparePapers(selectedPaperIds)
      setComparison(result)
      setShowSelectionView(false)
      setComparisonSuccessMsg('Comparative analysis generated successfully.')

      // Update URL search params
      setSearchParams({ papers: selectedPaperIds.join(',') }, { replace: true })
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setComparisonError(err.message)
      } else {
        setComparisonError('An unexpected error occurred while generating comparative analysis.')
      }
    } finally {
      setIsComparing(false)
    }
  }

  // Citation navigation: deep-links to Extracted Text view with exact highlight
  const handleCitationClick = (cite: ComparisonCitation) => {
    navigate(
      `/papers/${cite.paper_id}?tab=extracted-text&page=${cite.start_page}&chunk=${cite.chunk_id}&citation=${cite.source_number}`
    )
  }

  const dimensionConfigs = [
    {
      key: 'objective',
      label: 'Research Objective / Problem',
      icon: Target,
      accent: 'border-blue-200 bg-blue-50/50 text-blue-700',
    },
    {
      key: 'methodology',
      label: 'Methodology / Approach',
      icon: Cpu,
      accent: 'border-purple-200 bg-purple-50/50 text-purple-700',
    },
    {
      key: 'dataset_setup',
      label: 'Dataset & Experimental Setup',
      icon: Database,
      accent: 'border-cyan-200 bg-cyan-50/50 text-cyan-700',
    },
    {
      key: 'key_findings',
      label: 'Key Findings & Results',
      icon: TrendingUp,
      accent: 'border-emerald-200 bg-emerald-50/50 text-emerald-700',
    },
    {
      key: 'limitations',
      label: 'Limitations & Constraints',
      icon: AlertTriangle,
      accent: 'border-amber-200 bg-amber-50/50 text-amber-700',
    },
    {
      key: 'future_work',
      label: 'Future Work & Research Directions',
      icon: Sparkles,
      accent: 'border-indigo-200 bg-indigo-50/50 text-indigo-700',
    },
  ]

  return (
    <div className="p-6 lg:p-8 max-w-[1560px] mx-auto w-full space-y-6 lg:space-y-8" data-testid="compare-page-container">
      {/* Top Header */}
      <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs p-5 sm:p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <GitCompare className="w-6 h-6 text-blue-600" />
            <span>Compare Research Papers</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Perform multi-paper comparative analysis across methodologies, benchmarks, and claims.
          </p>
        </div>

        {comparison && !showSelectionView && (
          <button
            type="button"
            onClick={() => setShowSelectionView(true)}
            data-testid="change-selection-btn"
            className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-2xs transition-colors cursor-pointer"
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Change Selected Papers ({selectedPaperIds.length})</span>
          </button>
        )}
      </div>

      {/* Notifications */}
      {comparisonSuccessMsg && (
        <div
          data-testid="comparison-success-banner"
          className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="font-medium">{comparisonSuccessMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setComparisonSuccessMsg(null)}
            className="text-emerald-600 hover:text-emerald-800 p-1"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {(comparisonError || papersError) && (
        <div
          data-testid="comparison-error-banner"
          className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <div>
              <span className="font-semibold block">Notice:</span>
              <span>{comparisonError || papersError}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setComparisonError(null)
              setPapersError(null)
            }}
            className="text-rose-600 hover:text-rose-800 p-1"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* =========================================================================
          SECTION A: PAPER SELECTION VIEW
          ========================================================================= */}
      {showSelectionView && (
        <section
          data-testid="paper-selection-section"
          className="bg-white rounded-2xl border border-[#E2E8F0] shadow-xs p-6 space-y-6"
        >
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-[#0F172A]">
                Select 2 to 5 Indexed Research Papers
              </h2>
              <p className="text-xs text-[#64748B]">
                Only papers with completed document chunking and semantic vector indexing can be compared.
              </p>
            </div>

            {/* Selection Counter & Submit */}
            <div className="flex items-center gap-3">
              <span
                data-testid="selection-count-badge"
                className={`px-3 py-1 rounded-full text-xs font-bold font-mono border ${
                  selectedPaperIds.length >= 2 && selectedPaperIds.length <= 5
                    ? 'bg-blue-50 text-blue-700 border-blue-200'
                    : 'bg-slate-100 text-slate-600 border-slate-200'
                }`}
              >
                {selectedPaperIds.length} / 5 Selected
              </span>

              <button
                type="button"
                onClick={handleCompareSubmit}
                disabled={selectedPaperIds.length < 2 || selectedPaperIds.length > 5 || isComparing}
                data-testid="compare-papers-btn"
                className="inline-flex items-center justify-center gap-2 px-5 py-2 rounded-xl bg-[#2563EB] hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isComparing ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Comparing...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Compare Selected Papers</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Validation Notice when < 2 */}
          {selectedPaperIds.length > 0 && selectedPaperIds.length < 2 && (
            <div
              data-testid="selection-warning"
              className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-center gap-2"
            >
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>Please select at least 2 papers to perform comparative analysis.</span>
            </div>
          )}

          {/* Search Filter */}
          <div className="relative max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={paperFilter}
              onChange={(e) => setPaperFilter(e.target.value)}
              placeholder="Filter papers by title or filename..."
              className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50/50"
            />
          </div>

          {/* Papers Grid */}
          {isLoadingPapers ? (
            <div className="py-12 text-center space-y-3">
              <Loader2 className="w-8 h-8 text-blue-600 animate-spin mx-auto" />
              <p className="text-xs text-[#64748B]">Loading research papers library...</p>
            </div>
          ) : eligiblePapers.length === 0 ? (
            <div
              data-testid="no-eligible-papers-card"
              className="p-8 text-center rounded-xl border border-dashed border-slate-300 bg-slate-50 space-y-3"
            >
              <FileText className="w-8 h-8 text-slate-400 mx-auto" />
              <h3 className="text-sm font-semibold text-[#0F172A]">No Eligible Papers Found</h3>
              <p className="text-xs text-[#64748B] max-w-md mx-auto">
                No papers currently have semantic indexing completed. Upload and index at least 2 papers to enable comparative analysis.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="eligible-papers-grid">
              {displayedEligiblePapers.map((paper) => {
                const isSelected = selectedPaperIds.includes(paper.id)
                const isMaxReached = selectedPaperIds.length >= 5 && !isSelected

                return (
                  <div
                    key={paper.id}
                    data-testid={`paper-select-card-${paper.id}`}
                    onClick={() => !isMaxReached && handleToggleSelect(paper.id)}
                    className={`rounded-xl border p-4 transition-all cursor-pointer relative ${
                      isSelected
                        ? 'border-blue-500 bg-blue-50/30 ring-2 ring-blue-500/20'
                        : isMaxReached
                        ? 'border-slate-200 bg-slate-50/50 opacity-60 cursor-not-allowed'
                        : 'border-[#E2E8F0] hover:border-blue-300 bg-white'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1">
                        <span className="text-[10px] font-mono text-slate-500 block truncate max-w-[200px]">
                          {paper.original_filename}
                        </span>
                        <h4 className="text-xs font-bold text-[#0F172A] line-clamp-2">
                          {paper.title}
                        </h4>
                      </div>

                      <div
                        className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-colors ${
                          isSelected
                            ? 'bg-[#2563EB] border-[#2563EB] text-white'
                            : 'border-slate-300 bg-white'
                        }`}
                      >
                        {isSelected && <Check className="w-3.5 h-3.5" />}
                      </div>
                    </div>

                    <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-[#64748B]">
                      <span>{paper.page_count ?? '?'} pages</span>
                      <span className="px-1.5 py-0.2 rounded-full text-[10px] font-semibold bg-purple-50 text-purple-700 border border-purple-200">
                        {paper.chunk_count ?? '?'} chunks indexed
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Ineligible papers section */}
          {ineligiblePapers.length > 0 && (
            <div className="pt-4 border-t border-slate-100 space-y-2">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
                Unindexed Papers ({ineligiblePapers.length}) — Processing Required
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                {ineligiblePapers.map((p) => (
                  <div
                    key={p.id}
                    className="p-2.5 rounded-lg border border-slate-200 bg-slate-50/50 text-xs flex items-center justify-between text-slate-400"
                  >
                    <span className="truncate max-w-[180px] font-medium text-slate-600">{p.title}</span>
                    <span className="text-[10px] font-mono bg-slate-200 px-1.5 py-0.5 rounded text-slate-600">
                      {p.chunking_status !== 'completed' ? 'Unprocessed' : 'Unindexed'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {/* =========================================================================
          SECTION B: LOADING STATE
          ========================================================================= */}
      {isComparing && (
        <div
          data-testid="comparison-in-progress-card"
          className="bg-white rounded-2xl border border-indigo-200 shadow-xs p-12 text-center space-y-4"
        >
          <Loader2 className="w-10 h-10 text-indigo-600 animate-spin mx-auto" />
          <div className="space-y-1">
            <h3 className="text-base font-bold text-[#0F172A]">
              Generating Cross-Paper Comparative Analysis...
            </h3>
            <p className="text-xs text-[#64748B] max-w-md mx-auto">
              Contrasting {selectedPaperIds.length} research papers across 6 scientific dimensions and synthesizing grounded similarities and differences with Groq LLM.
            </p>
          </div>
          <span className="inline-block px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 text-xs font-semibold animate-pulse font-mono">
            status: retrieving multi-paper evidence & analyzing
          </span>
        </div>
      )}

      {/* =========================================================================
          SECTION C: COMPARISON RESULTS VIEW
          ========================================================================= */}
      {comparison && !isComparing && (
        <div className="space-y-8" data-testid="comparison-results-container">
          {/* Header Controls */}
          <div className="bg-white rounded-xl border border-[#E2E8F0] shadow-xs p-4 flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="font-bold text-[#0F172A] text-sm">
                  Comparative Analysis: {comparison.comparison.compared_papers.length} Papers
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  Grounded
                </span>
              </div>
              <p className="text-xs text-[#64748B]">
                Model: <span className="font-mono font-medium text-slate-700">{comparison.model_name}</span> ({comparison.model_provider}) • Updated: {new Date(comparison.updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>

            <button
              type="button"
              onClick={handleCompareSubmit}
              disabled={isComparing}
              data-testid="regenerate-comparison-btn"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-[#0F172A] text-xs font-semibold border border-slate-200 transition-colors cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isComparing ? 'animate-spin' : ''}`} />
              <span>Regenerate Comparison</span>
            </button>
          </div>

          {/* 1. Cross-Paper Similarities Section */}
          <section
            data-testid="comparison-similarities-card"
            className="bg-white rounded-2xl border border-emerald-200 shadow-xs p-6 space-y-4"
          >
            <div className="flex items-center gap-2 text-emerald-800">
              <div className="p-1.5 rounded-lg bg-emerald-50 border border-emerald-200">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-[#0F172A]">Major Cross-Paper Similarities</h3>
                <p className="text-xs text-[#64748B]">
                  Shared methodologies, common theoretical foundations, or consistent empirical trends.
                </p>
              </div>
            </div>

            {comparison.comparison.similarities.length === 0 ? (
              <p className="text-xs text-[#64748B] italic">No major similarities identified.</p>
            ) : (
              <div className="space-y-3" data-testid="similarities-list">
                {comparison.comparison.similarities.map((item, idx) => (
                  <div
                    key={idx}
                    data-testid={`similarity-item-${idx}`}
                    className="p-4 rounded-xl bg-emerald-50/30 border border-emerald-100 space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="text-xs font-bold text-[#0F172A]">{item.title}</h4>
                      {item.citations && item.citations.length > 0 && (
                        <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-100/60 px-2 py-0.5 rounded-full">
                          {item.citations.length} citation(s)
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[#334155] leading-relaxed">{item.description}</p>

                    {item.citations && item.citations.length > 0 && (
                      <div className="pt-2 flex flex-wrap gap-1.5">
                        {item.citations.map((c, cIdx) => (
                          <button
                            key={`${c.chunk_id}-${cIdx}`}
                            type="button"
                            onClick={() => handleCitationClick(c)}
                            data-testid={`similarity-citation-${idx}-${c.source_number}`}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 cursor-pointer"
                            title={`Jump to Page ${c.start_page}`}
                          >
                            <span className="font-bold">[{c.source_number}]</span>
                            <span>Page {c.start_page}</span>
                            <ExternalLink className="w-2.5 h-2.5 opacity-60" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* 2. Cross-Paper Differences Section */}
          <section
            data-testid="comparison-differences-card"
            className="bg-white rounded-2xl border border-indigo-200 shadow-xs p-6 space-y-4"
          >
            <div className="flex items-center gap-2 text-indigo-800">
              <div className="p-1.5 rounded-lg bg-indigo-50 border border-indigo-200">
                <GitCompare className="w-5 h-5 text-indigo-600" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-[#0F172A]">Major Points of Divergence & Differences</h3>
                <p className="text-xs text-[#64748B]">
                  Contrasting architectures, divergent benchmarks, distinct trade-offs, and opposing conclusions.
                </p>
              </div>
            </div>

            {comparison.comparison.differences.length === 0 ? (
              <p className="text-xs text-[#64748B] italic">No major differences identified.</p>
            ) : (
              <div className="space-y-3" data-testid="differences-list">
                {comparison.comparison.differences.map((item, idx) => (
                  <div
                    key={idx}
                    data-testid={`difference-item-${idx}`}
                    className="p-4 rounded-xl bg-indigo-50/30 border border-indigo-100 space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="text-xs font-bold text-[#0F172A]">{item.title}</h4>
                      {item.citations && item.citations.length > 0 && (
                        <span className="text-[10px] font-semibold text-indigo-700 bg-indigo-100/60 px-2 py-0.5 rounded-full">
                          {item.citations.length} citation(s)
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[#334155] leading-relaxed">{item.description}</p>

                    {item.citations && item.citations.length > 0 && (
                      <div className="pt-2 flex flex-wrap gap-1.5">
                        {item.citations.map((c, cIdx) => (
                          <button
                            key={`${c.chunk_id}-${cIdx}`}
                            type="button"
                            onClick={() => handleCitationClick(c)}
                            data-testid={`difference-citation-${idx}-${c.source_number}`}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 cursor-pointer"
                            title={`Jump to Page ${c.start_page}`}
                          >
                            <span className="font-bold">[{c.source_number}]</span>
                            <span>Page {c.start_page}</span>
                            <ExternalLink className="w-2.5 h-2.5 opacity-60" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* 3. The 6-Dimensional Comparison Matrix */}
          <div className="space-y-6">
            <h2 className="text-base font-bold text-[#0F172A] flex items-center gap-2">
              <Layers className="w-5 h-5 text-blue-600" />
              <span>Comparative Dimensions Matrix (6 Scientific Dimensions)</span>
            </h2>

            <div className="space-y-5">
              {dimensionConfigs.map((cfg) => {
                const dimData = comparison.comparison.dimensions[cfg.key]
                if (!dimData) return null

                return (
                  <section
                    key={cfg.key}
                    data-testid={`dimension-section-${cfg.key}`}
                    className="bg-white rounded-2xl border border-[#E2E8F0] shadow-xs p-5 space-y-4"
                  >
                    {/* Dimension Header & Synthesis */}
                    <div className="flex flex-wrap items-start justify-between gap-3 pb-3 border-b border-slate-100">
                      <div className="flex items-center gap-2.5">
                        <div className={`p-2 rounded-lg border ${cfg.accent}`}>
                          <cfg.icon className="w-4 h-4" />
                        </div>
                        <h3 className="text-sm font-bold text-[#0F172A]">{cfg.label}</h3>
                      </div>

                      {dimData.synthesis && (
                        <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-[#475569] max-w-xl">
                          <span className="font-semibold text-[#0F172A] block">Synthesis:</span>
                          <span>{dimData.synthesis}</span>
                        </div>
                      )}
                    </div>

                    {/* Papers Grid Columns for this dimension */}
                    <div
                      className={`grid gap-4 ${
                        comparison.comparison.compared_papers.length === 2
                          ? 'grid-cols-1 md:grid-cols-2'
                          : comparison.comparison.compared_papers.length === 3
                          ? 'grid-cols-1 md:grid-cols-3'
                          : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4'
                      }`}
                    >
                      {comparison.comparison.compared_papers.map((paperBrief) => {
                        const paperSummary = dimData.papers[paperBrief.id]
                        const summaryText = paperSummary?.summary || 'Not clearly stated in the paper.'
                        const citations = paperSummary?.citations || []

                        return (
                          <div
                            key={paperBrief.id}
                            data-testid={`paper-dim-card-${cfg.key}-${paperBrief.id}`}
                            className="p-4 rounded-xl bg-slate-50/60 border border-slate-200/80 space-y-3 flex flex-col justify-between"
                          >
                            <div className="space-y-2">
                              {/* Paper Title Badge */}
                              <div className="pb-1.5 border-b border-slate-200/60">
                                <span className="text-[10px] font-mono text-slate-500 block truncate">
                                  {paperBrief.original_filename}
                                </span>
                                <h4 className="text-xs font-bold text-[#0F172A] line-clamp-2">
                                  {paperBrief.title}
                                </h4>
                              </div>

                              {/* Summary Text */}
                              {summaryText === 'Not clearly stated in the paper.' ? (
                                <div className="p-2.5 rounded-lg bg-white border border-slate-200 text-xs text-[#64748B] italic flex items-center gap-2">
                                  <AlertCircle className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                  <span>Not clearly stated in the paper.</span>
                                </div>
                              ) : (
                                <p className="text-xs text-[#334155] leading-relaxed whitespace-pre-wrap">
                                  {summaryText}
                                </p>
                              )}
                            </div>

                            {/* Citations */}
                            {citations.length > 0 && (
                              <div className="pt-2 border-t border-slate-200/60 space-y-1">
                                <span className="text-[10px] font-semibold uppercase tracking-wider text-[#64748B] block">
                                  Supporting Evidence
                                </span>
                                <div className="flex flex-wrap gap-1.5">
                                  {citations.map((cite, cIdx) => (
                                    <button
                                      key={`${cite.chunk_id}-${cIdx}`}
                                      type="button"
                                      onClick={() => handleCitationClick(cite)}
                                      data-testid={`dim-citation-${cfg.key}-${cite.source_number}`}
                                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 hover:border-blue-300 transition-all cursor-pointer shadow-2xs"
                                      title={`Jump to Page ${cite.start_page} supporting evidence`}
                                    >
                                      <span className="font-bold">[{cite.source_number}]</span>
                                      <span>Page {cite.start_page}</span>
                                      <ExternalLink className="w-2.5 h-2.5 text-blue-500 opacity-60 ml-0.5" />
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </section>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

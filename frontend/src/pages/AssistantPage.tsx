import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  Sparkles,
  Loader2,
  BookOpen,
  Folder,
  FileText,
  AlertCircle,
  ExternalLink,
  Layers,
  RefreshCw,
  HelpCircle,
  Hash,
  ShieldCheck,
  ChevronRight,
  Database,
} from 'lucide-react'
import {
  getProjects,
  getProjectPapers,
  askAssistant,
  getAssistantStatus,
  ApiError,
} from '../services/api'
import type {
  Project,
  Paper,
  AskAssistantResponse,
  SourceCitationItem,
  AssistantStatusResponse,
} from '../types'

export const AssistantPage: React.FC = () => {
  const [searchParams] = useSearchParams()

  // Selection states
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState<string>('')
  const [scope, setScope] = useState<'paper' | 'project'>('paper')
  const [papers, setPapers] = useState<Paper[]>([])
  const [selectedPaperId, setSelectedPaperId] = useState<string>('')

  // Query & Answer states
  const [question, setQuestion] = useState<string>('')
  const [isAsking, setIsAsking] = useState<boolean>(false)
  const [askError, setAskError] = useState<string | null>(null)
  const [response, setResponse] = useState<AskAssistantResponse | null>(null)
  const [highlightedSource, setHighlightedSource] = useState<number | null>(null)

  // Status & Metadata states
  const [assistantStatus, setAssistantStatus] = useState<AssistantStatusResponse | null>(null)
  const [isLoadingProjects, setIsLoadingProjects] = useState<boolean>(true)
  const [isLoadingPapers, setIsLoadingPapers] = useState<boolean>(false)

  // Quick suggestions
  const suggestedQuestions = [
    'What problem is this research trying to solve?',
    'What methodology or approach does the study use?',
    'What are the key results and findings reported in the paper?',
    'What future work or limitations are discussed?',
  ]

  // 1. Fetch assistant status
  const fetchStatus = useCallback(async () => {
    try {
      const stat = await getAssistantStatus()
      setAssistantStatus(stat)
    } catch {
      setAssistantStatus(null)
    }
  }, [])

  // 2. Fetch projects on mount
  useEffect(() => {
    fetchStatus()
    async function loadProjects() {
      setIsLoadingProjects(true)
      try {
        const data = await getProjects()
        setProjects(data.projects)

        const urlProjectId = searchParams.get('projectId')
        const urlPaperId = searchParams.get('paperId')
        const urlScope = searchParams.get('scope')

        if (urlScope === 'project' || urlScope === 'paper') {
          setScope(urlScope)
        }

        if (urlProjectId && data.projects.some((p) => p.id === urlProjectId)) {
          setSelectedProjectId(urlProjectId)
        } else if (data.projects.length > 0) {
          setSelectedProjectId(data.projects[0].id)
        }

        if (urlPaperId) {
          setSelectedPaperId(urlPaperId)
        }
      } catch (err: unknown) {
        if (err instanceof ApiError) {
          setAskError(err.message)
        } else {
          setAskError('Failed to load projects.')
        }
      } finally {
        setIsLoadingProjects(false)
      }
    }

    loadProjects()
  }, [fetchStatus, searchParams])

  // 3. Load papers when project changes
  useEffect(() => {
    if (!selectedProjectId) {
      setPapers([])
      setSelectedPaperId('')
      return
    }

    async function loadProjectPapers() {
      setIsLoadingPapers(true)
      try {
        const data = await getProjectPapers(selectedProjectId)
        setPapers(data.papers)

        const urlPaperId = searchParams.get('paperId')
        if (urlPaperId && data.papers.some((p) => p.id === urlPaperId)) {
          setSelectedPaperId(urlPaperId)
        } else if (data.papers.length > 0) {
          // Default to first indexed paper if available, else first paper
          const indexed = data.papers.find((p) => p.embedding_status === 'completed')
          setSelectedPaperId(indexed ? indexed.id : data.papers[0].id)
        } else {
          setSelectedPaperId('')
        }
      } catch {
        setPapers([])
        setSelectedPaperId('')
      } finally {
        setIsLoadingPapers(false)
      }
    }

    loadProjectPapers()
  }, [selectedProjectId, searchParams])

  // Filter indexed papers
  const indexedPapers = useMemo(() => {
    return papers.filter((p) => p.embedding_status === 'completed')
  }, [papers])

  const selectedPaper = useMemo(() => {
    return papers.find((p) => p.id === selectedPaperId)
  }, [papers, selectedPaperId])

  // Check preconditions
  const isSelectedPaperIndexed = selectedPaper?.embedding_status === 'completed'
  const hasIndexedPapersInProject = indexedPapers.length > 0

  const canAsk = useMemo(() => {
    if (!question.trim() || isAsking) return false
    if (!selectedProjectId) return false
    if (scope === 'paper') return isSelectedPaperIndexed
    if (scope === 'project') return hasIndexedPapersInProject
    return false
  }, [question, isAsking, selectedProjectId, scope, isSelectedPaperIndexed, hasIndexedPapersInProject])

  // Handle Ask Submit
  const handleAsk = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    const trimmed = question.trim()
    if (!trimmed || isAsking) return

    setIsAsking(true)
    setAskError(null)

    try {
      const res = await askAssistant({
        question: trimmed,
        scope,
        paper_id: scope === 'paper' ? selectedPaperId : null,
        project_id: selectedProjectId,
      })
      setResponse(res)
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setAskError(err.message)
      } else {
        setAskError('An unexpected error occurred while communicating with the AI Assistant.')
      }
    } finally {
      setIsAsking(false)
    }
  }

  // Handle citation badge click
  const handleCitationClick = (sourceNum: number) => {
    setHighlightedSource(sourceNum)
    const el = document.getElementById(`source-card-${sourceNum}`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }

  // Format inline citations in answer text
  const renderFormattedAnswer = (text: string) => {
    // Splits by [N] citation tokens
    const parts = text.split(/(\[\d+\])/g)
    return parts.map((part, i) => {
      const match = part.match(/^\[(\d+)\]$/)
      if (match) {
        const sourceNum = parseInt(match[1], 10)
        return (
          <button
            key={i}
            type="button"
            onClick={() => handleCitationClick(sourceNum)}
            className="inline-flex items-center px-1.5 py-0.5 mx-0.5 rounded text-[11px] font-bold font-mono bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100 hover:text-indigo-900 transition-colors cursor-pointer align-baseline"
            title={`View Source [${sourceNum}]`}
          >
            [{sourceNum}]
          </button>
        )
      }
      return <span key={i}>{part}</span>
    })
  }

  return (
    <div className="p-4 sm:p-8 max-w-[1560px] mx-auto w-full space-y-6" data-testid="assistant-container">
      {/* ==================== PAGE HEADER ==================== */}
      <div className="bg-white rounded-xl border border-[#E2E8F0] shadow-xs p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-[#0F172A] tracking-tight">
                AI Research Assistant
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                Ask scientific questions strictly grounded in your indexed literature with verifiable citations.
              </p>
            </div>
          </div>
        </div>

        {/* LLM Status Pill */}
        <div className="flex items-center gap-2 self-start md:self-auto shrink-0">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-xs text-slate-700">
            <span
              className={`w-2 h-2 rounded-full ${
                assistantStatus?.configured ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
              }`}
            />
            <span className="font-semibold text-slate-800">
              {assistantStatus?.configured ? 'Groq Grounded RAG' : 'Groq LLM'}
            </span>
            <span className="text-slate-400">·</span>
            <span className="font-mono text-[11px] text-slate-600">
              {assistantStatus?.model || 'llama-3.3-70b-versatile'}
            </span>
          </div>

          <button
            type="button"
            onClick={fetchStatus}
            title="Refresh LLM provider status"
            className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ==================== CONTROL & CONFIGURATION CARD ==================== */}
      <div className="bg-white rounded-xl border border-[#E2E8F0] shadow-xs p-6 space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* 1. Project Selector */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
              <Folder className="w-3.5 h-3.5 text-[#2563EB]" />
              <span>Research Project</span>
            </label>
            <select
              value={selectedProjectId}
              onChange={(e) => {
                setSelectedProjectId(e.target.value)
                setResponse(null)
              }}
              data-testid="assistant-project-select"
              disabled={isLoadingProjects || isAsking}
              className="w-full h-10 px-3 rounded-lg border border-[#E2E8F0] bg-white text-xs sm:text-sm font-medium text-[#0F172A] focus:outline-hidden focus:ring-2 focus:ring-[#2563EB] disabled:bg-slate-50 disabled:opacity-60 cursor-pointer"
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
            <label className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-[#2563EB]" />
              <span>Literature Scope</span>
            </label>
            <div className="grid grid-cols-2 gap-2 h-10 p-1 bg-slate-100 rounded-lg border border-slate-200">
              <button
                type="button"
                onClick={() => {
                  setScope('paper')
                  setResponse(null)
                }}
                data-testid="assistant-scope-paper-btn"
                disabled={isAsking}
                className={`flex items-center justify-center gap-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                  scope === 'paper'
                    ? 'bg-white text-[#2563EB] shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>This Paper</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setScope('project')
                  setResponse(null)
                }}
                data-testid="assistant-scope-project-btn"
                disabled={isAsking}
                className={`flex items-center justify-center gap-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                  scope === 'project'
                    ? 'bg-white text-[#2563EB] shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Folder className="w-3.5 h-3.5" />
                <span>Entire Project</span>
              </button>
            </div>
          </div>

          {/* 3. Paper Selector (Visible when scope === 'paper') */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <BookOpen className="w-3.5 h-3.5 text-[#2563EB]" />
                <span>Target Paper</span>
              </span>
              {selectedPaper && (
                <span
                  className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                    isSelectedPaperIndexed
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-amber-50 text-amber-700 border border-amber-200'
                  }`}
                >
                  {isSelectedPaperIndexed ? 'Indexed' : 'Needs Indexing'}
                </span>
              )}
            </label>
            <select
              value={selectedPaperId}
              onChange={(e) => {
                setSelectedPaperId(e.target.value)
                setResponse(null)
              }}
              data-testid="assistant-paper-select"
              disabled={scope !== 'paper' || isLoadingPapers || isAsking || papers.length === 0}
              className="w-full h-10 px-3 rounded-lg border border-[#E2E8F0] bg-white text-xs sm:text-sm font-medium text-[#0F172A] focus:outline-hidden focus:ring-2 focus:ring-[#2563EB] disabled:bg-slate-50 disabled:opacity-60 cursor-pointer"
            >
              {papers.length === 0 && <option value="">No papers in project</option>}
              {papers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title} {p.embedding_status === 'completed' ? '✓' : '(Not Indexed)'}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Precondition Warnings */}
        {scope === 'paper' && selectedPaper && !isSelectedPaperIndexed && (
          <div
            data-testid="assistant-unindexed-warning"
            className="p-3.5 rounded-lg border border-amber-200 bg-amber-50/70 text-xs text-amber-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
          >
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                <strong>{selectedPaper.title}</strong> has not been semantically indexed yet. Questions require vector embeddings.
              </span>
            </div>
            <Link
              to={`/papers/${selectedPaper.id}?tab=semantic-search`}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs transition cursor-pointer self-start sm:self-auto shrink-0 shadow-xs"
            >
              <span>Create Semantic Index</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        )}

        {scope === 'project' && !hasIndexedPapersInProject && papers.length > 0 && (
          <div
            data-testid="assistant-project-unindexed-warning"
            className="p-3.5 rounded-lg border border-amber-200 bg-amber-50/70 text-xs text-amber-900 flex items-center gap-2"
          >
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              None of the papers in this project have been semantically indexed yet. Please create a semantic index on at least one paper to enable project-wide Q&A.
            </span>
          </div>
        )}

        {/* Question Form */}
        <form onSubmit={handleAsk} className="space-y-3 pt-2">
          <div className="relative">
            <textarea
              rows={3}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask a scientific research question (e.g. What methodology or architecture does this study use?)..."
              disabled={isAsking}
              data-testid="assistant-question-input"
              className="w-full p-3.5 pr-28 rounded-xl border border-[#E2E8F0] bg-white text-sm text-[#0F172A] placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-[#2563EB] disabled:bg-slate-50 disabled:opacity-60 resize-none shadow-xs"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  if (canAsk) handleAsk()
                }
              }}
            />

            <div className="absolute right-3 bottom-3 flex items-center gap-2">
              <button
                type="submit"
                disabled={!canAsk}
                data-testid="assistant-ask-btn"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#2563EB] hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer disabled:cursor-not-allowed"
              >
                {isAsking ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Searching...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Ask Assistant</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Suggestion Chips */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="text-[11px] font-semibold text-slate-400 flex items-center gap-1">
              <HelpCircle className="w-3 h-3" />
              <span>Suggestions:</span>
            </span>
            {suggestedQuestions.map((s, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setQuestion(s)}
                disabled={isAsking}
                className="text-[11px] text-slate-600 bg-slate-100 hover:bg-slate-200 hover:text-slate-900 px-2.5 py-1 rounded-full transition-colors cursor-pointer"
              >
                {s}
              </button>
            ))}
          </div>
        </form>

        {/* Error Banner */}
        {askError && (
          <div
            data-testid="assistant-error-banner"
            className="p-4 rounded-xl border border-rose-200 bg-rose-50 text-rose-800 text-xs sm:text-sm flex items-start gap-3"
          >
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold text-rose-900">Query Generation Failed</p>
              <p className="text-xs text-rose-700 leading-relaxed">{askError}</p>
            </div>
          </div>
        )}
      </div>

      {/* ==================== LOADING STATE ==================== */}
      {isAsking && (
        <div
          data-testid="assistant-loading-state"
          className="bg-white rounded-xl border border-blue-100 shadow-xs p-8 text-center space-y-3"
        >
          <div className="w-10 h-10 rounded-full bg-blue-50 border border-blue-200 flex items-center justify-center mx-auto text-[#2563EB] animate-pulse">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-semibold text-[#0F172A]">
              Searching your research papers and generating an answer...
            </p>
            <p className="text-xs text-slate-500">
              Retrieving dense vector embeddings from Qdrant and synthesizing grounded evidence via Groq LLM.
            </p>
          </div>
        </div>
      )}

      {/* ==================== ANSWER SECTION ==================== */}
      {response && !isAsking && (
        <div className="space-y-6" data-testid="assistant-response-container">
          {/* Grounded Answer Card */}
          <div className="bg-white rounded-xl border border-[#E2E8F0] shadow-xs p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-md bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600 text-xs font-bold">
                  Q
                </span>
                <span className="text-xs sm:text-sm font-bold text-[#0F172A]" data-testid="assistant-response-question">
                  {response.question}
                </span>
              </div>

              <div className="flex items-center gap-2 self-start sm:self-auto">
                <span className="text-[11px] font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                  Scope: {response.scope === 'paper' ? 'Single Paper' : 'Entire Project'}
                </span>
                <span className="text-[11px] font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                  {response.total_sources} {response.total_sources === 1 ? 'Source' : 'Sources'}
                </span>
              </div>
            </div>

            {/* Insufficient Evidence Notice */}
            {response.insufficient_evidence && (
              <div
                data-testid="assistant-insufficient-evidence-banner"
                className="p-3.5 rounded-lg border border-amber-200 bg-amber-50 text-amber-900 text-xs flex items-center gap-2.5"
              >
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>
                  <strong>Insufficient Evidence:</strong> The selected literature does not contain adequate evidence to answer this question. The assistant refuses to speculate.
                </span>
              </div>
            )}

            {/* Answer Text */}
            <div
              className="text-sm text-[#0F172A] leading-relaxed font-sans whitespace-pre-wrap selection:bg-indigo-100"
              data-testid="assistant-response-answer"
            >
              {renderFormattedAnswer(response.answer)}
            </div>

            <div className="pt-2 flex items-center gap-2 text-[11px] text-slate-400">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span>Grounded strictly in retrieved paper evidence · Hallucination safeguarded</span>
            </div>
          </div>

          {/* ==================== SOURCES SECTION ==================== */}
          {response.sources.length > 0 && (
            <div className="space-y-3" id="sources-section" data-testid="assistant-sources-container">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                  <Database className="w-4 h-4 text-[#2563EB]" />
                  <span>Grounded Sources ({response.sources.length})</span>
                </h2>
                <span className="text-xs text-slate-400">Click any source to navigate directly to its page</span>
              </div>

              <div className="grid grid-cols-1 gap-3">
                {response.sources.map((src: SourceCitationItem) => {
                  const isHighlighted = highlightedSource === src.source_number
                  const pageDisplay =
                    src.start_page === src.end_page
                      ? `Page ${src.start_page}`
                      : `Pages ${src.start_page}–${src.end_page}`

                  return (
                    <div
                      key={src.source_number}
                      id={`source-card-${src.source_number}`}
                      data-testid={`source-card-${src.source_number}`}
                      className={`p-4 rounded-xl border transition-all ${
                        isHighlighted
                          ? 'border-indigo-500 bg-indigo-50/40 shadow-sm'
                          : 'border-[#E2E8F0] bg-white hover:border-slate-300 shadow-xs'
                      }`}
                    >
                      {/* Source Card Header */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-slate-100">
                        <div className="flex flex-wrap items-center gap-2">
                          {/* Number badge */}
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-indigo-600 text-white text-xs font-mono font-bold">
                            [{src.source_number}]
                          </span>

                          {/* Paper Title */}
                          <span className="text-xs sm:text-sm font-bold text-[#0F172A] truncate max-w-md">
                            {src.paper_title}
                          </span>

                          {/* Section Badge */}
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                            <Hash className="w-3 h-3" />
                            <span>{src.section_name}</span>
                          </span>

                          {/* Page Badge */}
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
                            <BookOpen className="w-3 h-3" />
                            <span>{pageDisplay}</span>
                          </span>

                          {/* Similarity Badge */}
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <span>Score: {src.similarity_score.toFixed(3)}</span>
                          </span>
                        </div>

                        {/* View Source Button */}
                        <Link
                          to={`/papers/${src.paper_id}?tab=extracted-text&page=${src.start_page}&chunk=${src.chunk_id}&citation=${src.source_number}`}
                          data-testid={`view-source-btn-${src.source_number}`}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-[#2563EB] hover:text-white text-slate-700 text-xs font-semibold transition-colors cursor-pointer self-start sm:self-auto shrink-0 shadow-2xs"
                        >
                          <span>View Source</span>
                          <ExternalLink className="w-3.5 h-3.5" />
                        </Link>
                      </div>

                      {/* Excerpt Text */}
                      <div className="mt-2.5 text-xs text-slate-700 font-mono bg-slate-50/80 p-3 rounded-lg border border-slate-200/70 leading-relaxed whitespace-pre-wrap max-h-48 overflow-y-auto">
                        {src.text}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

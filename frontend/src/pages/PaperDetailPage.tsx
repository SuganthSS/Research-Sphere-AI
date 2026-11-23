import React, { useState, useEffect, useRef, useMemo } from 'react'
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  Download,
  Trash2,
  ArrowLeft,
  CheckCircle2,
  Folder,
  AlertCircle,
  Loader2,
  X,
  Sparkles,
  Bot,
  FileText,
  RefreshCw,
  Layers,
  Hash,
  Clock,
  Cpu,
  Filter,
  ChevronDown,
  ChevronUp,
  Search,
  Database,
  ExternalLink,
  Target,
  TrendingUp,
  AlertTriangle,
} from 'lucide-react'
import type {
  Paper,
  Project,
  PaperPage,
  PaperChunk,
  SearchResultItem,
  PaperSummaryResponse,
  SummaryCitation,
} from '../types'
import {
  getPaper,
  getProjects,
  deletePaper,
  downloadPaperFile,
  extractPaper,
  getPaperPages,
  processPaper,
  getPaperChunks,
  embedPaper,
  searchSemantic,
  getPaperSummary,
  generatePaperSummary,
  ApiError,
} from '../services/api'

interface ChunkMatchResult {
  before: string
  match: string
  after: string
  isExact: boolean
}

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function findChunkMatch(pageText: string, chunkText: string): ChunkMatchResult | null {
  if (!pageText || !chunkText) return null
  const trimmedChunk = chunkText.trim()
  if (!trimmedChunk) return null

  // 1. Direct exact substring match
  const directIdx = pageText.indexOf(trimmedChunk)
  if (directIdx !== -1) {
    return {
      before: pageText.slice(0, directIdx),
      match: pageText.slice(directIdx, directIdx + trimmedChunk.length),
      after: pageText.slice(directIdx + trimmedChunk.length),
      isExact: true,
    }
  }

  const words = trimmedChunk.split(/\s+/).filter(Boolean)
  if (words.length < 3) {
    try {
      const pat = words.map(escapeRegExp).join('\\s+')
      const m = new RegExp(pat).exec(pageText)
      if (m) {
        return {
          before: pageText.slice(0, m.index),
          match: m[0],
          after: pageText.slice(m.index + m[0].length),
          isExact: false,
        }
      }
    } catch {
      // ignore
    }
    return null
  }

  // 2. Full whitespace-normalized regex match (all words match on this page)
  try {
    const fullPattern = words.map(escapeRegExp).join('\\s+')
    const fullRe = new RegExp(fullPattern)
    const fullMatch = fullRe.exec(pageText)
    if (fullMatch) {
      let matchStart = fullMatch.index
      let matchEnd = fullMatch.index + fullMatch[0].length
      while (matchStart > 0 && /\S/.test(pageText[matchStart - 1])) {
        matchStart--
      }
      while (matchEnd < pageText.length && /\S/.test(pageText[matchEnd])) {
        matchEnd++
      }
      return {
        before: pageText.slice(0, matchStart),
        match: pageText.slice(matchStart, matchEnd),
        after: pageText.slice(matchEnd),
        isExact: false,
      }
    }
  } catch {
    // Regex too large or malformed
  }

  // 3. Multi-page chunk: chunk starts on this page, or has overlap slice
  // If first word is a cut-off fragment (len <= 4), check if skipping it helps anchor
  const startWordIndices = [0]
  if (words.length > 4 && words[0].length <= 4) {
    startWordIndices.push(1)
  }

  for (const startIdx of startWordIndices) {
    const candidateWords = words.slice(startIdx)
    const anchorLen = Math.min(5, candidateWords.length)
    if (anchorLen < 4) continue
    const anchorPat = candidateWords.slice(0, anchorLen).map(escapeRegExp).join('\\s+')
    try {
      const anchorRe = new RegExp(anchorPat)
      const anchorMatch = anchorRe.exec(pageText)
      if (anchorMatch) {
        let matchStart = anchorMatch.index
        let matchEnd = anchorMatch.index + anchorMatch[0].length

        // Expand backward to whole-word boundary
        while (matchStart > 0 && /\S/.test(pageText[matchStart - 1])) {
          matchStart--
        }

        // Expand forward through remaining candidate words
        for (let w = anchorLen; w < candidateWords.length; w++) {
          const nextWord = candidateWords[w]
          const remainingPage = pageText.slice(matchEnd)
          const nextRe = new RegExp('^\\s*' + escapeRegExp(nextWord))
          const nextMatch = nextRe.exec(remainingPage)
          if (nextMatch) {
            matchEnd += nextMatch[0].length
          } else {
            break
          }
        }

        // Expand forward to whole-word boundary
        while (matchEnd < pageText.length && /\S/.test(pageText[matchEnd])) {
          matchEnd++
        }

        return {
          before: pageText.slice(0, matchStart),
          match: pageText.slice(matchStart, matchEnd),
          after: pageText.slice(matchEnd),
          isExact: false,
        }
      }
    } catch {
      // Fall through
    }
  }

  // 4. Multi-page chunk: chunk starts on previous page and ends on this page
  for (let sLen = Math.min(words.length, 15); sLen >= 4; sLen--) {
    const suffixWords = words.slice(-sLen)
    const pat = suffixWords.map(escapeRegExp).join('\\s+')
    try {
      const re = new RegExp(pat)
      const m = re.exec(pageText)
      if (m) {
        let matchStart = m.index
        let matchEnd = m.index + m[0].length
        while (matchStart > 0 && /\S/.test(pageText[matchStart - 1])) {
          matchStart--
        }
        while (matchEnd < pageText.length && /\S/.test(pageText[matchEnd])) {
          matchEnd++
        }
        return {
          before: pageText.slice(0, matchStart),
          match: pageText.slice(matchStart, matchEnd),
          after: pageText.slice(matchEnd),
          isExact: false,
        }
      }
    } catch {
      // Fall through
    }
  }

  // 5. Sliding window anchor (at least 6 consecutive words)
  for (let w = 0; w <= words.length - 6; w += 3) {
    const subWords = words.slice(w, w + 6)
    const pat = subWords.map(escapeRegExp).join('\\s+')
    try {
      const re = new RegExp(pat)
      const m = re.exec(pageText)
      if (m) {
        let matchStart = m.index
        let matchEnd = m.index + m[0].length
        while (matchStart > 0 && /\S/.test(pageText[matchStart - 1])) {
          matchStart--
        }
        for (let fw = w + 6; fw < words.length; fw++) {
          const nextWord = words[fw]
          const rest = pageText.slice(matchEnd)
          const nextM = new RegExp('^\\s*' + escapeRegExp(nextWord)).exec(rest)
          if (nextM) matchEnd += nextM[0].length
          else break
        }
        while (matchEnd < pageText.length && /\S/.test(pageText[matchEnd])) {
          matchEnd++
        }
        return {
          before: pageText.slice(0, matchStart),
          match: pageText.slice(matchStart, matchEnd),
          after: pageText.slice(matchEnd),
          isExact: false,
        }
      }
    } catch {
      // Fall through
    }
  }

  return null
}

export const PaperDetailPage: React.FC = () => {
  const { paperId } = useParams<{ paperId: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const tabParam = searchParams.get('tab')
  const pageParam = searchParams.get('page')
  const chunkParam = searchParams.get('chunk')
  const citationParam = searchParams.get('citation')

  const initialTab = (): 'text' | 'metadata' | 'processing' | 'search' | 'summary' => {
    if (tabParam === 'summary') return 'summary'
    if (tabParam === 'extracted-text' || tabParam === 'text') return 'text'
    if (tabParam === 'processing') return 'processing'
    if (tabParam === 'search' || tabParam === 'semantic-search') return 'search'
    if (tabParam === 'metadata') return 'metadata'
    return 'text'
  }

  const parsePageParam = (): number | 'all' => {
    if (!pageParam) return 'all'
    const parsed = parseInt(pageParam, 10)
    return isNaN(parsed) || parsed < 1 ? 'all' : parsed
  }

  const [paper, setPaper] = useState<Paper | null>(null)
  const [project, setProject] = useState<Project | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Extraction State
  const [pages, setPages] = useState<PaperPage[]>([])
  const [isLoadingPages, setIsLoadingPages] = useState(false)
  const [isExtracting, setIsExtracting] = useState(false)
  const [extractionError, setExtractionError] = useState<string | null>(null)
  const [extractionSuccessMsg, setExtractionSuccessMsg] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'text' | 'metadata' | 'processing' | 'search' | 'summary'>(initialTab)
  const [selectedPageFilter, setSelectedPageFilter] = useState<number | 'all'>(parsePageParam)

  // Processing (Chunking) State
  const [chunks, setChunks] = useState<PaperChunk[]>([])
  const [chunkSections, setChunkSections] = useState<string[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [processingError, setProcessingError] = useState<string | null>(null)
  const [processingSuccessMsg, setProcessingSuccessMsg] = useState<string | null>(null)
  const [selectedSection, setSelectedSection] = useState<string>('all')
  const [showChunkInspector, setShowChunkInspector] = useState(false)

  // Embedding & Semantic Search State
  const [isEmbedding, setIsEmbedding] = useState(false)
  const [embeddingError, setEmbeddingError] = useState<string | null>(null)
  const [embeddingSuccessMsg, setEmbeddingSuccessMsg] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchScope, setSearchScope] = useState<'paper' | 'project'>('paper')
  const [searchLimit, setSearchLimit] = useState<number>(5)
  const [isSearching, setIsSearching] = useState(false)
  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([])
  const [searchError, setSearchError] = useState<string | null>(null)
  const [hasSearched, setHasSearched] = useState(false)

  // Paper Summary State (Module 7.1)
  const [summary, setSummary] = useState<PaperSummaryResponse | null>(null)
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false)
  const [summaryError, setSummaryError] = useState<string | null>(null)
  const [summarySuccessMsg, setSummarySuccessMsg] = useState<string | null>(null)

  // Actions state
  const [isDownloading, setIsDownloading] = useState(false)
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const pageRefs = useRef<{ [key: number]: HTMLElement | null }>({})

  const fetchPaperAndPages = async (id: string, initialLoad: boolean = false) => {
    if (initialLoad) setIsLoading(true)
    setError(null)

    try {
      const [paperData, projectsData] = await Promise.all([getPaper(id), getProjects()])
      setPaper(paperData)
      const proj = projectsData.projects.find((p) => p.id === paperData.project_id)
      setProject(proj || null)

      // If text extraction is already completed, fetch page contents
      if (paperData.extraction_status === 'completed') {
        setIsLoadingPages(true)
        try {
          const pagesData = await getPaperPages(id)
          setPages(pagesData.pages)
        } catch {
          // If fetching pages fails, log but don't crash detail view
          setPages([])
        } finally {
          setIsLoadingPages(false)
        }

        // If chunking is completed, also fetch chunks
        if (paperData.chunking_status === 'completed') {
          try {
            const chunksData = await getPaperChunks(id)
            setChunks(chunksData.chunks)
            setChunkSections(chunksData.sections)
          } catch {
            setChunks([])
            setChunkSections([])
          }
        }

        // If chunking and embedding are completed, fetch summary if available
        if (paperData.chunking_status === 'completed' && paperData.embedding_status === 'completed') {
          try {
            const summaryData = await getPaperSummary(id)
            setSummary(summaryData)
          } catch {
            setSummary(null)
          }
        }
      } else {
        setPages([])
      }
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setError(err.message)
      } else {
        setError('Failed to retrieve paper details.')
      }
    } finally {
      if (initialLoad) setIsLoading(false)
    }
  }

  useEffect(() => {
    if (!paperId) {
      setError('Paper ID parameter is required.')
      setIsLoading(false)
      return
    }

    fetchPaperAndPages(paperId, true)
  }, [paperId])

  const handleTriggerExtraction = async () => {
    if (!paper) return
    setIsExtracting(true)
    setExtractionError(null)
    setExtractionSuccessMsg(null)

    try {
      const result = await extractPaper(paper.id)
      setExtractionSuccessMsg(result.message || 'Text successfully extracted.')

      // Refresh paper metadata and load extracted pages
      const updatedPaper = await getPaper(paper.id)
      setPaper(updatedPaper)

      const pagesData = await getPaperPages(paper.id)
      setPages(pagesData.pages)
      setActiveTab('text')
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setExtractionError(err.message)
      } else {
        setExtractionError('An unexpected error occurred during PDF text extraction.')
      }
      // Re-fetch paper to ensure status reflects 'failed'
      try {
        const refreshed = await getPaper(paper.id)
        setPaper(refreshed)
      } catch {
        // ignore
      }
    } finally {
      setIsExtracting(false)
    }
  }

  const handleTriggerProcessing = async () => {
    if (!paper) return
    setIsProcessing(true)
    setProcessingError(null)
    setProcessingSuccessMsg(null)

    try {
      const result = await processPaper(paper.id)
      setProcessingSuccessMsg(result.message || 'Document processed successfully.')

      // Fetch updated paper and chunks
      const [updatedPaper, chunksData] = await Promise.all([
        getPaper(paper.id),
        getPaperChunks(paper.id),
      ])
      setPaper(updatedPaper)
      setChunks(chunksData.chunks)
      setChunkSections(chunksData.sections)
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setProcessingError(err.message)
      } else {
        setProcessingError('An unexpected error occurred during document processing.')
      }
      try {
        const refreshed = await getPaper(paper.id)
        setPaper(refreshed)
      } catch {
        // ignore
      }
    } finally {
      setIsProcessing(false)
    }
  }

  const handleTriggerEmbedding = async () => {
    if (!paper) return
    setIsEmbedding(true)
    setEmbeddingError(null)
    setEmbeddingSuccessMsg(null)

    try {
      const result = await embedPaper(paper.id)
      setEmbeddingSuccessMsg(result.message || 'Semantic embeddings generated and indexed in Qdrant.')

      const updatedPaper = await getPaper(paper.id)
      setPaper(updatedPaper)
      setActiveTab('search')
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setEmbeddingError(err.message)
      } else {
        setEmbeddingError('Failed to generate semantic embeddings.')
      }
      try {
        const refreshed = await getPaper(paper.id)
        setPaper(refreshed)
      } catch {
        // ignore
      }
    } finally {
      setIsEmbedding(false)
    }
  }

  const handleRunSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!paper || !searchQuery.trim()) return

    setIsSearching(true)
    setSearchError(null)

    try {
      const resp = await searchSemantic({
        query: searchQuery.trim(),
        project_id: searchScope === 'project' ? paper.project_id : undefined,
        paper_id: searchScope === 'paper' ? paper.id : undefined,
        limit: searchLimit,
      })
      setSearchResults(resp.results)
      setHasSearched(true)
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setSearchError(err.message)
      } else {
        setSearchError('An unexpected error occurred during semantic search.')
      }
    } finally {
      setIsSearching(false)
    }
  }

  const handleGenerateSummary = async () => {
    if (!paper) return
    setIsGeneratingSummary(true)
    setSummaryError(null)
    setSummarySuccessMsg(null)

    try {
      const result = await generatePaperSummary(paper.id)
      setSummary(result)
      setSummarySuccessMsg('Structured scientific summary generated successfully.')
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setSummaryError(err.message)
      } else {
        setSummaryError('An unexpected error occurred while generating the summary.')
      }
    } finally {
      setIsGeneratingSummary(false)
    }
  }

  const handleCitationClick = (citation: SummaryCitation) => {
    if (!paper) return
    setActiveTab('text')
    setSelectedPageFilter(citation.start_page)
    navigate(`/papers/${paper.id}?tab=extracted-text&page=${citation.start_page}&chunk=${citation.chunk_id}&citation=${citation.source_number}`)
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
  }

  const handleDownload = async () => {
    if (!paper) return
    setIsDownloading(true)
    try {
      await downloadPaperFile(paper.id, paper.original_filename)
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to download paper file.')
    } finally {
      setIsDownloading(false)
    }
  }

  const handleDeleteSubmit = async () => {
    if (!paper) return
    setIsDeleting(true)
    setDeleteError(null)

    try {
      await deletePaper(paper.id)
      setIsDeleteModalOpen(false)
      navigate('/papers')
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setDeleteError(err.message)
      } else {
        setDeleteError('Failed to delete paper.')
      }
    } finally {
      setIsDeleting(false)
    }
  }

  const scrollToPage = (pageNum: number) => {
    setSelectedPageFilter(pageNum)
    const el = pageRefs.current[pageNum]
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  // Synchronize tab from URL parameter if present
  useEffect(() => {
    if (tabParam === 'extracted-text' || tabParam === 'text') {
      setActiveTab('text')
    } else if (tabParam === 'processing') {
      setActiveTab('processing')
    } else if (tabParam === 'search' || tabParam === 'semantic-search') {
      setActiveTab('search')
    } else if (tabParam === 'summary') {
      setActiveTab('summary')
    } else if (tabParam === 'metadata') {
      setActiveTab('metadata')
    }
  }, [tabParam])

  // Synchronize page filter from URL parameters or chunk start page
  useEffect(() => {
    if (pageParam) {
      const parsed = parseInt(pageParam, 10)
      if (!isNaN(parsed) && parsed >= 1) {
        setSelectedPageFilter(parsed)
      } else {
        setSelectedPageFilter('all')
      }
    } else if (chunkParam && chunks.length > 0) {
      const isNumeric = /^\d+$/.test(chunkParam.trim())
      const chunkIdx = isNumeric ? parseInt(chunkParam, 10) : null
      const targetChunk = chunks.find(
        (c) => c.id === chunkParam || (chunkIdx !== null && c.chunk_index === chunkIdx)
      )
      if (targetChunk && targetChunk.start_page >= 1) {
        setSelectedPageFilter(targetChunk.start_page)
      }
    } else if (!chunkParam) {
      setSelectedPageFilter('all')
    }
  }, [pageParam, chunkParam, chunks])

  // Resolve cited chunk and citation label
  const citedChunk = useMemo(() => {
    if (!chunkParam || chunks.length === 0) return null
    const isNumeric = /^\d+$/.test(chunkParam.trim())
    const chunkIdx = isNumeric ? parseInt(chunkParam, 10) : null
    return (
      chunks.find(
        (c) => c.id === chunkParam || (chunkIdx !== null && c.chunk_index === chunkIdx)
      ) || null
    )
  }, [chunkParam, chunks])

  const citationLabel = useMemo(() => {
    if (citationParam && citationParam.trim()) {
      return `Cited Source [${citationParam.trim()}]`
    }
    return 'Cited Evidence'
  }, [citationParam])

  // Auto-scroll cited evidence into view
  useEffect(() => {
    if (isLoading || isLoadingPages) return

    const timer = setTimeout(() => {
      const target = document.getElementById('cited-evidence-target')
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' })
      } else if (typeof selectedPageFilter === 'number' && pageRefs.current[selectedPageFilter]) {
        pageRefs.current[selectedPageFilter]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    }, 200)

    return () => clearTimeout(timer)
  }, [isLoading, isLoadingPages, selectedPageFilter, citedChunk])

  if (isLoading) {
    return (
      <div className="p-12 text-center max-w-xl mx-auto my-16 bg-white rounded-xl border border-[#E2E8F0] shadow-xs">
        <Loader2 className="w-8 h-8 text-[#2563EB] animate-spin mx-auto mb-3" />
        <p className="text-sm font-medium text-[#0F172A]">Loading paper intelligence...</p>
      </div>
    )
  }

  if (error || !paper) {
    return (
      <div className="p-8 text-center max-w-md mx-auto my-16 bg-white rounded-xl border border-rose-200 shadow-xs space-y-4">
        <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
          <AlertCircle className="w-6 h-6" />
        </div>
        <h2 className="text-base font-bold text-[#0F172A]">Paper Not Found</h2>
        <p className="text-xs text-[#64748B]">{error || 'The requested research paper could not be found.'}</p>
        <Link
          to="/papers"
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#2563EB] text-white text-xs font-semibold hover:bg-blue-700 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Return to Paper Library</span>
        </Link>
      </div>
    )
  }

  const createdDateStr = new Date(paper.created_at).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  const extractedDateStr = paper.extracted_at
    ? new Date(paper.extracted_at).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null

  const totalCharacters = pages.reduce((acc, p) => acc + p.character_count, 0)
  const isExtractionDone = paper.extraction_status === 'completed'
  const isExtractionNotStarted = paper.extraction_status === 'not_started'
  const isExtractionFailed = paper.extraction_status === 'failed'
  const isChunkingDone = paper.chunking_status === 'completed'
  const isChunkingNotStarted = !paper.chunking_status || paper.chunking_status === 'not_started'
  const isChunkingFailed = paper.chunking_status === 'failed'
  const isEmbeddingDone = paper.embedding_status === 'completed'
  const isEmbeddingNotStarted = !paper.embedding_status || paper.embedding_status === 'not_started'
  const isEmbeddingFailed = paper.embedding_status === 'failed'

  const filteredChunks =
    selectedSection === 'all'
      ? chunks
      : chunks.filter((c) => (c.section_name || 'Unknown') === selectedSection)

  const displayedPages =
    selectedPageFilter === 'all'
      ? pages
      : pages.filter((p) => p.page_number === selectedPageFilter)

  return (
    <div className="p-4 sm:p-8 max-w-[1560px] mx-auto w-full space-y-6" data-testid="paper-detail-container">
      {/* ==================== TOP DOCUMENT HEADER ==================== */}
      <section className="bg-white rounded-xl border border-[#E2E8F0] shadow-xs p-5 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 min-w-0">
          {/* Back to Library Link */}
          <Link
            to="/papers"
            data-testid="back-to-library-link"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-[#0F172A] transition-colors text-xs font-semibold shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Library</span>
          </Link>

          {/* Title & Academic Meta */}
          <div className="flex flex-col min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1
                className="text-lg sm:text-xl font-bold text-[#0F172A] tracking-tight truncate max-w-2xl"
                data-testid="paper-detail-title"
              >
                {paper.title}
              </h1>

              {/* File Storage Status */}
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-semibold border border-emerald-200">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                <span>Uploaded</span>
              </span>

              {/* Extraction Status Badge */}
              {isExtractionDone && (
                <span
                  data-testid="paper-extraction-status-completed"
                  className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 text-xs font-semibold border border-blue-200"
                >
                  <FileText className="w-3.5 h-3.5 text-blue-600" />
                  <span>Text Extracted ({paper.page_count ?? pages.length} pages)</span>
                </span>
              )}
              {isExtracting && (
                <span
                  data-testid="paper-extraction-status-processing"
                  className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-800 text-xs font-semibold border border-amber-200 animate-pulse"
                >
                  <Loader2 className="w-3.5 h-3.5 text-amber-600 animate-spin" />
                  <span>Extracting text...</span>
                </span>
              )}
              {isExtractionNotStarted && !isExtracting && (
                <span
                  data-testid="paper-extraction-status-not-started"
                  className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 text-xs font-semibold border border-slate-200"
                >
                  <Clock className="w-3.5 h-3.5 text-slate-500" />
                  <span>Not Started</span>
                </span>
              )}
              {isExtractionFailed && !isExtracting && (
                <span
                  data-testid="paper-extraction-status-failed"
                  className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-rose-50 text-rose-700 text-xs font-semibold border border-rose-200"
                >
                  <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
                  <span>Extraction Failed</span>
                </span>
              )}

              {/* Chunking Status Badge */}
              {isChunkingDone && (
                <span
                  data-testid="paper-chunking-status-completed"
                  className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-semibold border border-emerald-200"
                >
                  <Cpu className="w-3.5 h-3.5 text-emerald-600" />
                  <span>{paper.chunk_count ?? chunks.length} Chunks</span>
                </span>
              )}

              {/* Embedding Status Badge */}
              {isEmbeddingDone && (
                <span
                  data-testid="paper-embedding-status-completed"
                  className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-purple-50 text-purple-700 text-xs font-semibold border border-purple-200"
                >
                  <Database className="w-3.5 h-3.5 text-purple-600" />
                  <span>Semantic Index Ready</span>
                </span>
              )}
              {isEmbedding && (
                <span
                  data-testid="paper-embedding-status-processing"
                  className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-800 text-xs font-semibold border border-amber-200 animate-pulse"
                >
                  <Loader2 className="w-3.5 h-3.5 text-amber-600 animate-spin" />
                  <span>Generating embeddings...</span>
                </span>
              )}
              {isEmbeddingFailed && !isEmbedding && (
                <span
                  data-testid="paper-embedding-status-failed"
                  className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-rose-50 text-rose-700 text-xs font-semibold border border-rose-200"
                >
                  <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
                  <span>Embedding Failed</span>
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[#64748B] text-xs">
              <span className="font-mono text-[#0F172A]">{paper.original_filename}</span>
              <span className="opacity-40">·</span>
              <span>{formatFileSize(paper.file_size)}</span>
              <span className="opacity-40">·</span>
              <span className="font-mono">{paper.mime_type}</span>
              <span className="opacity-40">·</span>
              {project ? (
                <Link
                  to={`/projects/${project.id}`}
                  className="font-medium text-[#2563EB] hover:underline flex items-center gap-1"
                >
                  <Folder className="w-3 h-3" />
                  <span>{project.name}</span>
                </Link>
              ) : (
                <span>Assigned Project</span>
              )}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Extract / Re-extract button in top header */}
          {isExtractionNotStarted && (
            <button
              type="button"
              onClick={handleTriggerExtraction}
              disabled={isExtracting}
              data-testid="extract-text-btn"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#2563EB] hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer disabled:opacity-50"
            >
              {isExtracting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Extracting...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Extract Text</span>
                </>
              )}
            </button>
          )}

          {isExtractionDone && (
            <button
              type="button"
              onClick={handleTriggerExtraction}
              disabled={isExtracting}
              data-testid="reextract-text-btn"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-blue-50 border border-blue-200 text-[#2563EB] hover:bg-blue-100 text-xs font-semibold shadow-xs transition-colors cursor-pointer disabled:opacity-50"
              title="Re-run PyMuPDF page extraction"
            >
              {isExtracting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Extracting...</span>
                </>
              ) : (
                <>
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Re-extract Text</span>
                </>
              )}
            </button>
          )}

          {isExtractionFailed && (
            <button
              type="button"
              onClick={handleTriggerExtraction}
              disabled={isExtracting}
              data-testid="retry-extract-btn"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer disabled:opacity-50"
            >
              {isExtracting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Retrying...</span>
                </>
              ) : (
                <>
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Retry Extraction</span>
                </>
              )}
            </button>
          )}

          {/* Ask Research Assistant */}
          {isEmbeddingDone && (
            <Link
              to={`/assistant?projectId=${paper.project_id}&paperId=${paper.id}&scope=paper`}
              data-testid="detail-ask-assistant-btn"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
              title="Ask AI Research Assistant about this paper"
            >
              <Bot className="w-3.5 h-3.5" />
              <span>Ask Assistant</span>
            </Link>
          )}

          <button
            type="button"
            onClick={handleDownload}
            data-testid="detail-download-pdf-btn"
            disabled={isDownloading}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-[#0F172A] text-xs font-semibold shadow-xs transition-colors cursor-pointer"
          >
            {isDownloading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Downloading...</span>
              </>
            ) : (
              <>
                <Download className="w-3.5 h-3.5" />
                <span>Download PDF</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              setDeleteError(null)
              setIsDeleteModalOpen(true)
            }}
            data-testid="detail-delete-paper-btn"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-white border border-rose-200 text-rose-700 hover:bg-rose-50 text-xs font-semibold shadow-xs transition-colors cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5 text-rose-600" />
            <span>Delete Paper</span>
          </button>
        </div>
      </section>

      {/* Extraction Success / Error Notifications */}
      {extractionSuccessMsg && (
        <div
          data-testid="extraction-success-banner"
          className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="font-medium">{extractionSuccessMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setExtractionSuccessMsg(null)}
            className="text-emerald-600 hover:text-emerald-800 p-1"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {(extractionError || paper.extraction_error) && (
        <div
          data-testid="extraction-error-banner"
          className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <div>
              <span className="font-semibold block">Text Extraction Notice:</span>
              <span>{extractionError || paper.extraction_error}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setExtractionError(null)}
            className="text-rose-600 hover:text-rose-800 p-1"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-[#E2E8F0] pb-2">
        <button
          type="button"
          onClick={() => setActiveTab('text')}
          data-testid="tab-extracted-text"
          className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
            activeTab === 'text'
              ? 'bg-[#2563EB] text-white shadow-xs'
              : 'text-[#64748B] hover:text-[#0F172A] hover:bg-slate-100'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>Extracted Text</span>
          {isExtractionDone && (
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                activeTab === 'text' ? 'bg-blue-700 text-white' : 'bg-slate-200 text-slate-700'
              }`}
            >
              {paper.page_count ?? pages.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('processing')}
          data-testid="tab-processing"
          className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
            activeTab === 'processing'
              ? 'bg-[#2563EB] text-white shadow-xs'
              : 'text-[#64748B] hover:text-[#0F172A] hover:bg-slate-100'
          }`}
        >
          <Cpu className="w-4 h-4" />
          <span>Document Processing</span>
          {isChunkingDone && (
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                activeTab === 'processing' ? 'bg-blue-700 text-white' : 'bg-emerald-100 text-emerald-700'
              }`}
            >
              {paper.chunk_count}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('search')}
          data-testid="tab-semantic-search"
          className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
            activeTab === 'search'
              ? 'bg-[#2563EB] text-white shadow-xs'
              : 'text-[#64748B] hover:text-[#0F172A] hover:bg-slate-100'
          }`}
        >
          <Search className="w-4 h-4" />
          <span>Semantic Search</span>
          {isEmbeddingDone && (
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                activeTab === 'search' ? 'bg-blue-700 text-white' : 'bg-purple-100 text-purple-700'
              }`}
            >
              Ready
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('summary')}
          data-testid="tab-summary"
          className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
            activeTab === 'summary'
              ? 'bg-[#2563EB] text-white shadow-xs'
              : 'text-[#64748B] hover:text-[#0F172A] hover:bg-slate-100'
          }`}
        >
          <Sparkles className="w-4 h-4" />
          <span>Summary</span>
          {summary && (
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                activeTab === 'summary' ? 'bg-blue-700 text-white' : 'bg-emerald-100 text-emerald-700'
              }`}
            >
              Ready
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('metadata')}
          className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
            activeTab === 'metadata'
              ? 'bg-[#2563EB] text-white shadow-xs'
              : 'text-[#64748B] hover:text-[#0F172A] hover:bg-slate-100'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>Document Metadata</span>
        </button>
      </div>

      {/* ==================== MAIN WORKSPACE GRID ==================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN: Main Content Area (8 cols) */}
        <div className="lg:col-span-8 space-y-6">
          {activeTab === 'summary' ? (
            /* ==================== SUMMARY TAB (MODULE 7.1) ==================== */
            <div className="space-y-6" data-testid="summary-tab-container">
              {/* Notifications */}
              {summarySuccessMsg && (
                <div
                  data-testid="summary-success-banner"
                  className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center justify-between"
                >
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span className="font-medium">{summarySuccessMsg}</span>
                  </div>
                  <button type="button" onClick={() => setSummarySuccessMsg(null)} className="text-emerald-600 hover:text-emerald-800 p-1">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
              {summaryError && (
                <div
                  data-testid="summary-error-banner"
                  className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center justify-between"
                >
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                    <div>
                      <span className="font-semibold block">Summary Generation Error:</span>
                      <span>{summaryError}</span>
                    </div>
                  </div>
                  <button type="button" onClick={() => setSummaryError(null)} className="text-rose-600 hover:text-rose-800 p-1">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* Preconditions */}
              {!isExtractionDone ? (
                <div className="bg-white rounded-2xl border border-amber-200 shadow-xs p-8 text-center space-y-4">
                  <div className="w-14 h-14 rounded-2xl bg-amber-50 border border-amber-100 text-amber-600 flex items-center justify-center mx-auto">
                    <AlertCircle className="w-7 h-7" />
                  </div>
                  <div className="space-y-2">
                    <h2 className="text-lg font-bold text-[#0F172A]">Text Extraction Required</h2>
                    <p className="text-xs text-[#64748B] max-w-md mx-auto">
                      Structured summarization requires text extraction to be completed first. Switch to "Extracted Text" to extract content.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('text')}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-600 text-white text-xs font-semibold hover:bg-amber-700 transition-colors cursor-pointer"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>Go to Extracted Text</span>
                  </button>
                </div>
              ) : !isChunkingDone ? (
                <div className="bg-white rounded-2xl border border-amber-200 shadow-xs p-8 text-center space-y-4">
                  <div className="w-14 h-14 rounded-2xl bg-amber-50 border border-amber-100 text-amber-600 flex items-center justify-center mx-auto">
                    <Cpu className="w-7 h-7" />
                  </div>
                  <div className="space-y-2">
                    <h2 className="text-lg font-bold text-[#0F172A]">Document Processing Required</h2>
                    <p className="text-xs text-[#64748B] max-w-md mx-auto">
                      Structured summarization requires document chunking to be completed first. Switch to the "Document Processing" tab to process this paper.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('processing')}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-600 text-white text-xs font-semibold hover:bg-amber-700 transition-colors cursor-pointer"
                  >
                    <Cpu className="w-3.5 h-3.5" />
                    <span>Go to Document Processing</span>
                  </button>
                </div>
              ) : !isEmbeddingDone ? (
                <div className="bg-white rounded-2xl border border-purple-200 shadow-xs p-8 text-center space-y-4">
                  <div className="w-14 h-14 rounded-2xl bg-purple-50 border border-purple-100 text-purple-600 flex items-center justify-center mx-auto">
                    <Database className="w-7 h-7" />
                  </div>
                  <div className="space-y-2">
                    <h2 className="text-lg font-bold text-[#0F172A]">Semantic Indexing Required</h2>
                    <p className="text-xs text-[#64748B] max-w-md mx-auto">
                      Structured summarization relies on multi-dimensional semantic retrieval across paper sections. Generate embeddings in the Semantic Search tab first.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('search')}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-purple-600 text-white text-xs font-semibold hover:bg-purple-700 transition-colors cursor-pointer"
                  >
                    <Database className="w-3.5 h-3.5" />
                    <span>Go to Semantic Search</span>
                  </button>
                </div>
              ) : isGeneratingSummary ? (
                /* Generating in progress */
                <div
                  data-testid="summary-in-progress-card"
                  className="bg-white rounded-2xl border border-indigo-200 shadow-xs p-10 text-center space-y-4"
                >
                  <Loader2 className="w-10 h-10 text-indigo-600 animate-spin mx-auto" />
                  <div className="space-y-1">
                    <h3 className="text-base font-bold text-[#0F172A]">Generating Grounded Summary...</h3>
                    <p className="text-xs text-[#64748B] max-w-md mx-auto">
                      Retrieving multi-dimensional evidence across paper sections and synthesizing structured 6-dimensional scientific summary using Groq LLM.
                    </p>
                  </div>
                  <span className="inline-block px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 text-xs font-semibold animate-pulse font-mono">
                    status: analyzing evidence & generating
                  </span>
                </div>
              ) : !summary ? (
                /* Not yet generated */
                <div
                  data-testid="summary-not-started-card"
                  className="bg-white rounded-2xl border border-[#E2E8F0] shadow-xs p-8 sm:p-10 text-center space-y-6"
                >
                  <div className="w-14 h-14 rounded-2xl bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center mx-auto shadow-xs">
                    <Sparkles className="w-7 h-7" />
                  </div>
                  <div className="space-y-2 max-w-lg mx-auto">
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 text-slate-700 text-xs font-semibold">
                      <Clock className="w-3.5 h-3.5 text-slate-500" />
                      <span>Structured Summary: Not Generated</span>
                    </div>
                    <h2 className="text-xl font-bold text-[#0F172A] tracking-tight">
                      Generate Evidence-Grounded Scientific Summary
                    </h2>
                    <p className="text-xs sm:text-sm text-[#64748B] leading-relaxed">
                      Synthesize this paper across 6 core scientific dimensions: Research Objective, Methodology, Dataset & Setup, Key Findings, Limitations, and Future Work. Every statement is strictly grounded in verifiable source citations.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleGenerateSummary}
                    disabled={isGeneratingSummary}
                    data-testid="generate-summary-btn"
                    className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-semibold shadow-md transition-all cursor-pointer disabled:opacity-50"
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>Generate Summary</span>
                  </button>
                </div>
              ) : (
                /* Completed Summary View */
                <div className="space-y-6" data-testid="summary-content-container">
                  {/* Summary Control Header */}
                  <div className="bg-white rounded-xl border border-[#E2E8F0] shadow-xs p-4 flex flex-wrap items-center justify-between gap-4">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-[#0F172A] text-sm">6-Dimensional Scientific Summary</span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          Grounded
                        </span>
                      </div>
                      <p className="text-xs text-[#64748B]">
                        Model: <span className="font-mono font-medium text-slate-700">{summary.model_name}</span> ({summary.model_provider}) • Last updated: {new Date(summary.updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={handleGenerateSummary}
                      disabled={isGeneratingSummary}
                      data-testid="regenerate-summary-btn"
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-[#0F172A] text-xs font-semibold border border-slate-200 transition-colors cursor-pointer disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isGeneratingSummary ? 'animate-spin' : ''}`} />
                      <span>Regenerate Summary</span>
                    </button>
                  </div>

                  {/* 6 Structured Scientific Cards */}
                  <div className="space-y-4">
                    {[
                      {
                        key: 'objective',
                        title: 'Research Objective / Problem',
                        icon: Target,
                        accent: 'border-blue-200 bg-blue-50/50 text-blue-700',
                        data: summary.summary.objective,
                        testId: 'summary-card-objective',
                      },
                      {
                        key: 'methodology',
                        title: 'Methodology / Approach',
                        icon: Cpu,
                        accent: 'border-purple-200 bg-purple-50/50 text-purple-700',
                        data: summary.summary.methodology,
                        testId: 'summary-card-methodology',
                      },
                      {
                        key: 'dataset_setup',
                        title: 'Dataset & Experimental Setup',
                        icon: Database,
                        accent: 'border-cyan-200 bg-cyan-50/50 text-cyan-700',
                        data: summary.summary.dataset_setup,
                        testId: 'summary-card-dataset_setup',
                      },
                      {
                        key: 'key_findings',
                        title: 'Key Findings & Results',
                        icon: TrendingUp,
                        accent: 'border-emerald-200 bg-emerald-50/50 text-emerald-700',
                        data: summary.summary.key_findings,
                        testId: 'summary-card-key_findings',
                      },
                      {
                        key: 'limitations',
                        title: 'Limitations & Constraints',
                        icon: AlertTriangle,
                        accent: 'border-amber-200 bg-amber-50/50 text-amber-700',
                        data: summary.summary.limitations,
                        testId: 'summary-card-limitations',
                      },
                      {
                        key: 'future_work',
                        title: 'Future Work & Research Directions',
                        icon: Sparkles,
                        accent: 'border-indigo-200 bg-indigo-50/50 text-indigo-700',
                        data: summary.summary.future_work,
                        testId: 'summary-card-future_work',
                      },
                    ].map((dim) => (
                      <section
                        key={dim.key}
                        data-testid={dim.testId}
                        className="bg-white rounded-xl border border-[#E2E8F0] shadow-xs p-5 space-y-3.5 hover:border-slate-300 transition-all"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className={`p-1.5 rounded-lg border ${dim.accent}`}>
                              <dim.icon className="w-4 h-4 shrink-0" />
                            </div>
                            <h3 className="text-sm font-bold text-[#0F172A]">{dim.title}</h3>
                          </div>
                          {dim.data.citations && dim.data.citations.length > 0 && (
                            <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                              {dim.data.citations.length} cited source{dim.data.citations.length > 1 ? 's' : ''}
                            </span>
                          )}
                        </div>

                        {dim.data.summary === 'Not clearly stated in the paper.' ? (
                          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-[#64748B] italic flex items-center gap-2">
                            <AlertCircle className="w-4 h-4 text-slate-400 shrink-0" />
                            <span>Not clearly stated in the paper.</span>
                          </div>
                        ) : (
                          <p className="text-xs sm:text-sm text-[#334155] leading-relaxed whitespace-pre-wrap">
                            {dim.data.summary}
                          </p>
                        )}

                        {dim.data.citations && dim.data.citations.length > 0 && (
                          <div className="pt-2 border-t border-slate-100 space-y-1.5">
                            <span className="text-[11px] font-semibold uppercase tracking-wider text-[#64748B] block">
                              Supporting Evidence
                            </span>
                            <div className="flex flex-wrap gap-2">
                              {dim.data.citations.map((cite, cIdx) => (
                                <button
                                  key={`${cite.chunk_id}-${cIdx}`}
                                  type="button"
                                  onClick={() => handleCitationClick(cite)}
                                  data-testid={`citation-btn-${dim.key}-${cite.source_number}`}
                                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 hover:border-blue-300 transition-all cursor-pointer group shadow-2xs"
                                  title={`Jump to Page ${cite.start_page} supporting evidence`}
                                >
                                  <span className="font-bold font-mono">[{cite.source_number}]</span>
                                  <span>Page {cite.start_page}</span>
                                  <span className="text-blue-400">•</span>
                                  <span className="text-blue-600">{cite.section_name}</span>
                                  <ExternalLink className="w-3 h-3 text-blue-500 opacity-60 group-hover:opacity-100 ml-0.5" />
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </section>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : activeTab === 'search' ? (
            /* ==================== SEMANTIC SEARCH TAB ==================== */
            <div className="space-y-6" data-testid="semantic-search-container">
              {/* Notifications */}
              {embeddingSuccessMsg && (
                <div
                  data-testid="embedding-success-banner"
                  className="p-3.5 rounded-xl bg-purple-50 border border-purple-200 text-purple-800 text-xs flex items-center justify-between"
                >
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-purple-600 shrink-0" />
                    <span className="font-medium">{embeddingSuccessMsg}</span>
                  </div>
                  <button type="button" onClick={() => setEmbeddingSuccessMsg(null)} className="text-purple-600 hover:text-purple-800 p-1">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
              {(embeddingError || paper.embedding_error) && (
                <div
                  data-testid="embedding-error-banner"
                  className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center justify-between"
                >
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                    <div>
                      <span className="font-semibold block">Vector Indexing Error:</span>
                      <span>{embeddingError || paper.embedding_error}</span>
                    </div>
                  </div>
                  <button type="button" onClick={() => setEmbeddingError(null)} className="text-rose-600 hover:text-rose-800 p-1">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* Preconditions */}
              {!isChunkingDone ? (
                <div className="bg-white rounded-2xl border border-amber-200 shadow-xs p-8 text-center space-y-4">
                  <div className="w-14 h-14 rounded-2xl bg-amber-50 border border-amber-100 text-amber-600 flex items-center justify-center mx-auto">
                    <AlertCircle className="w-7 h-7" />
                  </div>
                  <div className="space-y-2">
                    <h2 className="text-lg font-bold text-[#0F172A]">Document Processing Required</h2>
                    <p className="text-xs text-[#64748B] max-w-md mx-auto">
                      Semantic indexing requires document chunking to be completed first. Switch to the "Document Processing" tab to process this paper into chunks.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('processing')}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-600 text-white text-xs font-semibold hover:bg-amber-700 transition-colors cursor-pointer"
                  >
                    <Cpu className="w-3.5 h-3.5" />
                    <span>Go to Document Processing</span>
                  </button>
                </div>
              ) : isEmbedding ? (
                <div
                  data-testid="embedding-in-progress-card"
                  className="bg-white rounded-2xl border border-purple-200 shadow-xs p-10 text-center space-y-4"
                >
                  <Loader2 className="w-10 h-10 text-purple-600 animate-spin mx-auto" />
                  <div className="space-y-1">
                    <h3 className="text-base font-bold text-[#0F172A]">Generating Semantic Embeddings...</h3>
                    <p className="text-xs text-[#64748B] max-w-md mx-auto">
                      Vectorizing {paper.chunk_count ?? chunks.length} document chunks with SentenceTransformers (all-MiniLM-L6-v2) and upserting into Qdrant collection.
                    </p>
                  </div>
                  <span className="inline-block px-3 py-1 rounded-full bg-purple-50 text-purple-700 text-xs font-semibold animate-pulse font-mono">
                    status: indexing vectors
                  </span>
                </div>
              ) : isEmbeddingNotStarted ? (
                <div
                  data-testid="embedding-not-started-card"
                  className="bg-white rounded-2xl border border-[#E2E8F0] shadow-xs p-8 sm:p-10 text-center space-y-6"
                >
                  <div className="w-14 h-14 rounded-2xl bg-purple-50 border border-purple-100 text-purple-600 flex items-center justify-center mx-auto shadow-xs">
                    <Database className="w-7 h-7" />
                  </div>
                  <div className="space-y-2 max-w-lg mx-auto">
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 text-slate-700 text-xs font-semibold">
                      <Clock className="w-3.5 h-3.5 text-slate-500" />
                      <span>Semantic Index: Not Started</span>
                    </div>
                    <h2 className="text-xl font-bold text-[#0F172A] tracking-tight">
                      Index Chunks into Qdrant Vector Store
                    </h2>
                    <p className="text-xs sm:text-sm text-[#64748B] leading-relaxed">
                      {paper.chunk_count ?? chunks.length} document chunks are ready. Generate dense 384-dimensional vector embeddings to enable semantic similarity search and cross-paper retrieval.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleTriggerEmbedding}
                    disabled={isEmbedding}
                    data-testid="create-semantic-index-btn"
                    className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs sm:text-sm font-semibold shadow-md transition-all cursor-pointer disabled:opacity-50"
                  >
                    <Database className="w-4 h-4" />
                    <span>Create Semantic Index</span>
                  </button>
                  <div className="pt-4 border-t border-[#E2E8F0] grid grid-cols-1 sm:grid-cols-3 gap-4 text-left">
                    <div className="p-3 rounded-lg bg-slate-50 border border-slate-100">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-[#0F172A] mb-1">
                        <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                        <span>Dense Vectors</span>
                      </div>
                      <p className="text-[11px] text-[#64748B]">384-dimensional normalized embeddings using SentenceTransformers.</p>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-50 border border-slate-100">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-[#0F172A] mb-1">
                        <Database className="w-3.5 h-3.5 text-purple-600" />
                        <span>Qdrant Store</span>
                      </div>
                      <p className="text-[11px] text-[#64748B]">Fast Cosine similarity search with payload filtering and strict user isolation.</p>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-50 border border-slate-100">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-[#0F172A] mb-1">
                        <Layers className="w-3.5 h-3.5 text-purple-600" />
                        <span>Full Traceability</span>
                      </div>
                      <p className="text-[11px] text-[#64748B]">Every vector maps 1:1 to original chunks, sections, and PDF page numbers.</p>
                    </div>
                  </div>
                </div>
              ) : isEmbeddingFailed ? (
                <div className="bg-white rounded-2xl border border-rose-200 shadow-xs p-8 text-center space-y-4">
                  <div className="w-14 h-14 rounded-2xl bg-rose-50 border border-rose-100 text-rose-600 flex items-center justify-center mx-auto">
                    <AlertCircle className="w-7 h-7" />
                  </div>
                  <div className="space-y-2">
                    <h2 className="text-lg font-bold text-[#0F172A]">Embedding Generation Failed</h2>
                    <p className="text-xs text-[#64748B] max-w-md mx-auto">
                      {embeddingError || paper.embedding_error || 'An error occurred while vectorizing chunks and upserting into Qdrant.'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleTriggerEmbedding}
                    disabled={isEmbedding}
                    data-testid="retry-embed-btn"
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-rose-600 text-white text-xs font-semibold hover:bg-rose-700 transition-colors cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Retry Embedding Generation</span>
                  </button>
                </div>
              ) : (
                /* SEMANTIC SEARCH INTERFACE (When Embedding is Completed) */
                <div className="space-y-6">
                  {/* Search Query Control Panel */}
                  <div className="bg-white rounded-xl border border-[#E2E8F0] shadow-xs p-5 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                      <div>
                        <h2 className="text-sm font-bold text-[#0F172A] flex items-center gap-2">
                          <Search className="w-4 h-4 text-blue-600" />
                          <span>Semantic Vector Retrieval</span>
                        </h2>
                        <p className="text-xs text-[#64748B]">
                          Query document chunks using natural language meaning rather than exact keywords.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleTriggerEmbedding}
                        disabled={isEmbedding}
                        data-testid="re-embed-btn"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100 text-xs font-medium transition-colors cursor-pointer self-start sm:self-auto"
                        title="Re-generate embeddings and re-index vectors in Qdrant"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Re-index Vectors</span>
                      </button>
                    </div>

                    <form onSubmit={handleRunSearch} className="space-y-3">
                      <div className="flex flex-col sm:flex-row items-stretch gap-2">
                        <div className="relative flex-1">
                          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
                          <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            data-testid="semantic-query-input"
                            placeholder="Enter research query (e.g. neural network optimization, loss function, convergence rates)..."
                            className="w-full pl-9 pr-4 py-2 text-xs sm:text-sm rounded-lg border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-[#0F172A]"
                          />
                        </div>
                        <button
                          type="submit"
                          disabled={isSearching || !searchQuery.trim()}
                          data-testid="run-semantic-search-btn"
                          className="inline-flex items-center justify-center gap-1.5 px-5 py-2 rounded-lg bg-[#2563EB] hover:bg-blue-700 text-white text-xs sm:text-sm font-semibold shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                        >
                          {isSearching ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              <span>Searching...</span>
                            </>
                          ) : (
                            <>
                              <Search className="w-4 h-4" />
                              <span>Search</span>
                            </>
                          )}
                        </button>
                      </div>

                      {/* Search Options Bar: Scope & Result Limit */}
                      <div className="flex flex-wrap items-center justify-between gap-3 pt-1 text-xs text-[#64748B]">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-[#0F172A]">Scope:</span>
                          <button
                            type="button"
                            onClick={() => setSearchScope('paper')}
                            data-testid="scope-paper-btn"
                            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                              searchScope === 'paper'
                                ? 'bg-blue-100 text-blue-800 font-bold border border-blue-200'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                          >
                            This Paper
                          </button>
                          <button
                            type="button"
                            onClick={() => setSearchScope('project')}
                            data-testid="scope-project-btn"
                            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                              searchScope === 'project'
                                ? 'bg-blue-100 text-blue-800 font-bold border border-blue-200'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                          >
                            Entire Project {project ? `(${project.name})` : ''}
                          </button>
                        </div>

                        <div className="flex items-center gap-2">
                          <span>Max Chunks:</span>
                          <select
                            value={searchLimit}
                            onChange={(e) => setSearchLimit(Number(e.target.value))}
                            data-testid="search-limit-select"
                            className="px-2 py-0.5 rounded border border-slate-200 bg-white text-xs font-medium text-[#0F172A]"
                          >
                            <option value={3}>Top 3</option>
                            <option value={5}>Top 5</option>
                            <option value={10}>Top 10</option>
                            <option value={20}>Top 20</option>
                          </select>
                        </div>
                      </div>
                    </form>
                  </div>

                  {/* Search Error Notice */}
                  {searchError && (
                    <div
                      data-testid="search-error-banner"
                      className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                        <span>{searchError}</span>
                      </div>
                      <button type="button" onClick={() => setSearchError(null)} className="text-rose-600 hover:text-rose-800 p-1">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}

                  {/* Search Results Area */}
                  {isSearching ? (
                    <div className="p-12 text-center bg-white rounded-xl border border-[#E2E8F0] shadow-xs space-y-3">
                      <Loader2 className="w-7 h-7 text-[#2563EB] animate-spin mx-auto" />
                      <p className="text-xs font-medium text-[#0F172A]">Embedding query & retrieving cosine-similar chunks from Qdrant...</p>
                    </div>
                  ) : hasSearched ? (
                    <div className="space-y-4" data-testid="search-results-container">
                      <div className="flex items-center justify-between text-xs text-[#64748B] px-1">
                        <span>
                          Retrieved <strong className="text-[#0F172A]">{searchResults.length}</strong> relevant chunks for: <em className="text-[#0F172A]">"{searchQuery}"</em>
                        </span>
                        <span className="font-mono text-[11px] bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                          Metric: Cosine Distance
                        </span>
                      </div>

                      {searchResults.length === 0 ? (
                        <div
                          data-testid="no-search-results-card"
                          className="p-8 text-center bg-white rounded-xl border border-[#E2E8F0] shadow-xs space-y-2"
                        >
                          <Search className="w-8 h-8 text-slate-300 mx-auto" />
                          <h4 className="text-sm font-semibold text-[#0F172A]">No Matching Chunks Found</h4>
                          <p className="text-xs text-[#64748B] max-w-md mx-auto">
                            No document chunks met the semantic similarity threshold. Try alternative scientific terminology or broaden your query.
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-3" data-testid="search-results-list">
                          {searchResults.map((result, idx) => {
                            const scorePct = Math.round(result.score * 100)
                            const scoreBadgeColor =
                              result.score >= 0.75
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : result.score >= 0.5
                                ? 'bg-amber-50 text-amber-700 border-amber-200'
                                : 'bg-slate-100 text-slate-700 border-slate-200'

                            return (
                              <article
                                key={result.chunk_id || idx}
                                data-testid={`search-result-card-${idx}`}
                                className="bg-white rounded-xl border border-[#E2E8F0] shadow-xs p-4 space-y-3 hover:border-slate-300 transition-all"
                              >
                                {/* Result Card Header */}
                                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span
                                      data-testid={`result-score-${idx}`}
                                      className={`px-2.5 py-0.5 rounded-full text-xs font-bold font-mono border ${scoreBadgeColor}`}
                                      title={`Cosine similarity score: ${result.score}`}
                                    >
                                      Similarity: {result.score.toFixed(3)} ({scorePct}%)
                                    </span>

                                    <span
                                      data-testid={`result-section-${idx}`}
                                      className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200 font-semibold"
                                    >
                                      {result.section_name || 'Unknown'}
                                    </span>

                                    <span
                                      data-testid={`result-pages-${idx}`}
                                      className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200 font-mono"
                                    >
                                      {result.start_page === result.end_page
                                        ? `Page ${result.start_page}`
                                        : `Pages ${result.start_page}–${result.end_page}`}
                                    </span>

                                    <span
                                      data-testid={`result-chunk-${idx}`}
                                      className="text-[#64748B] text-[11px] font-mono"
                                    >
                                      Chunk #{result.chunk_index + 1}
                                    </span>
                                  </div>

                                  {searchScope === 'project' && (
                                    <span
                                      data-testid={`result-paper-title-${idx}`}
                                      className="text-xs font-medium text-slate-600 truncate max-w-xs"
                                      title={result.paper_title}
                                    >
                                      {result.paper_title}
                                    </span>
                                  )}
                                </div>

                                {/* Text Snippet */}
                                <div
                                  data-testid={`result-text-${idx}`}
                                  className="text-xs sm:text-sm text-[#0F172A] leading-relaxed bg-slate-50/70 p-3.5 rounded-lg border border-slate-100 font-sans whitespace-pre-wrap max-h-48 overflow-y-auto"
                                >
                                  {result.text}
                                </div>

                                {/* Footer & Traceability Navigation */}
                                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 text-[11px] text-[#64748B]">
                                  <div className="flex items-center gap-3">
                                    <span>{result.character_count.toLocaleString()} chars</span>
                                    {result.token_count_estimate && (
                                      <span>~{result.token_count_estimate} tokens</span>
                                    )}
                                  </div>

                                  <button
                                    type="button"
                                    onClick={() => {
                                      setActiveTab('text')
                                      scrollToPage(result.start_page)
                                    }}
                                    className="inline-flex items-center gap-1 text-[#2563EB] hover:underline font-medium cursor-pointer"
                                  >
                                    <ExternalLink className="w-3 h-3" />
                                    <span>Jump to Page {result.start_page} in Extracted Text</span>
                                  </button>
                                </div>
                              </article>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  ) : (
                    /* Initial prompt when user hasn't queried yet */
                    <div className="bg-slate-50 rounded-xl border border-dashed border-slate-200 p-8 text-center space-y-3">
                      <Search className="w-8 h-8 text-slate-300 mx-auto" />
                      <div className="space-y-1">
                        <h4 className="text-sm font-semibold text-[#0F172A]">Ready for Semantic Search</h4>
                        <p className="text-xs text-[#64748B] max-w-md mx-auto">
                          Try searching for key concepts, experimental methodologies, or research conclusions from this paper.
                        </p>
                      </div>
                      <div className="flex flex-wrap justify-center gap-2 pt-2">
                        {['methods and optimization', 'experimental results and evaluation', 'theoretical framework and background'].map((sample) => (
                          <button
                            key={sample}
                            type="button"
                            onClick={() => {
                              setSearchQuery(sample)
                            }}
                            className="px-2.5 py-1 rounded-full bg-white border border-slate-200 text-slate-700 hover:border-blue-300 hover:text-blue-700 text-xs font-medium transition-colors cursor-pointer"
                          >
                            "{sample}"
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : activeTab === 'processing' ? (
            /* ==================== DOCUMENT PROCESSING TAB ==================== */
            <div className="space-y-6" data-testid="processing-tab-view">
              {/* Processing notification banners */}
              {processingSuccessMsg && (
                <div
                  data-testid="processing-success-banner"
                  className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center justify-between"
                >
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span className="font-medium">{processingSuccessMsg}</span>
                  </div>
                  <button type="button" onClick={() => setProcessingSuccessMsg(null)} className="text-emerald-600 hover:text-emerald-800 p-1">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
              {(processingError || paper.chunking_error) && (
                <div
                  data-testid="processing-error-banner"
                  className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center justify-between"
                >
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                    <div>
                      <span className="font-semibold block">Processing Error:</span>
                      <span>{processingError || paper.chunking_error}</span>
                    </div>
                  </div>
                  <button type="button" onClick={() => setProcessingError(null)} className="text-rose-600 hover:text-rose-800 p-1">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* Prerequisite check: Extraction must be completed */}
              {!isExtractionDone ? (
                <div className="bg-white rounded-2xl border border-amber-200 shadow-xs p-8 text-center space-y-4">
                  <div className="w-14 h-14 rounded-2xl bg-amber-50 border border-amber-100 text-amber-600 flex items-center justify-center mx-auto">
                    <AlertCircle className="w-7 h-7" />
                  </div>
                  <div className="space-y-2">
                    <h2 className="text-lg font-bold text-[#0F172A]">Text Extraction Required</h2>
                    <p className="text-xs text-[#64748B] max-w-md mx-auto">
                      Document processing requires text extraction to be completed first. Switch to the "Extracted Text" tab and run extraction.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('text')}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-600 text-white text-xs font-semibold hover:bg-amber-700 transition-colors cursor-pointer"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>Go to Extracted Text</span>
                  </button>
                </div>
              ) : isProcessing ? (
                /* STATE 2: Processing in progress */
                <div
                  data-testid="processing-in-progress-card"
                  className="bg-white rounded-2xl border border-blue-200 shadow-xs p-10 text-center space-y-4"
                >
                  <Loader2 className="w-10 h-10 text-[#2563EB] animate-spin mx-auto" />
                  <div className="space-y-1">
                    <h3 className="text-base font-bold text-[#0F172A]">Processing document...</h3>
                    <p className="text-xs text-[#64748B] max-w-md mx-auto">
                      Running text cleaning, scientific section detection, and section-aware chunking.
                    </p>
                  </div>
                  <span className="inline-block px-3 py-1 rounded-full bg-blue-50 text-[#2563EB] text-xs font-semibold animate-pulse font-mono">
                    status: processing
                  </span>
                </div>
              ) : isChunkingNotStarted ? (
                /* STATE 1: Not started */
                <div
                  data-testid="processing-not-started-card"
                  className="bg-white rounded-2xl border border-[#E2E8F0] shadow-xs p-8 sm:p-10 text-center space-y-6"
                >
                  <div className="w-14 h-14 rounded-2xl bg-blue-50 border border-blue-100 text-[#2563EB] flex items-center justify-center mx-auto shadow-xs">
                    <Cpu className="w-7 h-7" />
                  </div>
                  <div className="space-y-2 max-w-lg mx-auto">
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 text-slate-700 text-xs font-semibold">
                      <Clock className="w-3.5 h-3.5 text-slate-500" />
                      <span>Processing Status: Not Started</span>
                    </div>
                    <h2 className="text-xl font-bold text-[#0F172A] tracking-tight">
                      Process Document into Research Chunks
                    </h2>
                    <p className="text-xs sm:text-sm text-[#64748B] leading-relaxed">
                      Text extraction is complete. Run document processing to clean text, detect scientific sections, and split the paper into overlapping chunks ready for research workflows.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleTriggerProcessing}
                    disabled={isProcessing}
                    data-testid="process-document-btn"
                    className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-[#2563EB] hover:bg-blue-700 text-white text-xs sm:text-sm font-semibold shadow-md transition-all cursor-pointer disabled:opacity-50"
                  >
                    <Cpu className="w-4 h-4" />
                    <span>Process Document</span>
                  </button>
                  <div className="pt-4 border-t border-[#E2E8F0] grid grid-cols-1 sm:grid-cols-3 gap-4 text-left">
                    <div className="p-3 rounded-lg bg-slate-50 border border-slate-100">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-[#0F172A] mb-1">
                        <Sparkles className="w-3.5 h-3.5 text-[#2563EB]" />
                        <span>Text Cleaning</span>
                      </div>
                      <p className="text-[11px] text-[#64748B]">Normalizes whitespace and control characters while preserving equations and citations.</p>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-50 border border-slate-100">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-[#0F172A] mb-1">
                        <Filter className="w-3.5 h-3.5 text-[#2563EB]" />
                        <span>Section Detection</span>
                      </div>
                      <p className="text-[11px] text-[#64748B]">Deterministic regex detection of scientific headings (Abstract, Methods, Results, etc.).</p>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-50 border border-slate-100">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-[#0F172A] mb-1">
                        <Layers className="w-3.5 h-3.5 text-[#2563EB]" />
                        <span>Section-aware Chunks</span>
                      </div>
                      <p className="text-[11px] text-[#64748B]">Overlapping paragraph-boundary chunks with cross-page section continuity.</p>
                    </div>
                  </div>
                </div>
              ) : isChunkingFailed ? (
                /* STATE: Failed */
                <div className="bg-white rounded-2xl border border-rose-200 shadow-xs p-8 text-center space-y-4">
                  <div className="w-14 h-14 rounded-2xl bg-rose-50 border border-rose-100 text-rose-600 flex items-center justify-center mx-auto">
                    <AlertCircle className="w-7 h-7" />
                  </div>
                  <h2 className="text-lg font-bold text-[#0F172A]">Processing Failed</h2>
                  {paper.chunking_error && (
                    <p className="text-xs text-rose-700 font-mono bg-rose-50 p-3 rounded-lg border border-rose-200">{paper.chunking_error}</p>
                  )}
                  <button
                    type="button"
                    onClick={handleTriggerProcessing}
                    disabled={isProcessing}
                    data-testid="process-document-btn"
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Retry Processing</span>
                  </button>
                </div>
              ) : (
                /* STATE 3: Completed */
                <div className="space-y-6" data-testid="processing-completed-view">
                  {/* Metrics card */}
                  <div
                    data-testid="processing-metrics-card"
                    className="bg-white rounded-xl border border-[#E2E8F0] shadow-xs p-5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
                      <div>
                        <h3 className="text-sm font-bold text-[#0F172A]">Document Processing Complete</h3>
                        <p className="text-xs text-[#64748B] mt-0.5">Scientific sections identified and RAG-ready chunks generated.</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={handleTriggerProcessing}
                          disabled={isProcessing}
                          data-testid="reprocess-document-btn"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 border border-blue-200 text-[#2563EB] hover:bg-blue-100 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          <span>Reprocess</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowChunkInspector((v) => !v)}
                          data-testid="inspect-chunks-btn"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#2563EB] text-white text-xs font-semibold hover:bg-blue-700 transition-colors cursor-pointer"
                        >
                          <Layers className="w-3.5 h-3.5" />
                          <span>{showChunkInspector ? 'Hide' : 'Inspect'} Chunks</span>
                          {showChunkInspector ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                      <div className="p-3 rounded-lg bg-blue-50 border border-blue-100">
                        <span className="text-[#64748B] block text-[11px] mb-0.5">Pages</span>
                        <span className="font-bold text-[#0F172A] text-base" data-testid="metric-pages">{paper.page_count ?? pages.length}</span>
                      </div>
                      <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-100">
                        <span className="text-[#64748B] block text-[11px] mb-0.5">Chunks Created</span>
                        <span className="font-bold text-[#0F172A] text-base" data-testid="metric-chunks">{paper.chunk_count ?? chunks.length}</span>
                      </div>
                      <div className="p-3 rounded-lg bg-violet-50 border border-violet-100">
                        <span className="text-[#64748B] block text-[11px] mb-0.5">Sections Detected</span>
                        <span className="font-bold text-[#0F172A] text-base" data-testid="metric-sections">{chunkSections.length}</span>
                      </div>
                      <div className="p-3 rounded-lg bg-slate-50 border border-slate-100">
                        <span className="text-[#64748B] block text-[11px] mb-0.5">Avg Chunk Size</span>
                        <span className="font-bold text-[#0F172A] text-base font-mono" data-testid="metric-avg-chunk">
                          {chunks.length > 0 ? Math.round(chunks.reduce((a, c) => a + c.character_count, 0) / chunks.length).toLocaleString() : '—'} ch
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Chunk Inspector */}
                  {showChunkInspector && (
                    <div className="bg-white rounded-xl border border-[#E2E8F0] shadow-xs" data-testid="chunk-inspector">
                      {/* Section filter pills */}
                      <div className="p-4 border-b border-[#E2E8F0] flex flex-wrap items-center gap-2">
                        <span className="text-xs font-semibold text-[#64748B] mr-1">Section:</span>
                        <button
                          type="button"
                          onClick={() => setSelectedSection('all')}
                          data-testid="section-filter-all"
                          className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                            selectedSection === 'all'
                              ? 'bg-[#2563EB] text-white'
                              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                          }`}
                        >
                          All ({chunks.length})
                        </button>
                        {chunkSections.map((section) => (
                          <button
                            key={section}
                            type="button"
                            onClick={() => setSelectedSection(section)}
                            data-testid={`section-filter-${section.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
                            className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                              selectedSection === section
                                ? 'bg-[#2563EB] text-white'
                                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                            }`}
                          >
                            {section} ({chunks.filter((c) => (c.section_name || 'Unknown') === section).length})
                          </button>
                        ))}
                      </div>

                      {/* Chunk list */}
                      <div className="divide-y divide-[#E2E8F0] max-h-[700px] overflow-y-auto">
                        {filteredChunks.length === 0 ? (
                          <div className="p-8 text-center text-xs text-[#64748B]">No chunks found for this section.</div>
                        ) : (
                          filteredChunks.map((chunk) => (
                            <div
                              key={chunk.chunk_index}
                              data-testid={`chunk-card-${chunk.chunk_index}`}
                              className="p-4 hover:bg-slate-50 transition-colors"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                                <div className="flex items-center gap-2">
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#2563EB] text-white text-[10px] font-bold font-mono">
                                    Chunk {chunk.chunk_index + 1}
                                  </span>
                                  <span
                                    data-testid={`chunk-section-${chunk.chunk_index}`}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-violet-50 text-violet-700 text-[10px] font-semibold border border-violet-200"
                                  >
                                    {chunk.section_name || 'Unknown'}
                                  </span>
                                </div>
                                <div className="flex items-center gap-3 text-[11px] text-[#64748B]">
                                  <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded">
                                    {chunk.start_page === chunk.end_page
                                      ? `Page ${chunk.start_page}`
                                      : `Pages ${chunk.start_page}–${chunk.end_page}`}
                                  </span>
                                  <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded">
                                    {chunk.character_count.toLocaleString()} chars
                                  </span>
                                  {chunk.token_count_estimate && (
                                    <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded">
                                      ~{chunk.token_count_estimate} tokens
                                    </span>
                                  )}
                                </div>
                              </div>
                              <p
                                data-testid={`chunk-text-${chunk.chunk_index}`}
                                className="text-[11px] text-[#0F172A] leading-relaxed bg-slate-50 p-3 rounded-lg border border-slate-100 max-h-32 overflow-y-auto whitespace-pre-wrap font-mono"
                              >
                                {chunk.text}
                              </p>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : activeTab === 'metadata' ? (
            /* Metadata Tab View */
            <div className="bg-white rounded-xl border border-[#E2E8F0] shadow-xs p-6 space-y-4">
              <h2 className="text-sm font-bold text-[#0F172A] uppercase tracking-wider">
                Document Technical Metadata
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-100 space-y-1">
                  <span className="text-[#64748B] block font-medium">Original Filename</span>
                  <span className="font-semibold text-[#0F172A] font-mono break-all">{paper.original_filename}</span>
                </div>

                <div className="p-3 rounded-lg bg-slate-50 border border-slate-100 space-y-1">
                  <span className="text-[#64748B] block font-medium">Ingestion Timestamp</span>
                  <span className="font-semibold text-[#0F172A]">{createdDateStr}</span>
                </div>

                <div className="p-3 rounded-lg bg-slate-50 border border-slate-100 space-y-1">
                  <span className="text-[#64748B] block font-medium">File Size</span>
                  <span className="font-semibold text-[#0F172A] font-mono">{formatFileSize(paper.file_size)}</span>
                </div>

                <div className="p-3 rounded-lg bg-slate-50 border border-slate-100 space-y-1">
                  <span className="text-[#64748B] block font-medium">MIME Type & Integrity</span>
                  <span className="font-semibold text-emerald-700 font-mono">application/pdf (%PDF- verified)</span>
                </div>

                <div className="p-3 rounded-lg bg-slate-50 border border-slate-100 space-y-1">
                  <span className="text-[#64748B] block font-medium">Extraction Status</span>
                  <span className="font-semibold text-[#0F172A] capitalize">{paper.extraction_status}</span>
                </div>

                <div className="p-3 rounded-lg bg-slate-50 border border-slate-100 space-y-1">
                  <span className="text-[#64748B] block font-medium">Preserved Pages</span>
                  <span className="font-semibold text-[#0F172A]">{paper.page_count ?? 'Not extracted yet'}</span>
                </div>

                <div className="sm:col-span-2 p-3 rounded-lg bg-slate-50 border border-slate-100 space-y-1">
                  <span className="text-[#64748B] block font-medium">Associated Research Project</span>
                  {project ? (
                    <Link
                      to={`/projects/${project.id}`}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#2563EB] hover:underline"
                    >
                      <Folder className="w-3.5 h-3.5" />
                      <span>{project.name}</span>
                    </Link>
                  ) : (
                    <span className="text-xs text-[#64748B]">Project ID: {paper.project_id}</span>
                  )}
                </div>
              </div>
            </div>
          ) : (
            /* Extracted Text View */
            <div className="space-y-6">
              {/* STATE 1: Extraction Not Started */}
              {isExtractionNotStarted && !isExtracting && (
                <div
                  data-testid="extraction-not-started-card"
                  className="bg-white rounded-2xl border border-[#E2E8F0] shadow-xs p-8 sm:p-10 text-center space-y-6"
                >
                  <div className="w-14 h-14 rounded-2xl bg-blue-50 border border-blue-100 text-[#2563EB] flex items-center justify-center mx-auto shadow-xs">
                    <Sparkles className="w-7 h-7" />
                  </div>

                  <div className="space-y-2 max-w-lg mx-auto">
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 text-slate-700 text-xs font-semibold">
                      <Clock className="w-3.5 h-3.5 text-slate-500" />
                      <span>Extraction Status: Not Started</span>
                    </div>
                    <h2 className="text-xl font-bold text-[#0F172A] tracking-tight">
                      Extract Text & Preserve Page Boundaries
                    </h2>
                    <p className="text-xs sm:text-sm text-[#64748B] leading-relaxed">
                      Extract page-by-page text from this scientific PDF using high-performance <strong>PyMuPDF</strong>.
                      Preserves 1-indexed page numbers, exact character counts, and structural text formatting for research inspection.
                    </p>
                  </div>

                  <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
                    <button
                      type="button"
                      onClick={handleTriggerExtraction}
                      data-testid="extract-text-primary-btn"
                      className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-[#2563EB] hover:bg-blue-700 text-white text-xs sm:text-sm font-semibold shadow-md transition-all cursor-pointer w-full sm:w-auto"
                    >
                      <Sparkles className="w-4 h-4" />
                      <span>Extract Text</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleDownload}
                      className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-[#0F172A] text-xs font-semibold transition-colors cursor-pointer w-full sm:w-auto"
                    >
                      <Download className="w-4 h-4" />
                      <span>Download PDF</span>
                    </button>
                  </div>

                  <div className="pt-6 border-t border-[#E2E8F0] grid grid-cols-1 sm:grid-cols-3 gap-4 text-left">
                    <div className="p-3 rounded-lg bg-slate-50 border border-slate-100">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-[#0F172A] mb-1">
                        <Layers className="w-3.5 h-3.5 text-[#2563EB]" />
                        <span>Page Preservation</span>
                      </div>
                      <p className="text-[11px] text-[#64748B]">Page numbers start at 1 and match PDF visual pagination.</p>
                    </div>

                    <div className="p-3 rounded-lg bg-slate-50 border border-slate-100">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-[#0F172A] mb-1">
                        <Hash className="w-3.5 h-3.5 text-[#2563EB]" />
                        <span>Character Metrics</span>
                      </div>
                      <p className="text-[11px] text-[#64748B]">Accurate character counts recorded per individual page.</p>
                    </div>

                    <div className="p-3 rounded-lg bg-slate-50 border border-slate-100">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-[#0F172A] mb-1">
                        <RefreshCw className="w-3.5 h-3.5 text-[#2563EB]" />
                        <span>Idempotent Run</span>
                      </div>
                      <p className="text-[11px] text-[#64748B]">Re-extract anytime without duplicate page records.</p>
                    </div>
                  </div>
                </div>
              )}

              {/* STATE 2: Extraction Processing */}
              {isExtracting && (
                <div
                  data-testid="extraction-processing-card"
                  className="bg-white rounded-2xl border border-blue-200 shadow-xs p-10 text-center space-y-4"
                >
                  <Loader2 className="w-10 h-10 text-[#2563EB] animate-spin mx-auto" />
                  <div className="space-y-1">
                    <h3 className="text-base font-bold text-[#0F172A]">
                      Extracting text with PyMuPDF...
                    </h3>
                    <p className="text-xs text-[#64748B] max-w-md mx-auto">
                      Opening PDF from storage, traversing pages, preserving layout boundaries, and recording page metrics.
                    </p>
                  </div>
                  <span className="inline-block px-3 py-1 rounded-full bg-blue-50 text-[#2563EB] text-xs font-semibold animate-pulse font-mono">
                    status: processing
                  </span>
                </div>
              )}

              {/* STATE 3: Extraction Completed with Extracted Pages */}
              {isExtractionDone && !isExtracting && (
                <div className="space-y-6" data-testid="extraction-completed-view">
                  {/* Extraction Metrics Bar */}
                  <div
                    data-testid="extraction-metrics-bar"
                    className="bg-white rounded-xl border border-[#E2E8F0] shadow-xs p-4 flex flex-wrap items-center justify-between gap-4"
                  >
                    <div className="flex flex-wrap items-center gap-4 text-xs">
                      <div>
                        <span className="text-[#64748B] block text-[11px]">Total Pages</span>
                        <span className="font-bold text-[#0F172A] text-sm" data-testid="metric-total-pages">
                          {paper.page_count ?? pages.length} Pages
                        </span>
                      </div>

                      <div className="h-8 w-px bg-slate-200 hidden sm:block" />

                      <div>
                        <span className="text-[#64748B] block text-[11px]">Total Characters</span>
                        <span className="font-bold text-[#0F172A] text-sm font-mono" data-testid="metric-total-chars">
                          {totalCharacters.toLocaleString()}
                        </span>
                      </div>

                      <div className="h-8 w-px bg-slate-200 hidden sm:block" />

                      <div>
                        <span className="text-[#64748B] block text-[11px]">Extraction Timestamp</span>
                        <span className="font-semibold text-[#0F172A]" data-testid="metric-extracted-at">
                          {extractedDateStr || 'Recently'}
                        </span>
                      </div>

                      <div className="h-8 w-px bg-slate-200 hidden sm:block" />

                      <div>
                        <span className="text-[#64748B] block text-[11px]">Parser Engine</span>
                        <span className="font-semibold text-blue-700 font-mono">PyMuPDF 1.24+</span>
                      </div>
                    </div>

                    {/* Page filter buttons */}
                    {pages.length > 1 && (
                      <div className="flex items-center gap-1.5 overflow-x-auto py-1 max-w-full">
                        <button
                          type="button"
                          onClick={() => setSelectedPageFilter('all')}
                          className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer shrink-0 ${
                            selectedPageFilter === 'all'
                              ? 'bg-[#2563EB] text-white'
                              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                          }`}
                        >
                          All ({pages.length})
                        </button>
                        {pages.map((p) => (
                          <button
                            key={p.page_number}
                            type="button"
                            onClick={() => scrollToPage(p.page_number)}
                            data-testid={`page-nav-pill-${p.page_number}`}
                            className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer shrink-0 ${
                              selectedPageFilter === p.page_number
                                ? 'bg-[#2563EB] text-white'
                                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                            }`}
                          >
                            P{p.page_number}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Render Pages */}
                  {isLoadingPages ? (
                    <div className="p-12 text-center bg-white rounded-xl border border-[#E2E8F0] shadow-xs">
                      <Loader2 className="w-7 h-7 text-[#2563EB] animate-spin mx-auto mb-2" />
                      <p className="text-xs text-[#64748B]">Loading preserved page contents...</p>
                    </div>
                  ) : displayedPages.length === 0 ? (
                    <div className="p-8 text-center bg-white rounded-xl border border-[#E2E8F0] shadow-xs space-y-3">
                      <p className="text-xs text-[#64748B]">
                        {typeof selectedPageFilter === 'number'
                          ? `Page ${selectedPageFilter} is not available in this document (${pages.length} pages total).`
                          : 'No page contents found for this paper.'}
                      </p>
                      {typeof selectedPageFilter === 'number' && (
                        <button
                          type="button"
                          onClick={() => setSelectedPageFilter('all')}
                          className="px-3 py-1.5 rounded-lg bg-[#2563EB] text-white text-xs font-semibold hover:bg-blue-700 transition-colors cursor-pointer"
                        >
                          View All Pages
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-6" data-testid="pages-container">
                      {displayedPages.map((page) => {
                        const isTargetPage =
                          citedChunk != null
                            ? page.page_number >= citedChunk.start_page && page.page_number <= citedChunk.end_page
                            : (typeof selectedPageFilter === 'number' && page.page_number === selectedPageFilter && chunkParam != null)

                        const matchRes = isTargetPage && citedChunk ? findChunkMatch(page.text, citedChunk.text) : null

                        return (
                          <article
                            key={page.id || page.page_number}
                            ref={(el) => {
                              pageRefs.current[page.page_number] = el
                            }}
                            data-testid={`extracted-page-card-${page.page_number}`}
                            className={`bg-white rounded-xl border shadow-xs overflow-hidden transition-all ${
                              isTargetPage && citedChunk
                                ? 'border-amber-300 ring-2 ring-amber-200/60'
                                : 'border-[#E2E8F0] hover:border-slate-300'
                            }`}
                          >
                            {/* Page Header */}
                            <header
                              className={`px-5 py-3 border-b flex items-center justify-between ${
                                isTargetPage && citedChunk
                                  ? 'bg-amber-50/70 border-amber-200'
                                  : 'bg-slate-50 border-[#E2E8F0]'
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <span
                                  data-testid={`page-badge-${page.page_number}`}
                                  className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-[#2563EB] text-white text-xs font-bold font-mono"
                                >
                                  Page {page.page_number}
                                </span>
                                <span className="text-xs text-[#64748B]">
                                  of {paper.page_count ?? pages.length}
                                </span>
                                {isTargetPage && citedChunk && (
                                  <span
                                    data-testid="cited-page-indicator"
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-300"
                                  >
                                    <Sparkles className="w-3 h-3 text-amber-600" />
                                    <span>{citationLabel}</span>
                                  </span>
                                )}
                              </div>

                              <div className="flex items-center gap-3 text-xs text-[#64748B]">
                                <span
                                  data-testid={`page-char-count-${page.page_number}`}
                                  className="font-mono bg-white px-2 py-0.5 rounded border border-slate-200 text-[#0F172A]"
                                >
                                  {page.character_count.toLocaleString()} chars
                                </span>
                              </div>
                            </header>

                            {/* Page Text Body */}
                            <div className="p-6">
                              {page.text.trim().length > 0 ? (
                                matchRes ? (
                                  <div
                                    data-testid={`page-text-content-${page.page_number}`}
                                    className="whitespace-pre-wrap font-sans text-xs sm:text-sm text-[#0F172A] leading-relaxed bg-slate-50/60 p-5 rounded-lg border border-slate-100 max-h-[600px] overflow-y-auto selection:bg-blue-100 selection:text-blue-900"
                                  >
                                    {matchRes.before}
                                    <mark
                                      id="cited-evidence-target"
                                      data-testid="cited-evidence-highlight"
                                      className="block bg-amber-50 text-amber-950 font-sans p-3.5 my-2.5 rounded-lg border-l-4 border-amber-500 shadow-xs ring-1 ring-amber-300/70 leading-relaxed"
                                    >
                                      <div className="flex items-center gap-2 pb-2 mb-2 border-b border-amber-200 text-xs font-bold text-amber-900 tracking-wide">
                                        <Sparkles className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                                        <span data-testid="citation-indicator-label">{citationLabel}</span>
                                        {citedChunk?.section_name && (
                                          <span className="text-amber-700 font-medium">
                                            · #{citedChunk.section_name}
                                          </span>
                                        )}
                                        <span className="text-[11px] font-normal text-amber-700/80 ml-auto hidden sm:inline">
                                          Exact Supporting Evidence
                                        </span>
                                      </div>
                                      <span className="text-xs sm:text-sm font-normal text-amber-950 whitespace-pre-wrap">
                                        {matchRes.match}
                                      </span>
                                    </mark>
                                    {matchRes.after}
                                  </div>
                                ) : isTargetPage && citedChunk ? (
                                  <div
                                    data-testid={`page-text-content-${page.page_number}`}
                                    className="whitespace-pre-wrap font-sans text-xs sm:text-sm text-[#0F172A] leading-relaxed bg-slate-50/60 p-5 rounded-lg border border-slate-100 max-h-[600px] overflow-y-auto selection:bg-blue-100 selection:text-blue-900"
                                  >
                                    <div
                                      id="cited-evidence-target"
                                      data-testid="cited-evidence-banner"
                                      className="mb-4 p-3.5 rounded-lg bg-amber-50 border-l-4 border-amber-500 border border-amber-200 text-amber-950 text-xs shadow-2xs"
                                    >
                                      <div className="flex items-center gap-2 font-bold text-amber-900 pb-1">
                                        <Sparkles className="w-4 h-4 text-amber-600 shrink-0" />
                                        <span data-testid="citation-indicator-label">{citationLabel}</span>
                                        {citedChunk?.section_name && (
                                          <span className="text-amber-700 font-medium">
                                            · #{citedChunk.section_name}
                                          </span>
                                        )}
                                      </div>
                                      <p className="text-amber-800 text-[11px] sm:text-xs pl-6">
                                        Supporting evidence for chunk #{citedChunk.chunk_index} ({citedChunk.section_name})
                                        is located on this page.
                                      </p>
                                    </div>
                                    {page.text}
                                  </div>
                                ) : (
                                  <div
                                    data-testid={`page-text-content-${page.page_number}`}
                                    className="whitespace-pre-wrap font-sans text-xs sm:text-sm text-[#0F172A] leading-relaxed bg-slate-50/60 p-5 rounded-lg border border-slate-100 max-h-[600px] overflow-y-auto selection:bg-blue-100 selection:text-blue-900"
                                  >
                                    {page.text}
                                  </div>
                                )
                              ) : (
                                <div className="p-6 text-center bg-slate-50 rounded-lg border border-dashed border-slate-200 text-[#64748B] text-xs">
                                  <em>This page contains no extractable text (e.g. blank page or image-only).</em>
                                </div>
                              )}
                            </div>
                          </article>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: Intelligence & Extraction Sidebar (4 cols) */}
        <div className="lg:col-span-4 space-y-6">
          {/* Extraction Pipeline State Card */}
          <div className="bg-white rounded-xl border border-[#E2E8F0] p-5 space-y-3.5 shadow-xs">
            <h3 className="text-xs font-bold text-[#0F172A] uppercase tracking-wider flex items-center justify-between">
              <span>Pipeline Status</span>
              <span className="text-[10px] text-blue-600 font-mono">Module 5.1</span>
            </h3>

            <div className="space-y-2.5 text-xs">
              <div className="flex items-center justify-between p-2 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800">
                <span className="font-medium">Storage Verification</span>
                <span className="font-bold">Verified</span>
              </div>

              <div
                className={`flex items-center justify-between p-2 rounded-lg border ${
                  isExtractionDone
                    ? 'bg-blue-50 border-blue-200 text-blue-800'
                    : isExtractionFailed
                    ? 'bg-rose-50 border-rose-200 text-rose-800'
                    : 'bg-slate-50 border-slate-200 text-slate-700'
                }`}
              >
                <span className="font-medium">Text Extraction</span>
                <span className="font-bold capitalize">
                  {isExtracting ? 'In Progress' : paper.extraction_status.replace('_', ' ')}
                </span>
              </div>

              <div
                className={`flex items-center justify-between p-2 rounded-lg border ${
                  isChunkingDone
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : isProcessing
                    ? 'bg-amber-50 border-amber-200 text-amber-800 animate-pulse'
                    : isChunkingFailed
                    ? 'bg-rose-50 border-rose-200 text-rose-800'
                    : 'bg-slate-50 border-slate-200 text-slate-600'
                }`}
              >
                <span className="font-medium">Document Processing</span>
                <span className="font-semibold" data-testid="pipeline-status-processing">
                  {isProcessing
                    ? 'In Progress'
                    : isChunkingDone
                    ? `${paper.chunk_count ?? chunks.length} Chunks`
                    : isChunkingFailed
                    ? 'Failed'
                    : 'Not Started'}
                </span>
              </div>

              <div
                className={`flex items-center justify-between p-2 rounded-lg border ${
                  isEmbeddingDone
                    ? 'bg-purple-50 border-purple-200 text-purple-800'
                    : isEmbedding
                    ? 'bg-amber-50 border-amber-200 text-amber-800 animate-pulse'
                    : isEmbeddingFailed
                    ? 'bg-rose-50 border-rose-200 text-rose-800'
                    : 'bg-slate-50 border-slate-200 text-slate-600'
                }`}
              >
                <span className="font-medium">Semantic Index (Qdrant)</span>
                <span className="font-semibold" data-testid="pipeline-status-embedding">
                  {isEmbedding
                    ? 'Indexing...'
                    : isEmbeddingDone
                    ? `${paper.embedded_chunk_count ?? chunks.length} Vectors`
                    : isEmbeddingFailed
                    ? 'Failed'
                    : 'Not Started'}
                </span>
              </div>
            </div>
          </div>

          {/* Quick Stats Card (when completed) */}
          {isExtractionDone && (
            <div className="bg-white rounded-xl border border-[#E2E8F0] p-5 space-y-3 shadow-xs">
              <h3 className="text-xs font-bold text-[#0F172A] uppercase tracking-wider">
                Document Summary
              </h3>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-[#64748B]">Page Count</span>
                  <span className="font-bold text-[#0F172A]">{paper.page_count ?? pages.length}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-[#64748B]">Characters Extracted</span>
                  <span className="font-bold text-[#0F172A] font-mono">{totalCharacters.toLocaleString()}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-[#64748B]">Average per Page</span>
                  <span className="font-bold text-[#0F172A] font-mono">
                    {pages.length > 0 ? Math.round(totalCharacters / pages.length).toLocaleString() : 0}
                  </span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-[#64748B]">Extracted At</span>
                  <span className="font-medium text-[#0F172A]">{extractedDateStr || '—'}</span>
                </div>
              </div>
            </div>
          )}

          {/* Future Capabilities Placeholder */}
          <div className="bg-white rounded-xl border border-[#E2E8F0] p-5 space-y-3 shadow-xs">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-blue-50 text-[#2563EB] flex items-center justify-center">
                <Bot className="w-3.5 h-3.5" />
              </div>
              <h3 className="text-xs font-bold text-[#0F172A] uppercase tracking-wider">Future AI Synthesis</h3>
            </div>
            <p className="text-xs text-[#64748B] leading-relaxed">
              Module 5.1 provides dense vector indexing and cosine similarity search. Subsequent iterations will connect retrieved chunks into an LLM synthesis prompt for cited answers.
            </p>
          </div>
        </div>
      </div>

      {/* ==================== DELETE CONFIRMATION MODAL ==================== */}
      {isDeleteModalOpen && (
        <div
          data-testid="delete-paper-modal"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4"
        >
          <div className="bg-white rounded-xl border border-[#E2E8F0] shadow-xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3">
              <h3 className="text-base font-bold text-[#0F172A]">Delete Research Paper</h3>
              <button
                type="button"
                onClick={() => setIsDeleteModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {deleteError && (
              <div
                role="alert"
                className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2"
              >
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{deleteError}</span>
              </div>
            )}

            <p className="text-xs text-[#64748B] leading-relaxed">
              Are you sure you want to delete <span className="font-semibold text-[#0F172A]">"{paper.title}"</span>?
              This will permanently remove the paper, all extracted pages, and delete the original PDF from storage.
            </p>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#E2E8F0]">
              <button
                type="button"
                onClick={() => setIsDeleteModalOpen(false)}
                disabled={isDeleting}
                className="px-3.5 py-2 rounded-lg text-xs font-medium text-[#64748B] hover:text-[#0F172A] hover:bg-slate-100 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteSubmit}
                data-testid="confirm-delete-paper-btn"
                disabled={isDeleting}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold shadow-sm transition-colors disabled:opacity-50 cursor-pointer"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete Paper</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

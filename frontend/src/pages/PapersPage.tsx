import React, { useState, useEffect, useMemo, useRef } from 'react'
import { Link } from 'react-router-dom'
import {
  FileText,
  Upload,
  Plus,
  Search,
  CheckCircle2,
  Clock,
  Download,
  Trash2,
  ExternalLink,
  AlertCircle,
  Loader2,
  X,
  Folder,
  Sparkles,
  Layers,
  Globe,
  Tag,
} from 'lucide-react'
import type { Paper, Project, DiscoveredPaperItem } from '../types'
import {
  getPapers,
  getProjects,
  uploadPaper,
  deletePaper,
  downloadPaperFile,
  searchDiscoveredPapers,
  importDiscoveredPaper,
  ApiError,
} from '../services/api'

export const PapersPage: React.FC = () => {
  const [papers, setPapers] = useState<Paper[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedProjectId, setSelectedProjectId] = useState<string>('all')
  const [sortBy, setSortBy] = useState<'recent' | 'title' | 'size'>('recent')

  // Upload Modal State
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false)
  const [targetProjectId, setTargetProjectId] = useState<string>('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Delete Modal State
  const [paperToDelete, setPaperToDelete] = useState<Paper | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  // Download State
  const [downloadingId, setDownloadingId] = useState<string | null>(null)

  // Active View Tab: Library vs Discover Papers
  const [activeTab, setActiveTab] = useState<'library' | 'discover'>('library')

  // Discovery State (Module 13.5: OpenAlex)
  const [discoveryQuery, setDiscoveryQuery] = useState('')
  const [discoveryYear, setDiscoveryYear] = useState('')
  const [openAccessOnly, setOpenAccessOnly] = useState(true)
  const [discoveryProjectId, setDiscoveryProjectId] = useState<string>('')
  const [isSearchingDiscovery, setIsSearchingDiscovery] = useState(false)
  const [discoveryError, setDiscoveryError] = useState<string | null>(null)
  const [discoverySuccess, setDiscoverySuccess] = useState<string | null>(null)
  const [discoveredPapers, setDiscoveredPapers] = useState<DiscoveredPaperItem[]>([])
  const [totalDiscovered, setTotalDiscovered] = useState<number>(0)
  const [hasSearched, setHasSearched] = useState(false)
  const [importingPaperId, setImportingPaperId] = useState<string | null>(null)
  const [importedPaperIds, setImportedPaperIds] = useState<Set<string>>(new Set())

  const loadData = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const [papersRes, projectsRes] = await Promise.all([getPapers(), getProjects()])
      setPapers(papersRes.papers)
      setProjects(projectsRes.projects)
      if (projectsRes.projects.length > 0 && !targetProjectId) {
        setTargetProjectId(projectsRes.projects[0].id)
      }
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setError(err.message)
      } else {
        setError('Failed to load papers and research projects.')
      }
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  // Quick lookup map for project names
  const projectMap = useMemo(() => {
    const map = new Map<string, Project>()
    projects.forEach((p) => map.set(p.id, p))
    return map
  }, [projects])

  // Filtered & Sorted papers
  const filteredPapers = useMemo(() => {
    return papers
      .filter((paper) => {
        const matchesSearch =
          paper.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          paper.original_filename.toLowerCase().includes(searchQuery.toLowerCase())
        const matchesProject =
          selectedProjectId === 'all' || paper.project_id === selectedProjectId
        return matchesSearch && matchesProject
      })
      .sort((a, b) => {
        if (sortBy === 'title') {
          return a.title.localeCompare(b.title)
        }
        if (sortBy === 'size') {
          return b.file_size - a.file_size
        }
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      })
  }, [papers, searchQuery, selectedProjectId, sortBy])

  // Format bytes helper
  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
  }

  // Open Upload Modal
  const handleOpenUpload = () => {
    setUploadError(null)
    setSelectedFile(null)
    if (projects.length > 0 && !targetProjectId) {
      setTargetProjectId(projects[0].id)
    }
    setIsUploadModalOpen(true)
  }

  // File selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setUploadError('Only scientific research papers in PDF format (.pdf) are supported.')
      setSelectedFile(null)
      return
    }

    if (file.size === 0) {
      setUploadError('The selected file is empty (0 bytes). Please select a valid PDF.')
      setSelectedFile(null)
      return
    }

    if (file.size > 50 * 1024 * 1024) {
      setUploadError('File exceeds the 50MB upload limit. Please select a smaller PDF.')
      setSelectedFile(null)
      return
    }

    setUploadError(null)
    setSelectedFile(file)
  }

  // Submit Upload
  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedFile) {
      setUploadError('Please select a PDF file to upload.')
      return
    }
    if (!targetProjectId) {
      setUploadError('Please select a research project.')
      return
    }

    setIsUploading(true)
    setUploadError(null)

    try {
      const createdPaper = await uploadPaper(targetProjectId, selectedFile)
      setPapers((prev) => [createdPaper, ...prev])
      setIsUploadModalOpen(false)
      setSelectedFile(null)
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setUploadError(err.message)
      } else {
        setUploadError('Failed to upload research paper. Please verify file integrity.')
      }
    } finally {
      setIsUploading(false)
    }
  }

  // Download PDF
  const handleDownload = async (paper: Paper) => {
    setDownloadingId(paper.id)
    try {
      await downloadPaperFile(paper.id, paper.original_filename)
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to download paper file.')
    } finally {
      setDownloadingId(null)
    }
  }

  // Delete Paper
  const handleDeleteConfirm = async () => {
    if (!paperToDelete) return
    setIsDeleting(true)
    setDeleteError(null)

    try {
      await deletePaper(paperToDelete.id)
      setPapers((prev) => prev.filter((p) => p.id !== paperToDelete.id))
      setPaperToDelete(null)
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

  // Handle OpenAlex paper discovery search
  const handleDiscoverySearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!discoveryQuery.trim()) return

    setIsSearchingDiscovery(true)
    setDiscoveryError(null)
    setDiscoverySuccess(null)

    try {
      const resp = await searchDiscoveredPapers({
        query: discoveryQuery.trim(),
        limit: 15,
        openAccessOnly,
        year: discoveryYear.trim() || undefined,
      })
      setDiscoveredPapers(resp.papers)
      setTotalDiscovered(resp.total_results)
      setHasSearched(true)
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setDiscoveryError(err.message)
      } else {
        setDiscoveryError('Scholarly paper discovery failed. Please try again.')
      }
    } finally {
      setIsSearchingDiscovery(false)
    }
  }

  // Handle open-access paper import into project
  const handleImportPaper = async (paperItem: DiscoveredPaperItem) => {
    const projId = discoveryProjectId || targetProjectId || (projects[0]?.id)
    if (!projId) {
      setDiscoveryError('Please select a target research project for the imported paper.')
      return
    }

    if (!paperItem.open_access_pdf_url) {
      setDiscoveryError('This paper does not have a legally accessible open-access PDF.')
      return
    }

    setImportingPaperId(paperItem.paper_id)
    setDiscoveryError(null)
    setDiscoverySuccess(null)

    try {
      const result = await importDiscoveredPaper({
        project_id: projId,
        title: paperItem.title,
        open_access_pdf_url: paperItem.open_access_pdf_url,
        paper_id: paperItem.paper_id,
        doi: paperItem.doi,
        arxiv_id: paperItem.arxiv_id,
        authors: paperItem.authors,
        year: paperItem.year,
        venue: paperItem.venue,
        abstract: paperItem.abstract,
        citation_count: paperItem.citation_count,
        source_url: paperItem.source_url,
        auto_extract: true,
      })

      setImportedPaperIds((prev) => new Set(prev).add(paperItem.paper_id))
      setDiscoverySuccess(`Successfully imported "${paperItem.title}" to project "${result.project_name || 'Project'}". Text extraction has been initiated.`)
      // Refresh library papers list so it immediately appears in the library
      loadData()
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setDiscoveryError(err.message)
      } else {
        setDiscoveryError('Failed to import paper.')
      }
    } finally {
      setImportingPaperId(null)
    }
  }

  return (
    <div className="p-6 lg:p-8 max-w-[1560px] mx-auto w-full space-y-6 lg:space-y-8" data-testid="paper-library-container">
      {/* ==================== PAGE HEADER ==================== */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200/90">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl sm:text-[26px] font-bold text-slate-900 tracking-tight leading-snug">
              Research Paper Library
            </h1>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200/90">
              v1.0 Ingestion
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Discover, organize, and analyze your scientific literature corpus.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={handleOpenUpload}
            data-testid="upload-paper-button"
            className="inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-semibold shadow-2xs transition-all cursor-pointer"
          >
            <Upload className="w-4 h-4" />
            <span>+ Upload PDF</span>
          </button>
        </div>
      </div>

      {/* ==================== VIEW MODE TABS ==================== */}
      <div className="flex items-center gap-2 border-b border-slate-200/90">
        <button
          type="button"
          onClick={() => setActiveTab('library')}
          data-testid="tab-paper-library"
          className={`px-4 py-2.5 text-xs sm:text-sm font-semibold border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'library'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>Uploaded Papers ({papers.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('discover')}
          data-testid="tab-discover-papers"
          className={`px-4 py-2.5 text-xs sm:text-sm font-semibold border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'discover'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          <Globe className="w-4 h-4" />
          <span>Discover Papers</span>
        </button>
      </div>

      {activeTab === 'library' && (
        <div className="space-y-6">
          {/* ==================== 1. LIBRARY METRICS (4 CARDS) ==================== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
        {/* Card 1: TOTAL PAPERS */}
        <div className="bg-white p-5 rounded-xl border border-slate-200/90 shadow-2xs flex items-start justify-between hover:border-slate-300 transition-all">
          <div className="space-y-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Total Papers</span>
            <div className="text-3xl font-bold text-slate-900 tracking-tight" data-testid="metric-total-papers">
              {papers.length}
            </div>
            <div className="text-xs text-slate-500 mt-0.5">
              Across {projects.length} {projects.length === 1 ? 'research project' : 'research projects'}
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100/80 flex items-center justify-center text-blue-600">
            <FileText className="w-5 h-5" />
          </div>
        </div>

        {/* Card 2: UPLOADED / STORED */}
        <div className="bg-white p-5 rounded-xl border border-slate-200/90 shadow-2xs flex items-start justify-between hover:border-slate-300 transition-all">
          <div className="space-y-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Uploaded</span>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-slate-900 tracking-tight">{papers.length}</span>
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200/80">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Stored
              </span>
            </div>
            <div className="text-xs text-slate-500 mt-0.5">Secure filesystem &amp; metadata</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100/80 flex items-center justify-center text-emerald-600">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>

        {/* Card 3: PROCESSING */}
        <div className="bg-white p-5 rounded-xl border border-slate-200/90 shadow-2xs flex items-start justify-between hover:border-slate-300 transition-all">
          <div className="space-y-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Processing</span>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-slate-900 tracking-tight">0</span>
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200/80">
                Idle
              </span>
            </div>
            <div className="text-xs text-slate-500 mt-0.5">Parsing pipeline ready</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-200/70 flex items-center justify-center text-slate-500">
            <Clock className="w-5 h-5" />
          </div>
        </div>

        {/* Card 4: NEEDS ATTENTION */}
        <div className="bg-white p-5 rounded-xl border border-slate-200/90 shadow-2xs flex items-start justify-between hover:border-slate-300 transition-all">
          <div className="space-y-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Needs Attention</span>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-slate-900 tracking-tight">0</span>
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200/80">
                Healthy
              </span>
            </div>
            <div className="text-xs text-slate-500 mt-0.5">All paper files intact</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-teal-50 border border-teal-100/80 flex items-center justify-center text-teal-600">
            <Sparkles className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* ==================== 2. SEARCH & FILTER TOOLBAR ==================== */}
      <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs p-4 space-y-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {/* Main Search Input */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search papers by title or filename..."
              data-testid="search-papers-input"
              className="w-full h-9 pl-10 pr-4 bg-slate-50/80 border border-slate-200 rounded-lg text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-blue-600/15 focus:border-blue-600 transition-all"
            />
          </div>

          {/* Project Filter */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 font-medium whitespace-nowrap">Project:</span>
            <select
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              data-testid="filter-project-select"
              className="h-9 px-3 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-900 focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15"
            >
              <option value="all">All Projects ({papers.length})</option>
              {projects.map((proj) => (
                <option key={proj.id} value={proj.id}>
                  {proj.name}
                </option>
              ))}
            </select>
          </div>

          {/* Sort Control */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 font-medium whitespace-nowrap">Sort:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'recent' | 'title' | 'size')}
              className="h-9 px-3 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-900 focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15"
            >
              <option value="recent">Recently Added</option>
              <option value="title">Paper Title (A-Z)</option>
              <option value="size">File Size</option>
            </select>
          </div>
        </div>
      </div>

      {/* ==================== 3. CONTENT AREA ==================== */}
      {isLoading ? (
        <div className="bg-white rounded-xl border border-[#E2E8F0] p-16 text-center shadow-xs">
          <Loader2 className="w-8 h-8 text-[#2563EB] animate-spin mx-auto mb-3" />
          <p className="text-sm font-medium text-[#0F172A]">Loading paper library...</p>
        </div>
      ) : error ? (
        <div className="bg-white rounded-xl border border-rose-200 p-8 text-center shadow-xs space-y-3">
          <div className="w-10 h-10 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
            <AlertCircle className="w-5 h-5" />
          </div>
          <p className="text-sm font-semibold text-rose-700">{error}</p>
          <button
            type="button"
            onClick={loadData}
            className="px-3.5 py-1.5 rounded-lg bg-[#2563EB] text-white text-xs font-medium hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      ) : papers.length === 0 ? (
        /* Truthful Empty State */
        <div
          data-testid="papers-empty-state"
          className="rounded-2xl border border-dashed border-[#E2E8F0] bg-white p-12 text-center max-w-2xl mx-auto space-y-4 my-8 shadow-xs"
        >
          <div className="w-14 h-14 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center mx-auto text-[#2563EB]">
            <FileText className="w-7 h-7" />
          </div>

          <div className="space-y-1.5">
            <h3 className="text-lg font-bold text-[#0F172A]">No papers in your research library yet</h3>
            <p className="text-xs text-[#64748B] max-w-md mx-auto leading-relaxed">
              Upload scientific research papers in PDF format to associate them with your research projects.
              Files are securely stored and organized for analysis.
            </p>
          </div>

          <div className="pt-2">
            <button
              type="button"
              onClick={handleOpenUpload}
              data-testid="empty-upload-paper-button"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#2563EB] hover:bg-blue-700 text-white text-xs font-semibold shadow-sm transition-colors cursor-pointer"
            >
              <Upload className="w-4 h-4" />
              <span>+ Upload First Paper</span>
            </button>
          </div>
        </div>
      ) : filteredPapers.length === 0 ? (
        <div className="bg-white rounded-xl border border-[#E2E8F0] p-12 text-center shadow-xs space-y-2">
          <Search className="w-8 h-8 text-slate-300 mx-auto" />
          <p className="text-sm font-semibold text-[#0F172A]">No papers match your search criteria</p>
          <p className="text-xs text-[#64748B]">Try clearing your search query or changing the project filter.</p>
        </div>
      ) : (
        /* Papers Table View */
        <div
          data-testid="papers-table"
          className="bg-white border border-slate-200/90 rounded-xl shadow-2xs overflow-hidden flex flex-col"
        >
          <div className="overflow-x-auto w-full">
            <table className="w-full text-left border-collapse min-w-[800px]">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200/90 text-[11px] font-bold uppercase text-slate-500 tracking-wider">
                  <th className="py-3.5 px-4 min-w-[280px]">Paper Title &amp; Original File</th>
                  <th className="py-3.5 px-4 min-w-[160px]">Research Project</th>
                  <th className="py-3.5 px-3 w-28 text-center">Size</th>
                  <th className="py-3.5 px-3 min-w-[120px] text-center">Status</th>
                  <th className="py-3.5 px-3 w-32 text-right">Date Added</th>
                  <th className="py-3.5 px-4 w-36 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs text-slate-900">
                {filteredPapers.map((paper) => {
                  const project = projectMap.get(paper.project_id)
                  const addedDate = new Date(paper.created_at).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })

                  return (
                    <tr
                      key={paper.id}
                      data-testid={`paper-row-${paper.id}`}
                      className="hover:bg-slate-50/60 transition-colors"
                    >
                      <td className="py-3.5 px-4">
                        <Link
                          to={`/papers/${paper.id}`}
                          data-testid={`paper-title-link-${paper.id}`}
                          className="font-semibold text-slate-900 hover:text-blue-600 transition-colors line-clamp-1 leading-snug cursor-pointer block"
                        >
                          {paper.title}
                        </Link>
                        <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-1.5 font-mono">
                          <FileText className="w-3 h-3 text-slate-400 shrink-0" />
                          <span className="truncate max-w-[240px]">{paper.original_filename}</span>
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        {project ? (
                          <Link
                            to={`/projects/${project.id}`}
                            className="inline-flex items-center gap-1.5 max-w-[180px] truncate text-[11px] bg-slate-100/80 hover:bg-slate-200/80 text-slate-700 px-2.5 py-1 rounded-md font-medium border border-slate-200/80 transition-colors"
                            title={project.name}
                          >
                            <Folder className="w-3 h-3 text-blue-600 shrink-0" />
                            <span className="truncate">{project.name}</span>
                          </Link>
                        ) : (
                          <span className="text-[11px] text-slate-400 italic">Unknown Project</span>
                        )}
                      </td>

                      <td className="py-3.5 px-3 text-center text-slate-500 font-mono text-[11px]">
                        {formatFileSize(paper.file_size)}
                      </td>

                      <td className="py-3.5 px-3 text-center">
                        <div className="flex flex-col items-center gap-1">
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/80">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            <span>Uploaded</span>
                          </span>
                          {paper.extraction_status === 'completed' && (
                            <span
                              data-testid={`badge-extracted-${paper.id}`}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200/80"
                              title={`Extracted ${paper.page_count ?? ''} pages via PyMuPDF`}
                            >
                              <FileText className="w-2.5 h-2.5 text-blue-600" />
                              <span>{paper.page_count ? `${paper.page_count}p Extracted` : 'Extracted'}</span>
                            </span>
                          )}
                          {paper.chunking_status === 'completed' && (
                            <span
                              data-testid={`badge-chunked-${paper.id}`}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-violet-50 text-violet-700 border border-violet-200/80"
                              title={`Processed into ${paper.chunk_count ?? ''} chunks`}
                            >
                              <Layers className="w-2.5 h-2.5 text-violet-600" />
                              <span>{paper.chunk_count ? `${paper.chunk_count} Chunks` : 'Chunked'}</span>
                            </span>
                          )}
                          {paper.extraction_status === 'processing' && (
                            <span
                              data-testid={`badge-extracting-${paper.id}`}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200/80 animate-pulse"
                            >
                              <Loader2 className="w-2.5 h-2.5 text-amber-600 animate-spin" />
                              <span>Extracting...</span>
                            </span>
                          )}
                          {paper.extraction_status === 'failed' && (
                            <span
                              data-testid={`badge-failed-${paper.id}`}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200/80"
                              title={paper.extraction_error || 'Extraction failed'}
                            >
                              <AlertCircle className="w-2.5 h-2.5 text-rose-600" />
                              <span>Failed</span>
                            </span>
                          )}
                          {(!paper.extraction_status || paper.extraction_status === 'not_started') && (
                            <span
                              data-testid={`badge-not-started-${paper.id}`}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-600 border border-slate-200/80"
                            >
                              <Clock className="w-2.5 h-2.5 text-slate-400" />
                              <span>Not Extracted</span>
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="py-3.5 px-3 text-right text-slate-500 text-[11px] whitespace-nowrap">
                        {addedDate}
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="flex items-center justify-center gap-1">
                          {/* View Detail Link */}
                          <Link
                            to={`/papers/${paper.id}`}
                            data-testid={`view-paper-btn-${paper.id}`}
                            className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50/80 rounded-lg transition-colors"
                            title="View Paper Details"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </Link>

                          {/* Download Button */}
                          <button
                            type="button"
                            onClick={() => handleDownload(paper)}
                            data-testid={`download-paper-btn-${paper.id}`}
                            disabled={downloadingId === paper.id}
                            className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50/80 rounded-lg transition-colors cursor-pointer"
                            title="Download Original PDF"
                          >
                            {downloadingId === paper.id ? (
                              <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
                            ) : (
                              <Download className="w-4 h-4" />
                            )}
                          </button>

                          {/* Delete Button */}
                          <button
                            type="button"
                            onClick={() => {
                              setDeleteError(null)
                              setPaperToDelete(paper)
                            }}
                            data-testid={`delete-paper-btn-${paper.id}`}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50/80 rounded-lg transition-colors cursor-pointer"
                            title="Delete Paper"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      </div>
      )}

      {/* ==================== DISCOVER PAPERS VIEW ==================== */}
      {activeTab === 'discover' && (
        <div className="space-y-6" data-testid="discover-papers-container">
          {/* Search Header Banner */}
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 rounded-xl p-5 space-y-4 shadow-2xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Globe className="w-4 h-4 text-blue-600" />
                  <span>Scholarly Paper Discovery</span>
                </h2>
                <p className="text-xs text-slate-600 mt-0.5">
                  Search millions of scientific papers via the OpenAlex Academic Graph and import legally accessible open-access PDFs into your project library.
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-500 bg-white/90 px-3 py-1 rounded-md border border-blue-200 shrink-0">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span className="font-medium text-slate-700">OpenAlex Academic Graph</span>
              </div>
            </div>

            {/* Search Form */}
            <form onSubmit={handleDiscoverySearch} className="space-y-3">
              <div className="flex flex-col md:flex-row items-stretch gap-2.5">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={discoveryQuery}
                    onChange={(e) => setDiscoveryQuery(e.target.value)}
                    placeholder="Search scientific papers by topic or title (e.g. GraphRAG, Retrieval Augmented Generation)..."
                    data-testid="discovery-search-input"
                    className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-300 bg-white text-xs sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-2xs"
                  />
                </div>

                <div className="w-full sm:w-36">
                  <input
                    type="text"
                    value={discoveryYear}
                    onChange={(e) => setDiscoveryYear(e.target.value)}
                    placeholder="Year (e.g. 2024)"
                    data-testid="discovery-year-input"
                    className="w-full px-3 py-2.5 rounded-lg border border-slate-300 bg-white text-xs sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-2xs"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSearchingDiscovery || !discoveryQuery.trim()}
                  data-testid="discovery-search-button"
                  className="px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-semibold shadow-xs flex items-center justify-center gap-2 disabled:opacity-50 transition cursor-pointer shrink-0"
                >
                  {isSearchingDiscovery ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Searching...</span>
                    </>
                  ) : (
                    <>
                      <Search className="w-4 h-4" />
                      <span>Search Papers</span>
                    </>
                  )}
                </button>
              </div>

              {/* Filter controls row */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-1 text-xs text-slate-600">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={openAccessOnly}
                    onChange={(e) => setOpenAccessOnly(e.target.checked)}
                    data-testid="discovery-oa-checkbox"
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="font-medium text-slate-800">Open Access Only (importable PDFs)</span>
                </label>

                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-700">Import Destination Project:</span>
                  <select
                    value={discoveryProjectId || (projects[0]?.id || '')}
                    onChange={(e) => setDiscoveryProjectId(e.target.value)}
                    data-testid="discovery-project-select"
                    className="px-2.5 py-1 rounded border border-slate-300 bg-white text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    {projects.map((proj) => (
                      <option key={proj.id} value={proj.id}>
                        {proj.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </form>
          </div>

          {/* Feedback alerts */}
          {discoveryError && (
            <div
              role="alert"
              data-testid="discovery-error-alert"
              className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2.5"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{discoveryError}</span>
            </div>
          )}

          {discoverySuccess && (
            <div
              role="alert"
              data-testid="discovery-success-alert"
              className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-start gap-2.5"
            >
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
              <div className="flex-1">
                <span>{discoverySuccess}</span>
              </div>
            </div>
          )}

          {/* Results Area */}
          {isSearchingDiscovery && (
            <div className="py-16 text-center space-y-3" data-testid="discovery-loading-state">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto" />
              <p className="text-sm font-semibold text-slate-700">Searching OpenAlex Academic Graph...</p>
              <p className="text-xs text-slate-500">Querying scholarly works, citation metrics, and open-access PDF locations</p>
            </div>
          )}

          {!isSearchingDiscovery && hasSearched && discoveredPapers.length === 0 && (
            <div className="p-12 text-center bg-white rounded-xl border border-dashed border-slate-300 space-y-2" data-testid="discovery-empty-state">
              <Globe className="w-8 h-8 text-slate-400 mx-auto" />
              <h3 className="text-sm font-bold text-slate-800">No Scientific Papers Found</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                No matching scholarly works found for "{discoveryQuery}". Try broadening your search keywords or adjusting the filters.
              </p>
            </div>
          )}

          {!isSearchingDiscovery && discoveredPapers.length > 0 && (
            <div className="space-y-4" data-testid="discovery-results-container">
              <div className="flex items-center justify-between text-xs text-slate-600 px-1">
                <span className="font-semibold">
                  Found {totalDiscovered.toLocaleString()} academic works for "{discoveryQuery}"
                </span>
                <span className="text-[11px] text-slate-500">Showing {discoveredPapers.length} results</span>
              </div>

              <div className="grid grid-cols-1 gap-4">
                {discoveredPapers.map((paperItem, idx) => {
                  const isImporting = importingPaperId === paperItem.paper_id
                  const isImported = importedPaperIds.has(paperItem.paper_id)
                  const hasOaPdf = Boolean(paperItem.open_access_pdf_url)

                  return (
                    <div
                      key={paperItem.paper_id || idx}
                      data-testid={`discovery-paper-card-${idx}`}
                      className="bg-white rounded-xl border border-[#E2E8F0] shadow-xs p-5 space-y-3 hover:border-blue-300 transition"
                    >
                      {/* Title & Badges */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1 flex-1">
                          <h3 className="text-base font-bold text-[#0F172A] leading-snug">
                            {paperItem.title}
                          </h3>
                          <p className="text-xs text-slate-600">
                            {paperItem.authors.length > 0 ? paperItem.authors.join(', ') : 'Unknown Authors'}
                          </p>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {paperItem.is_open_access ? (
                            <span
                              data-testid={`oa-status-badge-${idx}`}
                              className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200"
                            >
                              Open Access
                            </span>
                          ) : (
                            <span
                              data-testid={`oa-status-badge-${idx}`}
                              className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600 border border-slate-200"
                            >
                              Closed Access
                            </span>
                          )}
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                            OpenAlex
                          </span>
                        </div>
                      </div>

                      {/* Metadata Row */}
                      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                        {paperItem.year && (
                          <span className="font-semibold text-slate-700">Year: {paperItem.year}</span>
                        )}
                        {paperItem.venue && (
                          <span className="truncate max-w-[280px]">Venue: {paperItem.venue}</span>
                        )}
                        <span>Citations: {paperItem.citation_count.toLocaleString()}</span>
                        {paperItem.doi && (
                          <span className="font-mono text-[11px] text-slate-600 truncate max-w-[220px]">
                            DOI: {paperItem.doi}
                          </span>
                        )}
                      </div>

                      {/* Abstract Preview */}
                      {paperItem.abstract && (
                        <p className="text-xs text-slate-600 line-clamp-3 leading-relaxed bg-slate-50/70 p-3 rounded-lg border border-slate-100">
                          {paperItem.abstract}
                        </p>
                      )}

                      {/* Concepts / Topics */}
                      {paperItem.topics.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1 pt-1">
                          <Tag className="w-3 h-3 text-indigo-400" />
                          {paperItem.topics.map((t, ti) => (
                            <span
                              key={ti}
                              className="px-2 py-0.5 rounded text-[10px] font-medium bg-indigo-50 text-indigo-800 border border-indigo-200"
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Action Buttons */}
                      <div className="flex items-center justify-between pt-3 border-t border-slate-100 gap-3">
                        <div>
                          {paperItem.source_url && (
                            <a
                              href={paperItem.source_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              data-testid={`view-source-btn-${idx}`}
                              className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800 transition"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                              <span>View Source</span>
                            </a>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          {hasOaPdf ? (
                            isImported ? (
                              <span
                                data-testid={`import-success-badge-${idx}`}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-semibold border border-emerald-200"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>Imported to Library</span>
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleImportPaper(paperItem)}
                                disabled={isImporting}
                                data-testid={`import-paper-btn-${idx}`}
                                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs disabled:opacity-50 transition cursor-pointer"
                              >
                                {isImporting ? (
                                  <>
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    <span>Importing PDF...</span>
                                  </>
                                ) : (
                                  <>
                                    <Download className="w-3.5 h-3.5" />
                                    <span>Import to Project</span>
                                  </>
                                )}
                              </button>
                            )
                          ) : (
                            <button
                              type="button"
                              disabled
                              data-testid={`import-disabled-btn-${idx}`}
                              className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-400 border border-slate-200 text-xs font-medium cursor-not-allowed"
                            >
                              PDF not openly available
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ==================== UPLOAD PAPER MODAL ==================== */}
      {isUploadModalOpen && (
        <div
          data-testid="upload-paper-modal"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 animate-in fade-in duration-150"
        >
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-150">
            <div className="px-6 py-4.5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">Upload Research Paper</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Associate a scientific PDF with one of your research projects.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsUploadModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6">
            {uploadError && (
              <div
                role="alert"
                className="p-3 mb-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2"
              >
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{uploadError}</span>
              </div>
            )}

            {projects.length === 0 ? (
              <div className="p-4 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs space-y-2">
                <p className="font-semibold">No Research Project Available</p>
                <p>
                  You must create a research project before uploading literature. Papers must belong to a project corpus.
                </p>
                <Link
                  to="/projects"
                  className="inline-flex items-center gap-1.5 font-semibold text-[#2563EB] hover:underline"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Create Project Now</span>
                </Link>
              </div>
            ) : (
              <form onSubmit={handleUploadSubmit} className="space-y-4">
                {/* Project Selector */}
                <div>
                  <label htmlFor="upload-target-project" className="block text-xs font-semibold text-[#0F172A] mb-1.5">
                    Assign to Project <span className="text-rose-500">*</span>
                  </label>
                  <select
                    id="upload-target-project"
                    value={targetProjectId}
                    onChange={(e) => setTargetProjectId(e.target.value)}
                    data-testid="upload-project-select"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
                  >
                    {projects.map((proj) => (
                      <option key={proj.id} value={proj.id}>
                        {proj.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* File Dropzone */}
                <div>
                  <label className="block text-xs font-semibold text-[#0F172A] mb-1.5">
                    Scientific Paper (PDF) <span className="text-rose-500">*</span>
                  </label>
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-slate-300 hover:border-[#2563EB] rounded-xl p-6 text-center bg-slate-50 hover:bg-blue-50/30 transition-colors cursor-pointer space-y-2"
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf,application/pdf"
                      onChange={handleFileChange}
                      data-testid="paper-file-input"
                      className="hidden"
                    />

                    <div className="w-10 h-10 rounded-lg bg-blue-50 text-[#2563EB] flex items-center justify-center mx-auto">
                      <Upload className="w-5 h-5" />
                    </div>

                    {selectedFile ? (
                      <div>
                        <p className="text-xs font-semibold text-[#0F172A]">{selectedFile.name}</p>
                        <p className="text-[11px] text-[#64748B] mt-0.5">
                          {formatFileSize(selectedFile.size)} · Ready to ingest
                        </p>
                      </div>
                    ) : (
                      <div>
                        <p className="text-xs font-medium text-[#0F172A]">
                          Click to browse or drop your scientific PDF here
                        </p>
                        <p className="text-[11px] text-[#64748B] mt-0.5">
                          Supports valid PDF documents up to 50MB
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsUploadModalOpen(false)}
                    disabled={isUploading}
                    className="h-9 px-4 rounded-lg text-xs font-semibold text-slate-700 bg-white border border-slate-200/90 hover:bg-slate-50 shadow-2xs transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    data-testid="submit-upload-paper-btn"
                    disabled={isUploading || !selectedFile}
                    className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-2xs transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    {isUploading ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Uploading & Ingesting...</span>
                      </>
                    ) : (
                      <>
                        <Upload className="w-3.5 h-3.5" />
                        <span>Upload Paper</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
            </div>
          </div>
        </div>
      )}

      {/* ==================== DELETE PAPER MODAL ==================== */}
      {paperToDelete && (
        <div
          data-testid="delete-paper-modal"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 animate-in fade-in duration-150"
        >
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-150">
            <div className="px-6 py-4.5 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">Delete Research Paper</h3>
              <button
                type="button"
                onClick={() => setPaperToDelete(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {deleteError && (
                <div
                  role="alert"
                  className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2"
                >
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{deleteError}</span>
                </div>
              )}

              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                Are you sure you want to delete <span className="font-semibold text-slate-900">"{paperToDelete.title}"</span>?
                This will permanently delete the metadata record and remove the stored PDF file from storage.
              </p>
            </div>

            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setPaperToDelete(null)}
                disabled={isDeleting}
                className="h-9 px-4 rounded-lg text-xs font-semibold text-slate-700 bg-white border border-slate-200/90 hover:bg-slate-50 shadow-2xs transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteConfirm}
                data-testid="confirm-delete-paper-btn"
                disabled={isDeleting}
                className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold shadow-2xs transition-all disabled:opacity-50 cursor-pointer"
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
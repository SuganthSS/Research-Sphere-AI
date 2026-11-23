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
} from 'lucide-react'
import type { Paper, Project } from '../types'
import { getPapers, getProjects, uploadPaper, deletePaper, downloadPaperFile, ApiError } from '../services/api'

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

  return (
    <div className="p-4 sm:p-8 max-w-[1560px] mx-auto w-full space-y-6" data-testid="paper-library-container">
      {/* ==================== PAGE HEADER ==================== */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-[#E2E8F0]">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl sm:text-[26px] font-semibold text-[#0F172A] tracking-tight leading-snug">
              Research Paper Library
            </h1>
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
              v1.0 Ingestion
            </span>
          </div>
          <p className="text-[14px] text-[#64748B] mt-0.5">
            Discover, organize, and analyze your scientific literature.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={handleOpenUpload}
            data-testid="upload-paper-button"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#2563EB] hover:bg-blue-700 text-white text-[13px] font-medium shadow-sm transition-colors cursor-pointer"
          >
            <Upload className="w-4 h-4" />
            <span>+ Upload PDF</span>
          </button>
        </div>
      </div>

      {/* ==================== 1. LIBRARY METRICS (4 CARDS) ==================== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: TOTAL PAPERS */}
        <div className="bg-white p-4 rounded-xl border border-[#E2E8F0] shadow-xs flex items-start justify-between">
          <div className="space-y-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[#64748B]">Total Papers</span>
            <div className="text-2xl font-bold text-[#0F172A]" data-testid="metric-total-papers">
              {papers.length}
            </div>
            <div className="text-xs text-[#64748B]">
              Across {projects.length} {projects.length === 1 ? 'research project' : 'research projects'}
            </div>
          </div>
          <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center text-[#2563EB]">
            <FileText className="w-5 h-5" />
          </div>
        </div>

        {/* Card 2: UPLOADED / STORED */}
        <div className="bg-white p-4 rounded-xl border border-[#E2E8F0] shadow-xs flex items-start justify-between">
          <div className="space-y-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[#64748B]">Uploaded</span>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-[#0F172A]">{papers.length}</span>
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Stored
              </span>
            </div>
            <div className="text-xs text-[#64748B]">Secure filesystem & metadata</div>
          </div>
          <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>

        {/* Card 3: PROCESSING */}
        <div className="bg-white p-4 rounded-xl border border-[#E2E8F0] shadow-xs flex items-start justify-between">
          <div className="space-y-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[#64748B]">Processing</span>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-[#0F172A]">0</span>
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                Module 4
              </span>
            </div>
            <div className="text-xs text-[#64748B]">Parsing pipeline idle</div>
          </div>
          <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500">
            <Clock className="w-5 h-5" />
          </div>
        </div>

        {/* Card 4: NEEDS ATTENTION */}
        <div className="bg-white p-4 rounded-xl border border-[#E2E8F0] shadow-xs flex items-start justify-between">
          <div className="space-y-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[#64748B]">Needs Attention</span>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-[#0F172A]">0</span>
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                Healthy
              </span>
            </div>
            <div className="text-xs text-[#64748B]">All paper files intact</div>
          </div>
          <div className="w-10 h-10 rounded-lg bg-teal-50 flex items-center justify-center text-[#0D9488]">
            <Sparkles className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* ==================== 2. SEARCH & FILTER TOOLBAR ==================== */}
      <div className="bg-white rounded-xl border border-[#E2E8F0] shadow-xs p-4 space-y-3">
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
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-[#0F172A] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB] transition-all"
            />
          </div>

          {/* Project Filter */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-[#64748B] whitespace-nowrap">Project:</span>
            <select
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              data-testid="filter-project-select"
              className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-medium text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
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
            <span className="text-xs text-[#64748B] whitespace-nowrap">Sort:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'recent' | 'title' | 'size')}
              className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-medium text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
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
          className="bg-white border border-[#E2E8F0] rounded-xl shadow-xs overflow-hidden flex flex-col"
        >
          <div className="overflow-x-auto w-full">
            <table className="w-full text-left border-collapse min-w-[800px]">
              <thead>
                <tr className="bg-slate-50 border-b border-[#E2E8F0] text-[11px] font-semibold uppercase text-[#64748B] tracking-wider">
                  <th className="py-3 px-4 min-w-[280px]">Paper Title & Original File</th>
                  <th className="py-3 px-4 min-w-[160px]">Research Project</th>
                  <th className="py-3 px-3 w-28 text-center">Size</th>
                  <th className="py-3 px-3 min-w-[120px] text-center">Status</th>
                  <th className="py-3 px-3 w-32 text-right">Date Added</th>
                  <th className="py-3 px-4 w-36 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0] text-xs text-[#0F172A]">
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
                      className="hover:bg-slate-50/80 transition-colors"
                    >
                      <td className="py-3 px-4">
                        <Link
                          to={`/papers/${paper.id}`}
                          data-testid={`paper-title-link-${paper.id}`}
                          className="font-semibold text-[#0F172A] hover:text-[#2563EB] transition-colors line-clamp-1 leading-snug cursor-pointer block"
                        >
                          {paper.title}
                        </Link>
                        <div className="text-[11px] text-[#64748B] mt-0.5 flex items-center gap-1.5 font-mono">
                          <FileText className="w-3 h-3 text-slate-400 shrink-0" />
                          <span className="truncate max-w-[240px]">{paper.original_filename}</span>
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        {project ? (
                          <Link
                            to={`/projects/${project.id}`}
                            className="inline-flex items-center gap-1 max-w-[180px] truncate text-[11px] bg-slate-100 hover:bg-slate-200 text-slate-700 px-2 py-0.5 rounded font-medium border border-slate-200 transition-colors"
                            title={project.name}
                          >
                            <Folder className="w-3 h-3 text-[#2563EB] shrink-0" />
                            <span className="truncate">{project.name}</span>
                          </Link>
                        ) : (
                          <span className="text-[11px] text-[#64748B] italic">Unknown Project</span>
                        )}
                      </td>

                      <td className="py-3 px-3 text-center text-[#64748B] font-mono text-[11px]">
                        {formatFileSize(paper.file_size)}
                      </td>

                      <td className="py-3 px-3 text-center">
                        <div className="flex flex-col items-center gap-1">
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            <span>Uploaded</span>
                          </span>
                          {paper.extraction_status === 'completed' && (
                            <span
                              data-testid={`badge-extracted-${paper.id}`}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200"
                              title={`Extracted ${paper.page_count ?? ''} pages via PyMuPDF`}
                            >
                              <FileText className="w-2.5 h-2.5 text-blue-600" />
                              <span>{paper.page_count ? `${paper.page_count}p Extracted` : 'Extracted'}</span>
                            </span>
                          )}
                          {paper.chunking_status === 'completed' && (
                            <span
                              data-testid={`badge-chunked-${paper.id}`}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-violet-50 text-violet-700 border border-violet-200"
                              title={`Processed into ${paper.chunk_count ?? ''} chunks`}
                            >
                              <Layers className="w-2.5 h-2.5 text-violet-600" />
                              <span>{paper.chunk_count ? `${paper.chunk_count} Chunks` : 'Chunked'}</span>
                            </span>
                          )}
                          {paper.extraction_status === 'processing' && (
                            <span
                              data-testid={`badge-extracting-${paper.id}`}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200 animate-pulse"
                            >
                              <Loader2 className="w-2.5 h-2.5 text-amber-600 animate-spin" />
                              <span>Extracting...</span>
                            </span>
                          )}
                          {paper.extraction_status === 'failed' && (
                            <span
                              data-testid={`badge-failed-${paper.id}`}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200"
                              title={paper.extraction_error || 'Extraction failed'}
                            >
                              <AlertCircle className="w-2.5 h-2.5 text-rose-600" />
                              <span>Failed</span>
                            </span>
                          )}
                          {(!paper.extraction_status || paper.extraction_status === 'not_started') && (
                            <span
                              data-testid={`badge-not-started-${paper.id}`}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-600 border border-slate-200"
                            >
                              <Clock className="w-2.5 h-2.5 text-slate-400" />
                              <span>Not Extracted</span>
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="py-3 px-3 text-right text-[#64748B] text-[11px] whitespace-nowrap">
                        {addedDate}
                      </td>

                      <td className="py-3 px-4">
                        <div className="flex items-center justify-center gap-1.5">
                          {/* View Detail Link */}
                          <Link
                            to={`/papers/${paper.id}`}
                            data-testid={`view-paper-btn-${paper.id}`}
                            className="p-1.5 text-slate-500 hover:text-[#2563EB] hover:bg-blue-50 rounded-md transition-colors"
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
                            className="p-1.5 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-md transition-colors cursor-pointer"
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
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors cursor-pointer"
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

      {/* ==================== UPLOAD PAPER MODAL ==================== */}
      {isUploadModalOpen && (
        <div
          data-testid="upload-paper-modal"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4"
        >
          <div className="bg-white rounded-xl border border-[#E2E8F0] shadow-xl w-full max-w-lg p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3">
              <div>
                <h3 className="text-lg font-bold text-[#0F172A]">Upload Research Paper</h3>
                <p className="text-xs text-[#64748B] mt-0.5">
                  Associate a scientific PDF with one of your research projects.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsUploadModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {uploadError && (
              <div
                role="alert"
                className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2"
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

                <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#E2E8F0]">
                  <button
                    type="button"
                    onClick={() => setIsUploadModalOpen(false)}
                    disabled={isUploading}
                    className="px-4 py-2 rounded-lg text-xs font-medium text-[#64748B] hover:text-[#0F172A] hover:bg-slate-100 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    data-testid="submit-upload-paper-btn"
                    disabled={isUploading || !selectedFile}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#2563EB] hover:bg-blue-700 text-white text-xs font-semibold shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
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
      )}

      {/* ==================== DELETE PAPER MODAL ==================== */}
      {paperToDelete && (
        <div
          data-testid="delete-paper-modal"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4"
        >
          <div className="bg-white rounded-xl border border-[#E2E8F0] shadow-xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3">
              <h3 className="text-base font-bold text-[#0F172A]">Delete Research Paper</h3>
              <button
                type="button"
                onClick={() => setPaperToDelete(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
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
              Are you sure you want to delete <span className="font-semibold text-[#0F172A]">"{paperToDelete.title}"</span>?
              This will permanently delete the metadata record and remove the stored PDF file from storage.
            </p>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#E2E8F0]">
              <button
                type="button"
                onClick={() => setPaperToDelete(null)}
                disabled={isDeleting}
                className="px-3.5 py-2 rounded-lg text-xs font-medium text-[#64748B] hover:text-[#0F172A] hover:bg-slate-100 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteConfirm}
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
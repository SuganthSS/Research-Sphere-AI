import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  Clock,
  FileText,
  Layers,
  Pencil,
  Trash2,
  AlertCircle,
  Loader2,
  Sparkles,
  Share2,
  X,
  Compass,
  Upload,
  Download,
  ExternalLink,
  CheckCircle2,
} from 'lucide-react'
import {
  getProject,
  updateProject,
  deleteProject,
  getProjectPapers,
  uploadPaper,
  deletePaper,
  downloadPaperFile,
  ApiError,
} from '../services/api'
import { useAuth } from '../context/AuthContext'
import type { Project, Paper } from '../types'

export const ProjectWorkspacePage: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [project, setProject] = useState<Project | null>(null)
  const [papers, setPapers] = useState<Paper[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'overview' | 'corpus' | 'graph' | 'assistant'>('overview')

  // Edit / Delete Modals
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [modalError, setModalError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Paper Upload State
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Paper Actions State
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [paperToDelete, setPaperToDelete] = useState<Paper | null>(null)
  const [isDeletingPaper, setIsDeletingPaper] = useState(false)
  const [deletePaperError, setDeletePaperError] = useState<string | null>(null)

  const fetchProjectDetails = useCallback(async () => {
    if (!projectId) return
    setIsLoading(true)
    setError(null)
    try {
      const [projectData, papersData] = await Promise.all([
        getProject(projectId),
        getProjectPapers(projectId),
      ])
      setProject(projectData)
      setPapers(papersData.papers)
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setError(err.message)
      } else {
        setError('Unable to load project workspace.')
      }
    } finally {
      setIsLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    fetchProjectDetails()
  }, [fetchProjectDetails])

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
  }

  const handleOpenEdit = () => {
    if (!project) return
    setEditName(project.name)
    setEditDescription(project.description || '')
    setModalError(null)
    setIsEditModalOpen(true)
  }

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!project) return

    const trimmed = editName.trim()
    if (!trimmed) {
      setModalError('Project name cannot be empty.')
      return
    }

    setIsSubmitting(true)
    setModalError(null)
    try {
      const updated = await updateProject(project.id, {
        name: trimmed,
        description: editDescription.trim() || null,
      })
      setProject(updated)
      setIsEditModalOpen(false)
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setModalError(err.message)
      } else {
        setModalError('Failed to update project.')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDeleteSubmit = async () => {
    if (!project) return
    setIsSubmitting(true)
    try {
      await deleteProject(project.id)
      setIsDeleteModalOpen(false)
      navigate('/projects')
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        alert(err.message)
      } else {
        alert('Failed to delete project.')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  // Paper Upload Handlers
  const handleOpenUpload = () => {
    setUploadError(null)
    setSelectedFile(null)
    setIsUploadModalOpen(true)
  }

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

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!project || !selectedFile) {
      setUploadError('Please select a PDF file to upload.')
      return
    }

    setIsUploading(true)
    setUploadError(null)

    try {
      const createdPaper = await uploadPaper(project.id, selectedFile)
      setPapers((prev) => [createdPaper, ...prev])
      setIsUploadModalOpen(false)
      setSelectedFile(null)
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setUploadError(err.message)
      } else {
        setUploadError('Failed to upload research paper.')
      }
    } finally {
      setIsUploading(false)
    }
  }

  // Paper Action Handlers
  const handleDownloadPaper = async (paper: Paper) => {
    setDownloadingId(paper.id)
    try {
      await downloadPaperFile(paper.id, paper.original_filename)
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to download paper file.')
    } finally {
      setDownloadingId(null)
    }
  }

  const handleDeletePaperConfirm = async () => {
    if (!paperToDelete) return
    setIsDeletingPaper(true)
    setDeletePaperError(null)

    try {
      await deletePaper(paperToDelete.id)
      setPapers((prev) => prev.filter((p) => p.id !== paperToDelete.id))
      setPaperToDelete(null)
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setDeletePaperError(err.message)
      } else {
        setDeletePaperError('Failed to delete paper.')
      }
    } finally {
      setIsDeletingPaper(false)
    }
  }

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl border border-[#E2E8F0] p-20 text-center shadow-xs max-w-4xl mx-auto my-12">
        <Loader2 className="w-8 h-8 text-[#2563EB] animate-spin mx-auto mb-3" />
        <p className="text-sm font-medium text-[#0F172A]">Loading project workspace...</p>
      </div>
    )
  }

  if (error || !project) {
    return (
      <div className="bg-white rounded-xl border border-rose-200 p-12 text-center shadow-xs max-w-xl mx-auto my-12 space-y-4">
        <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
          <AlertCircle className="w-6 h-6" />
        </div>
        <h2 className="text-lg font-bold text-[#0F172A]">Project Unavailable</h2>
        <p className="text-sm text-[#64748B]">{error || 'Project not found or you do not have permission to access it.'}</p>
        <Link
          to="/projects"
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#2563EB] text-white text-xs font-semibold hover:bg-blue-700 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Return to Projects</span>
        </Link>
      </div>
    )
  }

  const updatedDateStr = new Date(project.updated_at).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })

  return (
    <div className="p-6 lg:p-8 max-w-[1560px] mx-auto w-full space-y-6 lg:space-y-8" data-testid="project-workspace-container">
      {/* ==================== BACK NAVIGATION & ACTIONS ==================== */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-500">
        <div className="flex items-center gap-2">
          <Link
            to="/projects"
            data-testid="back-to-projects-link"
            className="inline-flex items-center gap-1.5 font-medium text-slate-700 hover:text-blue-600 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Projects</span>
          </Link>
          <span className="text-slate-300">/</span>
          <span className="text-slate-900 font-semibold truncate max-w-xs">{project.name}</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            data-testid="workspace-edit-btn"
            onClick={handleOpenEdit}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-slate-200/90 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-2xs transition-colors cursor-pointer"
          >
            <Pencil className="w-3.5 h-3.5 text-slate-400" />
            <span>Edit Project</span>
          </button>
          <button
            type="button"
            data-testid="workspace-delete-btn"
            onClick={() => setIsDeleteModalOpen(true)}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-rose-200 bg-white text-xs font-semibold text-rose-700 hover:bg-rose-50 shadow-2xs transition-colors cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5 text-rose-600" />
            <span>Delete</span>
          </button>
        </div>
      </div>

      {/* ==================== WORKSPACE PROJECT HEADER ==================== */}
      <div className="bg-white rounded-xl border border-slate-200/90 p-6 sm:p-7 shadow-2xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight" data-testid="project-workspace-title">
                {project.name}
              </h1>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/80">
                Active
              </span>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200/80">
                Scientific Research
              </span>
            </div>

            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed max-w-3xl" data-testid="project-workspace-desc">
              {project.description || 'No description provided for this research project.'}
            </p>

            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 pt-1">
              <div className="flex items-center gap-1.5 font-medium text-slate-900">
                <div className="w-5 h-5 rounded-full bg-slate-900 text-teal-300 text-[10px] flex items-center justify-center font-bold">
                  RS
                </div>
                <span>{user?.name || 'Researcher'}</span>
              </div>
              <span className="text-slate-300">•</span>
              <div className="flex items-center gap-1 text-slate-500">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                <span>Updated {updatedDateStr}</span>
              </div>
              <span className="text-slate-300">•</span>
              <div className="flex items-center gap-1 font-semibold text-blue-600">
                <FileText className="w-3.5 h-3.5" />
                <span>{papers.length === 1 ? '1 Paper Ingested' : `${papers.length} Papers Ingested`}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ==================== WORKSPACE NAVIGATION TABS ==================== */}
      <div className="flex items-center gap-1.5 p-1 bg-slate-100/90 rounded-xl border border-slate-200/80 max-w-fit">
        <button
          type="button"
          onClick={() => setActiveTab('overview')}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
            activeTab === 'overview'
              ? 'bg-white text-blue-600 shadow-2xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Compass className="w-3.5 h-3.5" />
          <span>Overview</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('corpus')}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
            activeTab === 'corpus'
              ? 'bg-white text-blue-600 shadow-2xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>Literature Corpus</span>
          <span className="px-1.5 py-0.2 rounded-full bg-slate-200/70 text-[10px] text-slate-700 font-mono font-semibold">
            {papers.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('graph')}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
            activeTab === 'graph'
              ? 'bg-white text-blue-600 shadow-2xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Share2 className="w-3.5 h-3.5" />
          <span>Knowledge Graph</span>
          <span className="px-1.5 py-0.2 rounded-full bg-slate-200/70 text-[10px] text-slate-700 font-mono font-semibold">
            0
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('assistant')}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
            activeTab === 'assistant'
              ? 'bg-white text-blue-600 shadow-2xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>AI Assistant</span>
        </button>
      </div>

      {/* ==================== 4 COMPACT OVERVIEW METRICS ==================== */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-xl border border-slate-200/90 shadow-2xs space-y-1.5 hover:border-slate-300 transition-colors">
          <div className="flex items-center justify-between text-slate-500 text-[11px] font-bold uppercase tracking-wider">
            <span>Papers in Corpus</span>
            <div className="p-1 rounded-md bg-blue-50 text-blue-600">
              <FileText className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900 tracking-tight">{papers.length}</div>
          <div className="text-xs text-slate-500">
            {papers.length === 0 ? 'Truthful zero state' : `${papers.length} scientific papers`}
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200/90 shadow-2xs space-y-1.5 hover:border-slate-300 transition-colors">
          <div className="flex items-center justify-between text-slate-500 text-[11px] font-bold uppercase tracking-wider">
            <span>Research Entities</span>
            <div className="p-1 rounded-md bg-teal-50 text-teal-600">
              <Layers className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900 tracking-tight">0</div>
          <div className="text-xs text-slate-500">Awaiting literature</div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200/90 shadow-2xs space-y-1.5 hover:border-slate-300 transition-colors">
          <div className="flex items-center justify-between text-slate-500 text-[11px] font-bold uppercase tracking-wider">
            <span>Evidence Connections</span>
            <div className="p-1 rounded-md bg-indigo-50 text-indigo-600">
              <Share2 className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900 tracking-tight">0</div>
          <div className="text-xs text-slate-500">Graph unpopulated</div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200/90 shadow-2xs space-y-1.5 hover:border-slate-300 transition-colors">
          <div className="flex items-center justify-between text-slate-500 text-[11px] font-bold uppercase tracking-wider">
            <span>AI Sessions</span>
            <div className="p-1 rounded-md bg-amber-50 text-amber-600">
              <Sparkles className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900 tracking-tight">0</div>
          <div className="text-xs text-slate-500">0 discussions</div>
        </div>
      </div>

      {/* ==================== MAIN WORKSPACE ==================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN: Research Objective & Literature (8 cols) */}
        <div className="lg:col-span-8 space-y-6">
          {/* Research Objective Panel */}
          {activeTab === 'overview' && (
            <div className="bg-white rounded-xl border border-slate-200/90 p-6 space-y-4 shadow-2xs">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900 tracking-tight">Research Objective</h3>
                <button
                  type="button"
                  onClick={handleOpenEdit}
                  className="text-xs font-semibold text-blue-600 hover:text-blue-700 cursor-pointer"
                >
                  Edit Objective
                </button>
              </div>

              <div className="p-4 rounded-lg bg-slate-50/70 border-l-4 border-blue-600 text-slate-800 text-xs sm:text-sm leading-relaxed italic">
                “{project.description || 'No specific objective recorded yet. Click Edit Objective to specify literature targets, methodologies, and hypotheses.'}”
              </div>
            </div>
          )}

          {/* Literature Corpus Section */}
          <div className="bg-white rounded-xl border border-slate-200/90 p-6 space-y-4 shadow-2xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-sm font-bold text-slate-900 tracking-tight">Literature Corpus</h3>
                <p className="text-xs text-slate-500 mt-0.5">Scientific publications uploaded to this project.</p>
              </div>

              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-xs font-semibold text-slate-600 font-mono">
                  {papers.length} {papers.length === 1 ? 'Paper' : 'Papers'}
                </span>
                <button
                  type="button"
                  onClick={handleOpenUpload}
                  data-testid="workspace-upload-paper-btn"
                  className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>+ Upload PDF</span>
                </button>
              </div>
            </div>

            {papers.length === 0 ? (
              /* Truthful Empty State */
              <div className="p-8 rounded-xl border border-dashed border-slate-200 text-center space-y-3 bg-slate-50/50">
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto shadow-2xs">
                  <FileText className="w-5 h-5" />
                </div>
                <p className="text-sm font-bold text-slate-900">No papers in this project yet</p>
                <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
                  Upload scientific PDFs to build this project's research literature corpus.
                </p>
                <button
                  type="button"
                  onClick={handleOpenUpload}
                  className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 shadow-2xs transition-colors cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Upload First PDF</span>
                </button>
              </div>
            ) : (
              /* Real Papers List in Project Workspace */
              <div className="divide-y divide-slate-100 border border-slate-200/90 rounded-xl overflow-hidden">
                {papers.map((paper) => (
                  <div
                    key={paper.id}
                    data-testid={`workspace-paper-item-${paper.id}`}
                    className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/70 transition-colors"
                  >
                    <div className="min-w-0 space-y-1">
                      <Link
                        to={`/papers/${paper.id}`}
                        className="text-xs sm:text-sm font-semibold text-slate-900 hover:text-blue-600 transition-colors block truncate max-w-xl"
                        title={paper.title}
                      >
                        {paper.title}
                      </Link>
                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                        <span className="font-mono text-slate-400">{paper.original_filename}</span>
                        <span>•</span>
                        <span>{formatFileSize(paper.file_size)}</span>
                        <span>•</span>
                        <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full font-medium border border-emerald-200/80">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          <span>Uploaded</span>
                        </span>
                        {paper.extraction_status === 'completed' && (
                          <span className="inline-flex items-center gap-1 text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full font-medium border border-blue-200/80">
                            <FileText className="w-3 h-3 text-blue-600" />
                            <span>{paper.page_count ? `${paper.page_count}p Extracted` : 'Extracted'}</span>
                          </span>
                        )}
                        {paper.chunking_status === 'completed' && (
                          <span
                            data-testid={`badge-chunked-${paper.id}`}
                            className="inline-flex items-center gap-1 text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full font-medium border border-purple-200/80"
                          >
                            <Layers className="w-3 h-3 text-purple-600" />
                            <span>{paper.chunk_count ? `${paper.chunk_count} Chunks` : 'Chunked'}</span>
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <Link
                        to={`/papers/${paper.id}`}
                        className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="View Details"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </Link>
                      <button
                        type="button"
                        onClick={() => handleDownloadPaper(paper)}
                        disabled={downloadingId === paper.id}
                        className="p-1.5 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors cursor-pointer"
                        title="Download PDF"
                      >
                        {downloadingId === paper.id ? (
                          <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
                        ) : (
                          <Download className="w-4 h-4" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDeletePaperError(null)
                          setPaperToDelete(paper)
                        }}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                        title="Delete Paper"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: AI Assistant & Graph Preview (4 cols) */}
        <div className="lg:col-span-4 space-y-6">
          {/* Knowledge Graph Preview Card */}
          <div className="bg-white rounded-xl border border-slate-200/90 p-5 space-y-3.5 shadow-2xs">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                <Share2 className="w-3.5 h-3.5 text-blue-600" />
                <span>Knowledge Graph</span>
              </h3>
              <span className="text-[10px] font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full font-semibold">
                0 nodes
              </span>
            </div>

            <div className="h-40 rounded-xl bg-[#0B1220] border border-slate-800 flex flex-col items-center justify-center p-4 text-center relative overflow-hidden group">
              {/* Subtle background glow effect */}
              <div className="absolute inset-0 bg-radial from-blue-500/10 via-transparent to-transparent opacity-60" />
              <div className="relative z-10 space-y-1.5">
                <div className="w-9 h-9 rounded-lg bg-blue-950/80 border border-blue-800/60 flex items-center justify-center text-blue-400 mx-auto shadow-xs">
                  <Share2 className="w-4 h-4" />
                </div>
                <p className="text-xs font-semibold text-slate-200">Scientific Graph View</p>
                <span className="text-[11px] text-slate-400 block max-w-[200px] leading-relaxed">
                  Generate in Knowledge Graph tab to explore entity subgraphs
                </span>
              </div>
            </div>
          </div>

          {/* AI Assistant Preview Card */}
          <div className="bg-white rounded-xl border border-slate-200/90 p-5 space-y-3.5 shadow-2xs">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-blue-50 text-blue-600 flex items-center justify-center">
                <Sparkles className="w-3.5 h-3.5" />
              </div>
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Project AI Assistant</h3>
            </div>

            <p className="text-xs text-slate-500 leading-relaxed">
              Synthesize findings and inspect methodology gaps once literature is indexed into this workspace.
            </p>

            <div className="p-3 rounded-lg bg-slate-50 border border-slate-100 text-xs text-slate-600 flex items-center justify-between">
              <span>Pipeline State:</span>
              <span className="font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200/80">
                Workspace Ready
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ==================== PROJECT EDIT MODAL ==================== */}
      {isEditModalOpen && (
        <div
          data-testid="edit-project-modal"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4"
        >
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="px-6 py-4.5 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">Edit Research Project</h3>
              <button
                type="button"
                onClick={() => setIsEditModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {modalError && (
                <div
                  role="alert"
                  className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2"
                >
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{modalError}</span>
                </div>
              )}

              <form onSubmit={handleEditSubmit} className="space-y-4">
                <div>
                  <label htmlFor="workspace-edit-name" className="block text-xs font-semibold text-slate-900 mb-1.5">
                    Project Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    id="workspace-edit-name"
                    type="text"
                    required
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg bg-white border border-slate-200 text-xs sm:text-sm text-slate-900 focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15"
                  />
                </div>

                <div>
                  <label htmlFor="workspace-edit-desc" className="block text-xs font-semibold text-slate-900 mb-1.5">
                    Research Description
                  </label>
                  <textarea
                    id="workspace-edit-desc"
                    rows={3}
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    className="w-full p-3 rounded-lg bg-white border border-slate-200 text-xs sm:text-sm text-slate-900 focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15 resize-none"
                  />
                </div>

                <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsEditModalOpen(false)}
                    className="h-9 px-4 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    data-testid="submit-workspace-edit-btn"
                    className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    <span>{isSubmitting ? 'Saving...' : 'Save Changes'}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* ==================== PROJECT DELETE MODAL ==================== */}
      {isDeleteModalOpen && (
        <div
          data-testid="delete-project-modal"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4"
        >
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4.5 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2.5 text-rose-600">
                <div className="p-1.5 rounded-lg bg-rose-50 border border-rose-100">
                  <Trash2 className="w-4 h-4 text-rose-600" />
                </div>
                <h3 className="text-base font-bold text-slate-900">Delete Research Project?</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsDeleteModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-xs text-slate-600 leading-relaxed">
                Are you sure you want to delete <span className="font-semibold text-slate-900">“{project.name}”</span>?
                All associated paper records and project configurations will be permanently removed. This action cannot be undone.
              </p>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsDeleteModalOpen(false)}
                  className="h-9 px-4 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isSubmitting}
                  data-testid="confirm-workspace-delete-btn"
                  onClick={handleDeleteSubmit}
                  className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>{isSubmitting ? 'Deleting...' : 'Delete Project'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================== PROJECT PAPER UPLOAD MODAL ==================== */}
      {isUploadModalOpen && (
        <div
          data-testid="workspace-upload-modal"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4"
        >
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="px-6 py-4.5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">Upload to {project.name}</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Select a scientific paper (PDF up to 50MB) to index into this corpus.
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

            <div className="p-6 space-y-4">
              {uploadError && (
                <div
                  role="alert"
                  className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2"
                >
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{uploadError}</span>
                </div>
              )}

              <form onSubmit={handleUploadSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-900 mb-1.5">
                    Research Paper (PDF) <span className="text-rose-500">*</span>
                  </label>
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-slate-200 hover:border-blue-600 rounded-xl p-6 text-center bg-slate-50/70 hover:bg-blue-50/30 transition-colors cursor-pointer space-y-2"
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf,application/pdf"
                      onChange={handleFileChange}
                      className="hidden"
                    />

                    <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center mx-auto shadow-2xs">
                      <Upload className="w-5 h-5" />
                    </div>

                    {selectedFile ? (
                      <div>
                        <p className="text-xs font-semibold text-slate-900">{selectedFile.name}</p>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          {formatFileSize(selectedFile.size)} · Ready to ingest
                        </p>
                      </div>
                    ) : (
                      <div>
                        <p className="text-xs font-medium text-slate-900">
                          Click to browse or drop your scientific PDF here
                        </p>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          Supports PDF up to 50MB
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsUploadModalOpen(false)}
                    disabled={isUploading}
                    className="h-9 px-4 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 border border-slate-200 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isUploading || !selectedFile}
                    className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-2xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    {isUploading ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Uploading...</span>
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
            </div>
          </div>
        </div>
      )}

      {/* ==================== DELETE PAPER MODAL ==================== */}
      {paperToDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4"
        >
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4.5 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">Delete Paper</h3>
              <button
                type="button"
                onClick={() => setPaperToDelete(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {deletePaperError && (
                <div
                  role="alert"
                  className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2"
                >
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{deletePaperError}</span>
                </div>
              )}

              <p className="text-xs text-slate-600 leading-relaxed">
                Are you sure you want to delete <span className="font-semibold text-slate-900">"{paperToDelete.title}"</span>?
                This will remove the paper and its stored file from this project.
              </p>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setPaperToDelete(null)}
                  disabled={isDeletingPaper}
                  className="h-9 px-4 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 border border-slate-200 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDeletePaperConfirm}
                  disabled={isDeletingPaper}
                  className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold shadow-2xs transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {isDeletingPaper ? (
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
        </div>
      )}
    </div>
  )
}
import React, { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import {
  Plus,
  Search,
  ExternalLink,
  MoreVertical,
  Clock,
  FileText,
  AlertCircle,
  Pencil,
  Trash2,
  X,
  Loader2,
  FolderPlus,
  Activity,
  Layers,
} from 'lucide-react'
import { getProjects, createProject, updateProject, deleteProject, ApiError } from '../services/api'
import { useAuth } from '../context/AuthContext'
import type { Project } from '../types'

export const ProjectsPage: React.FC = () => {
  const { user } = useAuth()

  const [projects, setProjects] = useState<Project[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [apiError, setApiError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [activeTab, setActiveTab] = useState<'all' | 'active'>('all')

  // Modals state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [projectToEdit, setProjectToEdit] = useState<Project | null>(null)
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null)

  // Form states
  const [formName, setFormName] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null)

  const fetchProjectList = useCallback(async () => {
    setIsLoading(true)
    setApiError(null)
    try {
      const data = await getProjects()
      setProjects(data.projects)
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setApiError(err.message)
      } else {
        setApiError('Unable to load projects from backend.')
      }
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchProjectList()
  }, [fetchProjectList])

  // Open Create Modal
  const handleOpenCreateModal = () => {
    setFormName('')
    setFormDescription('')
    setFormError(null)
    setIsCreateModalOpen(true)
  }

  // Open Edit Modal
  const handleOpenEditModal = (project: Project) => {
    setProjectToEdit(project)
    setFormName(project.name)
    setFormDescription(project.description || '')
    setFormError(null)
    setActiveMenuId(null)
  }

  // Open Delete Modal
  const handleOpenDeleteModal = (project: Project) => {
    setProjectToDelete(project)
    setActiveMenuId(null)
  }

  // Handle Create Submit
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmedName = formName.trim()
    if (!trimmedName) {
      setFormError('Project name is required.')
      return
    }

    setIsSubmitting(true)
    setFormError(null)
    try {
      const newProj = await createProject({
        name: trimmedName,
        description: formDescription.trim() || null,
      })
      setProjects((prev) => [newProj, ...prev])
      setIsCreateModalOpen(false)
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setFormError(err.message)
      } else {
        setFormError('Failed to create project. Please verify inputs.')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  // Handle Edit Submit
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!projectToEdit) return

    const trimmedName = formName.trim()
    if (!trimmedName) {
      setFormError('Project name cannot be empty.')
      return
    }

    setIsSubmitting(true)
    setFormError(null)
    try {
      const updated = await updateProject(projectToEdit.id, {
        name: trimmedName,
        description: formDescription.trim() || null,
      })
      setProjects((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
      setProjectToEdit(null)
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setFormError(err.message)
      } else {
        setFormError('Failed to update project.')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  // Handle Delete Confirm
  const handleDeleteConfirm = async () => {
    if (!projectToDelete) return
    setIsSubmitting(true)
    try {
      await deleteProject(projectToDelete.id)
      setProjects((prev) => prev.filter((p) => p.id !== projectToDelete.id))
      setProjectToDelete(null)
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

  const filteredProjects = projects.filter((p) => {
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    return p.name.toLowerCase().includes(q) || (p.description && p.description.toLowerCase().includes(q))
  })

  const getInitials = (name?: string) => {
    if (!name) return 'RS'
    const parts = name.trim().split(/\s+/)
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase()
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* ==================== PAGE HEADER ==================== */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2">
        <div>
          <h1 className="text-2xl font-semibold text-[#0F172A] tracking-tight leading-tight">
            Research Projects
          </h1>
          <p className="text-sm text-[#64748B] mt-1">
            Organize your research initiatives, literature collections, and AI-powered analysis.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            data-testid="create-project-btn"
            onClick={handleOpenCreateModal}
            className="inline-flex items-center gap-2 bg-[#2563EB] hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium shadow-xs transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>+ New Project</span>
          </button>
        </div>
      </div>

      {/* ==================== ERROR BANNER ==================== */}
      {apiError && (
        <div
          role="alert"
          className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm flex items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{apiError}</span>
          </div>
          <button
            type="button"
            onClick={fetchProjectList}
            className="text-xs font-semibold text-rose-700 underline hover:text-rose-900 ml-4 cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* ==================== SECTION 1: PROJECT OVERVIEW METRICS ==================== */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: TOTAL PROJECTS */}
        <div className="bg-white p-5 rounded-xl border border-[#E2E8F0] shadow-xs flex flex-col justify-between hover:border-slate-300 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold tracking-wider text-[#64748B] uppercase">
              Total Projects
            </span>
            <div className="p-1.5 rounded-lg bg-blue-50 text-[#2563EB]">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-[#0F172A] tracking-tight" data-testid="metric-total-projects">
              {projects.length}
            </div>
            <div className="text-xs text-[#64748B] mt-1 flex items-center gap-1">
              <span>{projects.length === 1 ? '1 workspace created' : `${projects.length} workspaces created`}</span>
            </div>
          </div>
        </div>

        {/* Card 2: ACTIVE PROJECTS */}
        <div className="bg-white p-5 rounded-xl border border-[#E2E8F0] shadow-xs flex flex-col justify-between hover:border-slate-300 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold tracking-wider text-[#64748B] uppercase">
              Active Projects
            </span>
            <div className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600">
              <Activity className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-[#0F172A] tracking-tight">
              {projects.length}
            </div>
            <div className="text-xs text-[#64748B] mt-1 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span>Active research corpora</span>
            </div>
          </div>
        </div>

        {/* Card 3: PAPERS ACROSS PROJECTS */}
        <div className="bg-white p-5 rounded-xl border border-[#E2E8F0] shadow-xs flex flex-col justify-between hover:border-slate-300 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold tracking-wider text-[#64748B] uppercase">
              Papers Across Projects
            </span>
            <div className="p-1.5 rounded-lg bg-teal-50 text-[#0D9488]">
              <FileText className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-[#0F172A] tracking-tight">0</div>
            <div className="text-xs text-[#64748B] mt-1">
              <span>0 uploaded · Truthful zero state</span>
            </div>
          </div>
        </div>

        {/* Card 4: PROJECTS PROCESSING */}
        <div className="bg-white p-5 rounded-xl border border-[#E2E8F0] shadow-xs flex flex-col justify-between hover:border-slate-300 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold tracking-wider text-[#64748B] uppercase">
              Projects Processing
            </span>
            <div className="p-1.5 rounded-lg bg-amber-50 text-amber-600">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-[#0F172A] tracking-tight">0</div>
            <div className="text-xs text-[#64748B] mt-1">
              <span>Idle pipeline</span>
            </div>
          </div>
        </div>
      </div>

      {/* ==================== SECTION 2: SEARCH & FILTER BAR ==================== */}
      <div className="bg-white p-3 rounded-xl border border-[#E2E8F0] shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex flex-1 items-center gap-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-80">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Search projects by name or description..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg text-xs text-[#0F172A] placeholder:text-slate-400 focus:outline-none focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB]"
            />
          </div>

          <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-[#E2E8F0] text-xs">
            <button
              type="button"
              onClick={() => setActiveTab('all')}
              className={`px-3 py-1 font-medium rounded-md transition-colors cursor-pointer ${
                activeTab === 'all'
                  ? 'bg-white text-[#0F172A] shadow-xs'
                  : 'text-slate-600 hover:text-[#0F172A]'
              }`}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('active')}
              className={`px-3 py-1 font-medium rounded-md transition-colors cursor-pointer ${
                activeTab === 'active'
                  ? 'bg-white text-[#0F172A] shadow-xs'
                  : 'text-slate-600 hover:text-[#0F172A]'
              }`}
            >
              Active
            </button>
          </div>
        </div>

        <div className="text-xs text-[#64748B] self-end sm:self-auto">
          Showing {filteredProjects.length} of {projects.length} {projects.length === 1 ? 'project' : 'projects'}
        </div>
      </div>

      {/* ==================== SECTION 3: PROJECT LIST / EMPTY STATE ==================== */}
      {isLoading ? (
        <div className="bg-white rounded-xl border border-[#E2E8F0] p-16 text-center shadow-xs">
          <Loader2 className="w-8 h-8 text-[#2563EB] animate-spin mx-auto mb-3" />
          <p className="text-sm font-medium text-[#0F172A]">Loading research projects...</p>
        </div>
      ) : projects.length === 0 ? (
        /* APPROVED STITCH EMPTY STATE */
        <div
          data-testid="projects-empty-state"
          className="bg-white rounded-xl border border-dashed border-[#E2E8F0] p-12 text-center max-w-2xl mx-auto shadow-xs my-6 space-y-4"
        >
          <div className="w-16 h-16 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center mx-auto text-[#2563EB]">
            <FolderPlus className="w-8 h-8" />
          </div>

          <div className="space-y-1.5">
            <h3 className="text-lg font-bold text-[#0F172A]">No research projects found</h3>
            <p className="text-sm text-[#64748B] max-w-md mx-auto leading-relaxed">
              Create your first project to organize your literature corpus, compare methods, and synthesize scientific findings.
            </p>
          </div>

          <div className="pt-2">
            <button
              type="button"
              data-testid="empty-create-project-btn"
              onClick={handleOpenCreateModal}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#2563EB] text-white text-sm font-medium hover:bg-blue-700 shadow-sm transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Create First Project</span>
            </button>
          </div>
        </div>
      ) : filteredProjects.length === 0 ? (
        <div className="bg-white rounded-xl border border-[#E2E8F0] p-12 text-center shadow-xs">
          <p className="text-sm text-[#64748B]">No projects match your search query “{searchQuery}”.</p>
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="mt-3 text-xs font-semibold text-[#2563EB] hover:underline"
          >
            Clear Search
          </button>
        </div>
      ) : (
        /* POPULATED 3-COLUMN STITCH CARD GRID */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5" data-testid="projects-grid">
          {filteredProjects.map((project) => (
            <div
              key={project.id}
              data-testid={`project-card-${project.id}`}
              className="bg-white rounded-xl border border-[#E2E8F0] shadow-xs hover:shadow-md hover:border-slate-300 transition-all flex flex-col justify-between p-5 group relative"
            >
              <div>
                {/* Card Top: Badges & Context Menu */}
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                    Scientific Research
                  </span>
                  <div className="flex items-center gap-1.5 relative">
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 bg-emerald-50/60 px-2 py-0.5 rounded border border-emerald-100">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      <span>Active</span>
                    </span>

                    <button
                      type="button"
                      data-testid={`project-options-${project.id}`}
                      onClick={() => setActiveMenuId(activeMenuId === project.id ? null : project.id)}
                      className="text-slate-400 hover:text-slate-600 p-1 rounded hover:bg-slate-50 transition-colors cursor-pointer"
                      title="Project options"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>

                    {/* Dropdown menu */}
                    {activeMenuId === project.id && (
                      <div className="absolute right-0 top-7 w-36 rounded-lg bg-white border border-[#E2E8F0] shadow-lg py-1 z-20">
                        <button
                          type="button"
                          onClick={() => handleOpenEditModal(project)}
                          className="w-full text-left px-3 py-1.5 text-xs text-[#0F172A] hover:bg-slate-50 flex items-center gap-2 cursor-pointer"
                        >
                          <Pencil className="w-3.5 h-3.5 text-slate-500" />
                          <span>Edit Project</span>
                        </button>
                        <button
                          type="button"
                          data-testid={`delete-project-menu-btn-${project.id}`}
                          onClick={() => handleOpenDeleteModal(project)}
                          className="w-full text-left px-3 py-1.5 text-xs text-rose-600 hover:bg-rose-50 flex items-center gap-2 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                          <span>Delete</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Title & Description */}
                <h3 className="text-base font-semibold text-[#0F172A] mt-3 group-hover:text-[#2563EB] transition-colors leading-snug">
                  <Link to={`/projects/${project.id}`}>{project.name}</Link>
                </h3>
                <p className="text-xs text-[#64748B] mt-2 line-clamp-2 leading-relaxed">
                  {project.description || 'No description provided.'}
                </p>
              </div>

              {/* Card Footer */}
              <div className="mt-5 pt-4 border-t border-slate-100 space-y-3">
                <div className="flex items-center justify-between text-xs text-[#64748B]">
                  <div className="flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-slate-400" />
                    <span>0 uploaded papers</span>
                  </div>
                  <div className="flex items-center gap-1 text-slate-400">
                    <Clock className="w-3.5 h-3.5" />
                    <span>
                      {new Date(project.updated_at).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-[#0F172A] text-teal-300 text-[10px] font-semibold flex items-center justify-center">
                      {getInitials(user?.name)}
                    </div>
                    <span className="text-xs font-medium text-[#0F172A] truncate max-w-[120px]">
                      {user?.name || 'Researcher'}
                    </span>
                  </div>

                  <Link
                    to={`/projects/${project.id}`}
                    data-testid={`open-project-btn-${project.id}`}
                    className="inline-flex items-center gap-1 text-xs font-medium text-[#2563EB] hover:text-blue-700 bg-blue-50/70 hover:bg-blue-100/70 px-2.5 py-1 rounded-md transition-colors"
                  >
                    <span>Open Project</span>
                    <ExternalLink className="w-3 h-3" />
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ==================== CREATE PROJECT MODAL ==================== */}
      {isCreateModalOpen && (
        <div
          data-testid="create-project-modal"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4"
        >
          <div className="bg-white rounded-xl border border-[#E2E8F0] shadow-xl w-full max-w-lg p-6 space-y-5 animate-in fade-in zoom-in-95 duration-100">
            <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3">
              <h3 className="text-lg font-bold text-[#0F172A]">Create Research Project</h3>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div
                role="alert"
                data-testid="project-modal-error"
                className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2"
              >
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleCreateSubmit} className="space-y-4">
              <div>
                <label htmlFor="create-project-name" className="block text-xs font-semibold text-[#0F172A] mb-1.5">
                  Project Name <span className="text-rose-500">*</span>
                </label>
                <input
                  id="create-project-name"
                  type="text"
                  required
                  placeholder="e.g. GraphRAG Literature Review"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-lg bg-white border border-[#E2E8F0] text-sm text-[#0F172A] focus:outline-none focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB]"
                />
              </div>

              <div>
                <label htmlFor="create-project-desc" className="block text-xs font-semibold text-[#0F172A] mb-1.5">
                  Research Description (Optional)
                </label>
                <textarea
                  id="create-project-desc"
                  rows={3}
                  placeholder="Describe your research objective, methodology hypotheses, or literature scope..."
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-lg bg-white border border-[#E2E8F0] text-sm text-[#0F172A] focus:outline-none focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB] resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#E2E8F0]">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-[#E2E8F0] bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  data-testid="submit-create-project"
                  className="px-4 py-2 rounded-lg bg-[#2563EB] text-white text-xs font-semibold hover:bg-blue-700 shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>{isSubmitting ? 'Creating...' : 'Create Project'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================== EDIT PROJECT MODAL ==================== */}
      {projectToEdit && (
        <div
          data-testid="edit-project-modal"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4"
        >
          <div className="bg-white rounded-xl border border-[#E2E8F0] shadow-xl w-full max-w-lg p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3">
              <h3 className="text-lg font-bold text-[#0F172A]">Edit Research Project</h3>
              <button
                type="button"
                onClick={() => setProjectToEdit(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div
                role="alert"
                className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2"
              >
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div>
                <label htmlFor="edit-project-name" className="block text-xs font-semibold text-[#0F172A] mb-1.5">
                  Project Name <span className="text-rose-500">*</span>
                </label>
                <input
                  id="edit-project-name"
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-lg bg-white border border-[#E2E8F0] text-sm text-[#0F172A] focus:outline-none focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB]"
                />
              </div>

              <div>
                <label htmlFor="edit-project-desc" className="block text-xs font-semibold text-[#0F172A] mb-1.5">
                  Research Description
                </label>
                <textarea
                  id="edit-project-desc"
                  rows={3}
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-lg bg-white border border-[#E2E8F0] text-sm text-[#0F172A] focus:outline-none focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB] resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#E2E8F0]">
                <button
                  type="button"
                  onClick={() => setProjectToEdit(null)}
                  className="px-4 py-2 rounded-lg border border-[#E2E8F0] bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  data-testid="submit-edit-project"
                  className="px-4 py-2 rounded-lg bg-[#2563EB] text-white text-xs font-semibold hover:bg-blue-700 shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>{isSubmitting ? 'Saving...' : 'Save Changes'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================== DELETE CONFIRMATION MODAL ==================== */}
      {projectToDelete && (
        <div
          data-testid="delete-project-modal"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4"
        >
          <div className="bg-white rounded-xl border border-rose-200 shadow-xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center gap-2.5 text-rose-600">
              <div className="p-2 rounded-full bg-rose-50 border border-rose-100">
                <Trash2 className="w-5 h-5 text-rose-600" />
              </div>
              <h3 className="text-base font-bold text-[#0F172A]">Delete Research Project?</h3>
            </div>

            <p className="text-xs text-[#64748B] leading-relaxed">
              Are you sure you want to delete <span className="font-semibold text-[#0F172A]">“{projectToDelete.name}”</span>?
              All project configuration will be permanently removed from PostgreSQL. This action cannot be undone.
            </p>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#E2E8F0]">
              <button
                type="button"
                onClick={() => setProjectToDelete(null)}
                className="px-4 py-2 rounded-lg border border-[#E2E8F0] bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                data-testid="confirm-delete-project-btn"
                onClick={handleDeleteConfirm}
                className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>{isSubmitting ? 'Deleting...' : 'Delete Project'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

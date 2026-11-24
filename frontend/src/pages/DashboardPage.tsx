import React, { useState, useEffect } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import {
  Folder,
  BookOpen,
  RefreshCw,
  Bot,
  Upload,
  Plus,
  ArrowRight,
  Database,
  Server,
  Sparkles,
  ArrowLeftRight,
  ShieldCheck,
  FileText,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ExternalLink,
} from 'lucide-react'
import type { HealthCheckStatus, DatabaseCheckStatus, Project, Paper } from '../types'
import { getProjects, getPapers } from '../services/api'

interface OutletContextType {
  backendStatus: HealthCheckStatus
  dbStatus: DatabaseCheckStatus
}

export const DashboardPage: React.FC = () => {
  const { backendStatus, dbStatus } = useOutletContext<OutletContextType>()
  const [projects, setProjects] = useState<Project[]>([])
  const [papers, setPapers] = useState<Paper[]>([])

  useEffect(() => {
    let isMounted = true
    Promise.all([getProjects(), getPapers()])
      .then(([projRes, papersRes]) => {
        if (isMounted) {
          setProjects(projRes.projects)
          setPapers(papersRes.papers)
        }
      })
      .catch(() => {
        // Fallback gracefully on fetch error
      })
    return () => {
      isMounted = false
    }
  }, [])

  return (
    <div className="p-6 lg:p-8 max-w-[1560px] mx-auto w-full space-y-6 lg:space-y-8">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200/90">
        <div>
          <h1 className="text-2xl sm:text-[26px] font-bold text-slate-900 tracking-tight leading-snug">
            Research Dashboard
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Your research workspace, literature corpus, and synthesis progress at a glance.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {/* Secondary Action: Upload Paper */}
          <Link
            to="/papers"
            className="inline-flex items-center gap-2 h-9 px-3.5 rounded-lg bg-white border border-slate-200/90 text-slate-700 text-xs sm:text-sm font-medium shadow-2xs hover:bg-slate-50 hover:border-slate-300 transition-all cursor-pointer"
          >
            <Upload className="w-4 h-4 text-slate-500" />
            <span>Upload Paper</span>
          </Link>

          {/* Primary Action: + New Project */}
          <Link
            to="/projects"
            className="inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-medium shadow-2xs transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>New Project</span>
          </Link>
        </div>
      </div>

      {/* 1. Research Overview Metrics (Grid of 4 compact cards with truthful empty state) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-5">
        {/* Metric 1: Active Projects */}
        <div className="bg-white rounded-xl p-5 border border-slate-200/90 shadow-2xs flex items-start justify-between hover:border-slate-300 transition-all">
          <div className="space-y-1">
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Active Projects
            </p>
            <p className="text-3xl font-bold text-slate-900 tracking-tight" data-testid="metric-active-projects">
              {projects.length}
            </p>
            <p className="text-xs text-slate-500 mt-0.5">
              {projects.length === 0
                ? 'No active projects'
                : projects.length === 1
                ? '1 active research project'
                : `${projects.length} active research projects`}
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100/80 text-blue-600 flex items-center justify-center shrink-0">
            <Folder className="w-5 h-5" />
          </div>
        </div>

        {/* Metric 2: Papers in Library */}
        <div className="bg-white rounded-xl p-5 border border-slate-200/90 shadow-2xs flex items-start justify-between hover:border-slate-300 transition-all">
          <div className="space-y-1">
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Papers in Library
            </p>
            <p className="text-3xl font-bold text-slate-900 tracking-tight" data-testid="metric-papers-library">
              {papers.length}
            </p>
            <div className="flex items-center gap-1.5 text-xs text-teal-600 font-medium mt-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-teal-500" />
              <span>
                {papers.length === 0
                  ? '0 papers uploaded'
                  : papers.length === 1
                  ? '1 paper uploaded'
                  : `${papers.length} papers uploaded`}
              </span>
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-teal-50 border border-teal-100/80 text-teal-600 flex items-center justify-center shrink-0">
            <BookOpen className="w-5 h-5" />
          </div>
        </div>

        {/* Metric 3: Papers Processing */}
        <div className="bg-white rounded-xl p-5 border border-slate-200/90 shadow-2xs flex items-start justify-between hover:border-slate-300 transition-all">
          <div className="space-y-1">
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Papers Processing
            </p>
            <p className="text-3xl font-bold text-slate-900 tracking-tight">0</p>
            <p className="text-xs text-slate-500 mt-0.5">0 embedding, 0 chunking</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-200/70 text-slate-500 flex items-center justify-center shrink-0">
            <RefreshCw className="w-5 h-5" />
          </div>
        </div>

        {/* Metric 4: AI Conversations */}
        <div className="bg-white rounded-xl p-5 border border-slate-200/90 shadow-2xs flex items-start justify-between hover:border-slate-300 transition-all">
          <div className="space-y-1">
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              AI Conversations
            </p>
            <p className="text-3xl font-bold text-slate-900 tracking-tight">0</p>
            <p className="text-xs text-slate-500 mt-0.5">0 synthesis sessions</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100/80 text-indigo-600 flex items-center justify-center shrink-0">
            <Bot className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* 2. Main Two-Column Content Grid (~65% / ~35%) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column (~65% width = 8 cols) */}
        <div className="lg:col-span-8 space-y-6">
          {/* Section A: Recent Projects (Truthful Empty State) */}
          <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden">
            <div className="p-5 sm:p-6 flex items-center justify-between border-b border-slate-100">
              <div>
                <h2 className="text-base font-semibold text-slate-900 tracking-tight">Recent Projects</h2>
                <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                  Active corpora and ongoing contextual evaluations
                </p>
              </div>
              <Link
                to="/projects"
                className="text-xs sm:text-sm text-blue-600 hover:text-blue-700 font-semibold inline-flex items-center gap-1 group"
              >
                <span>View all projects</span>
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
              </Link>
            </div>

            {/* Populated or Empty State */}
            {projects.length > 0 ? (
              <div className="divide-y divide-slate-100" data-testid="dashboard-recent-projects-list">
                {projects.slice(0, 3).map((proj) => (
                  <div key={proj.id} className="p-4 sm:px-6 flex items-start justify-between gap-4 hover:bg-slate-50/60 transition-colors group">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Link
                          to={`/projects/${proj.id}`}
                          className="text-sm font-semibold text-slate-900 hover:text-blue-600 transition-colors truncate"
                        >
                          {proj.name}
                        </Link>
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/80 shrink-0">
                          Active
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 line-clamp-1">
                        {proj.description || 'No description provided.'}
                      </p>
                      <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                        <Clock className="w-3 h-3" />
                        <span>
                          Updated{' '}
                          {new Date(proj.updated_at).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                          })}
                        </span>
                      </div>
                    </div>

                    <Link
                      to={`/projects/${proj.id}`}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 bg-blue-50/80 hover:bg-blue-100/80 px-2.5 py-1 rounded-lg border border-blue-100 transition-colors shrink-0"
                    >
                      <span>Open</span>
                      <ExternalLink className="w-3 h-3" />
                    </Link>
                  </div>
                ))}
              </div>
            ) : (
              /* Empty State Callout */
              <div className="py-12 px-4 text-center space-y-3">
                <div className="w-12 h-12 rounded-xl bg-slate-100/80 border border-slate-200/60 text-slate-400 flex items-center justify-center mx-auto shadow-2xs">
                  <Folder className="w-6 h-6" />
                </div>
                <div className="space-y-1 max-w-md mx-auto">
                  <h3 className="text-sm font-semibold text-slate-900">
                    No active research projects yet
                  </h3>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Projects organize your literature collections, research goals, and AI synthesis
                    contexts. Create your first project to get started.
                  </p>
                </div>
                <div className="pt-2">
                  <Link
                    to="/projects"
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200/90 text-xs font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-900 shadow-2xs transition-all"
                  >
                    <Plus className="w-3.5 h-3.5 text-blue-600" />
                    <span>Explore Projects Area</span>
                  </Link>
                </div>
              </div>
            )}
          </div>

          {/* Section B: Recent Papers (Truthful Empty State) */}
          <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden">
            <div className="p-5 sm:p-6 flex items-center justify-between border-b border-slate-100">
              <div>
                <h2 className="text-base font-semibold text-slate-900 tracking-tight">Recent Papers</h2>
                <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                  Recently curated literature and parsed preprints
                </p>
              </div>
              <Link
                to="/papers"
                className="text-xs sm:text-sm text-blue-600 hover:text-blue-700 font-semibold inline-flex items-center gap-1 group"
              >
                <span>View Paper Library</span>
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
              </Link>
            </div>

            {/* Populated or Empty State */}
            {papers.length > 0 ? (
              <div className="divide-y divide-slate-100" data-testid="dashboard-recent-papers-list">
                {papers.slice(0, 3).map((paper) => (
                  <div key={paper.id} className="p-4 sm:px-6 flex items-start justify-between gap-4 hover:bg-slate-50/60 transition-colors group">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Link
                          to={`/papers/${paper.id}`}
                          className="text-sm font-semibold text-slate-900 hover:text-blue-600 transition-colors line-clamp-1"
                        >
                          {paper.title}
                        </Link>
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/80 shrink-0">
                          Uploaded
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 font-mono truncate">
                        {paper.original_filename}
                      </p>
                      <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                        <Clock className="w-3 h-3" />
                        <span>
                          Added{' '}
                          {new Date(paper.created_at).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                          })}
                        </span>
                      </div>
                    </div>

                    <Link
                      to={`/papers/${paper.id}`}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 bg-blue-50/80 hover:bg-blue-100/80 px-2.5 py-1 rounded-lg border border-blue-100 transition-colors shrink-0"
                    >
                      <span>View</span>
                      <ExternalLink className="w-3 h-3" />
                    </Link>
                  </div>
                ))}
              </div>
            ) : (
              /* Empty State Callout */
              <div className="py-12 px-4 text-center space-y-3">
                <div className="w-12 h-12 rounded-xl bg-slate-100/80 border border-slate-200/60 text-slate-400 flex items-center justify-center mx-auto shadow-2xs">
                  <FileText className="w-6 h-6" />
                </div>
                <div className="space-y-1 max-w-md mx-auto">
                  <h3 className="text-sm font-semibold text-slate-900">
                    No papers in library yet
                  </h3>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Ingest research papers via PDF upload, arXiv identifiers, or PubMed DOIs to unlock automated methodology extraction.
                  </p>
                </div>
                <div className="pt-2">
                  <Link
                    to="/papers"
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200/90 text-xs font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-900 shadow-2xs transition-all"
                  >
                    <Upload className="w-3.5 h-3.5 text-teal-600" />
                    <span>Go to Paper Library</span>
                  </Link>
                </div>
              </div>
            )}
          </div>

          {/* Section C: Epistemic Evidence Standards Card */}
          <div className="bg-white rounded-xl border border-slate-200/90 p-5 sm:p-6 shadow-2xs space-y-4">
            <div className="border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-teal-600" />
                <h2 className="text-base font-semibold text-slate-900 tracking-tight">
                  Scientific Evidence Grounding Standards
                </h2>
              </div>
              <p className="text-xs sm:text-sm text-slate-500 mt-1">
                ResearchSphere AI strictly separates empirical facts from AI hypotheses and literature gaps.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-left">
              {/* Fact 1 */}
              <div className="p-4 rounded-xl bg-teal-50/50 border border-teal-200/80 space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-teal-700">
                  <CheckCircle2 className="w-3.5 h-3.5 text-teal-600" />
                  <span>Source-Supported Finding</span>
                </div>
                <p className="text-xs text-slate-700 leading-relaxed">
                  Empirical findings extracted directly from peer-reviewed literature with verified coordinates.
                </p>
                <span className="inline-block text-[10px] font-mono font-medium text-teal-700 bg-white px-2 py-0.5 rounded-full border border-teal-200">
                  Epistemic: Fact
                </span>
              </div>

              {/* Fact 2 */}
              <div className="p-4 rounded-xl bg-blue-50/50 border border-blue-200/80 space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-blue-700">
                  <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                  <span>AI-Generated Hypothesis</span>
                </div>
                <p className="text-xs text-slate-700 leading-relaxed">
                  Synthesized extrapolations derived from multi-paper co-citations. Requires experimental validation.
                </p>
                <span className="inline-block text-[10px] font-mono font-medium text-blue-700 bg-white px-2 py-0.5 rounded-full border border-blue-200">
                  Epistemic: Hypothesis
                </span>
              </div>

              {/* Fact 3 */}
              <div className="p-4 rounded-xl bg-amber-50/60 border border-amber-200/80 space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-800">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                  <span>Potential Research Gap</span>
                </div>
                <p className="text-xs text-slate-700 leading-relaxed">
                  Topological gaps between disciplines. Caveat: requires domain validation and scrutiny.
                </p>
                <span className="inline-block text-[10px] font-mono font-medium text-amber-800 bg-white px-2 py-0.5 rounded-full border border-amber-200">
                  Epistemic: Caveat
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column (~35% width = 4 cols) */}
        <div className="lg:col-span-4 space-y-6">
          {/* Quick Actions Panel */}
          <div className="bg-white rounded-xl border border-slate-200/90 p-5 sm:p-6 shadow-2xs space-y-4">
            <div className="pb-2 border-b border-slate-100">
              <h2 className="text-base font-semibold text-slate-900 tracking-tight">Quick Actions</h2>
              <p className="text-xs text-slate-500 mt-0.5">Immediate operational workflows</p>
            </div>

            <div className="space-y-2.5">
              {/* Action 1 */}
              <Link
                to="/projects"
                className="w-full text-left p-3 rounded-xl bg-slate-50/60 hover:bg-slate-100/70 border border-slate-200/80 transition-all flex items-center gap-3 group"
              >
                <div className="w-9 h-9 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center shrink-0 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                  <Folder className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs sm:text-sm font-semibold text-slate-900 group-hover:text-blue-600 transition-colors">
                    Create Project
                  </div>
                  <div className="text-[11px] text-slate-500 truncate mt-0.5">
                    Set up a new research workspace &amp; corpus
                  </div>
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
              </Link>

              {/* Action 2 */}
              <Link
                to="/papers"
                className="w-full text-left p-3 rounded-xl bg-slate-50/60 hover:bg-slate-100/70 border border-slate-200/80 transition-all flex items-center gap-3 group"
              >
                <div className="w-9 h-9 rounded-lg bg-teal-100 text-teal-700 flex items-center justify-center shrink-0 group-hover:bg-teal-600 group-hover:text-white transition-colors">
                  <Upload className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs sm:text-sm font-semibold text-slate-900 group-hover:text-blue-600 transition-colors">
                    Upload Paper
                  </div>
                  <div className="text-[11px] text-slate-500 truncate mt-0.5">
                    Import PDF, arXiv link, or OpenAlex
                  </div>
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
              </Link>

              {/* Action 3 */}
              <Link
                to="/assistant"
                className="w-full text-left p-3 rounded-xl bg-slate-50/60 hover:bg-slate-100/70 border border-slate-200/80 transition-all flex items-center gap-3 group"
              >
                <div className="w-9 h-9 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs sm:text-sm font-semibold text-slate-900 group-hover:text-blue-600 transition-colors">
                    Ask AI Assistant
                  </div>
                  <div className="text-[11px] text-slate-500 truncate mt-0.5">
                    Synthesize literature or query your library
                  </div>
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
              </Link>

              {/* Action 4 */}
              <Link
                to="/compare"
                className="w-full text-left p-3 rounded-xl bg-slate-50/60 hover:bg-slate-100/70 border border-slate-200/80 transition-all flex items-center gap-3 group"
              >
                <div className="w-9 h-9 rounded-lg bg-slate-200 text-slate-800 flex items-center justify-center shrink-0 group-hover:bg-slate-800 group-hover:text-white transition-colors">
                  <ArrowLeftRight className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs sm:text-sm font-semibold text-slate-900 group-hover:text-blue-600 transition-colors">
                    Compare Papers
                  </div>
                  <div className="text-[11px] text-slate-500 truncate mt-0.5">
                    Side-by-side methodology breakdown
                  </div>
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
              </Link>
            </div>
          </div>

          {/* Processing Activity Card */}
          <div className="bg-white rounded-xl border border-slate-200/90 p-5 sm:p-6 shadow-2xs space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h2 className="text-base font-semibold text-slate-900 tracking-tight">Processing Activity</h2>
              <span className="text-xs font-mono text-slate-500 font-medium">0 Active</span>
            </div>
            <div className="py-6 text-center space-y-1">
              <p className="text-sm font-semibold text-slate-900">No background activity</p>
              <p className="text-xs text-slate-500 max-w-xs mx-auto leading-relaxed">
                Chunking, vector embedding, and entity extraction will stream here in real-time.
              </p>
            </div>
          </div>

          {/* Infrastructure Health Indicator */}
          <div className="bg-white rounded-xl border border-slate-200/90 p-5 sm:p-6 shadow-2xs space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h2 className="text-base font-semibold text-slate-900 tracking-tight">System Infrastructure</h2>
              <span className="text-xs font-mono text-teal-700 font-semibold bg-teal-50 px-2 py-0.5 rounded-full border border-teal-200/70">PostgreSQL 18</span>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50/70 border border-slate-200/80">
                <div className="flex items-center gap-2">
                  <Server className="w-4 h-4 text-blue-600" />
                  <span className="text-slate-900 font-medium">FastAPI Backend</span>
                </div>
                <span
                  className={`font-semibold ${
                    backendStatus === 'connected' ? 'text-teal-600' : 'text-amber-600'
                  }`}
                >
                  {backendStatus === 'connected' ? '200 OK' : 'Checking...'}
                </span>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50/70 border border-slate-200/80">
                <div className="flex items-center gap-2">
                  <Database className="w-4 h-4 text-teal-600" />
                  <span className="text-slate-900 font-medium">PostgreSQL Database</span>
                </div>
                <span
                  className={`font-semibold ${
                    dbStatus === 'connected' ? 'text-teal-600' : 'text-amber-600'
                  }`}
                >
                  {dbStatus === 'connected' ? 'Connected' : 'Checking...'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

import React from 'react'
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
} from 'lucide-react'
import type { HealthCheckStatus, DatabaseCheckStatus } from '../types'

interface OutletContextType {
  backendStatus: HealthCheckStatus
  dbStatus: DatabaseCheckStatus
}

export const DashboardPage: React.FC = () => {
  const { backendStatus, dbStatus } = useOutletContext<OutletContextType>()

  return (
    <div className="p-4 sm:p-8 max-w-[1560px] mx-auto w-full space-y-8">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-[#E2E8F0]">
        <div>
          <h1 className="text-2xl sm:text-[26px] font-semibold text-[#0F172A] tracking-tight leading-snug">
            Research Dashboard
          </h1>
          <p className="text-[14px] text-[#64748B] mt-0.5">
            Your research workspace at a glance.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {/* Secondary Action: Upload Paper (Module 2 preview) */}
          <Link
            to="/papers"
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-white border border-[#E2E8F0] text-[#0F172A] text-[13px] font-medium shadow-xs hover:bg-slate-50 transition-colors cursor-pointer"
          >
            <Upload className="w-4 h-4 text-[#64748B]" />
            <span>Upload Paper</span>
          </Link>

          {/* Primary Action: + New Project */}
          <Link
            to="/projects"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#2563EB] hover:bg-blue-700 text-white text-[13px] font-medium shadow-sm transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>New Project</span>
          </Link>
        </div>
      </div>

      {/* 1. Research Overview Metrics (Grid of 4 compact cards with truthful empty state) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* Metric 1: Active Projects */}
        <div className="bg-white rounded-xl p-5 border border-[#E2E8F0] shadow-xs flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-[11px] font-medium text-[#64748B] uppercase tracking-wider">
              Active Projects
            </p>
            <p className="text-3xl font-bold text-[#0F172A] tracking-tight">0</p>
            <p className="text-[12px] text-[#64748B]">No active projects</p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-blue-50 text-[#2563EB] flex items-center justify-center shrink-0">
            <Folder className="w-5 h-5" />
          </div>
        </div>

        {/* Metric 2: Papers in Library */}
        <div className="bg-white rounded-xl p-5 border border-[#E2E8F0] shadow-xs flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-[11px] font-medium text-[#64748B] uppercase tracking-wider">
              Papers in Library
            </p>
            <p className="text-3xl font-bold text-[#0F172A] tracking-tight">0</p>
            <div className="flex items-center gap-1.5 text-[12px] text-[#0D9488] font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-[#0D9488]" />
              <span>0 fully indexed</span>
            </div>
          </div>
          <div className="w-10 h-10 rounded-lg bg-teal-50 text-[#0D9488] flex items-center justify-center shrink-0">
            <BookOpen className="w-5 h-5" />
          </div>
        </div>

        {/* Metric 3: Papers Processing */}
        <div className="bg-white rounded-xl p-5 border border-[#E2E8F0] shadow-xs flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-[11px] font-medium text-[#64748B] uppercase tracking-wider">
              Papers Processing
            </p>
            <p className="text-3xl font-bold text-[#0F172A] tracking-tight">0</p>
            <p className="text-[12px] text-[#64748B]">0 embedding, 0 chunking</p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-slate-100 text-[#64748B] flex items-center justify-center shrink-0">
            <RefreshCw className="w-5 h-5" />
          </div>
        </div>

        {/* Metric 4: AI Conversations */}
        <div className="bg-white rounded-xl p-5 border border-[#E2E8F0] shadow-xs flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-[11px] font-medium text-[#64748B] uppercase tracking-wider">
              AI Conversations
            </p>
            <p className="text-3xl font-bold text-[#0F172A] tracking-tight">0</p>
            <p className="text-[12px] text-[#64748B]">0 synthesis sessions</p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
            <Bot className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* 2. Main Two-Column Content Grid (~65% / ~35%) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column (~65% width = 8 cols) */}
        <div className="lg:col-span-8 space-y-6">
          {/* Section A: Recent Projects (Truthful Empty State) */}
          <div className="bg-white rounded-xl border border-[#E2E8F0] p-6 shadow-xs">
            <div className="flex items-center justify-between pb-4 border-b border-[#E2E8F0]">
              <div>
                <h2 className="text-[16px] font-semibold text-[#0F172A]">Recent Projects</h2>
                <p className="text-[13px] text-[#64748B]">
                  Active corpora and ongoing contextual evaluations
                </p>
              </div>
              <Link
                to="/projects"
                className="text-[13px] text-[#2563EB] hover:text-blue-700 font-semibold inline-flex items-center gap-1 group"
              >
                <span>View all projects</span>
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
              </Link>
            </div>

            {/* Empty State Callout */}
            <div className="py-10 px-4 text-center space-y-3">
              <div className="w-12 h-12 rounded-xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                <Folder className="w-6 h-6" />
              </div>
              <div className="space-y-1 max-w-md mx-auto">
                <h3 className="text-[15px] font-semibold text-[#0F172A]">
                  No active research projects yet
                </h3>
                <p className="text-[13px] text-[#64748B] leading-relaxed">
                  Projects organize your literature collections, research goals, and AI synthesis
                  contexts. Project creation and management will be enabled in Module 2.
                </p>
              </div>
              <div className="pt-2">
                <Link
                  to="/projects"
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] text-[13px] font-medium text-[#0F172A] hover:bg-slate-100 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5 text-[#2563EB]" />
                  <span>Explore Projects Area</span>
                </Link>
              </div>
            </div>
          </div>

          {/* Section B: Recent Papers (Truthful Empty State) */}
          <div className="bg-white rounded-xl border border-[#E2E8F0] p-6 shadow-xs">
            <div className="flex items-center justify-between pb-4 border-b border-[#E2E8F0]">
              <div>
                <h2 className="text-[16px] font-semibold text-[#0F172A]">Recent Papers</h2>
                <p className="text-[13px] text-[#64748B]">
                  Recently curated literature and parsed preprints
                </p>
              </div>
              <Link
                to="/papers"
                className="text-[13px] text-[#2563EB] hover:text-blue-700 font-semibold inline-flex items-center gap-1 group"
              >
                <span>View Paper Library</span>
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
              </Link>
            </div>

            {/* Empty State Callout */}
            <div className="py-10 px-4 text-center space-y-3">
              <div className="w-12 h-12 rounded-xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                <FileText className="w-6 h-6" />
              </div>
              <div className="space-y-1 max-w-md mx-auto">
                <h3 className="text-[15px] font-semibold text-[#0F172A]">
                  No papers in library yet
                </h3>
                <p className="text-[13px] text-[#64748B] leading-relaxed">
                  Ingest research papers via PDF upload, arXiv identifiers, or PubMed DOIs in
                  Module 2 to unlock automated methodology extraction.
                </p>
              </div>
              <div className="pt-2">
                <Link
                  to="/papers"
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] text-[13px] font-medium text-[#0F172A] hover:bg-slate-100 transition-colors"
                >
                  <Upload className="w-3.5 h-3.5 text-[#0D9488]" />
                  <span>Go to Paper Library</span>
                </Link>
              </div>
            </div>
          </div>

          {/* Section C: Epistemic Evidence Standards Card (Stitch Scientific Design System Highlight) */}
          <div className="bg-white rounded-xl border border-[#E2E8F0] p-6 shadow-xs space-y-4">
            <div className="border-b border-[#E2E8F0] pb-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-[#0D9488]" />
                <h2 className="text-[16px] font-semibold text-[#0F172A]">
                  Scientific Evidence Grounding Standards
                </h2>
              </div>
              <p className="text-[13px] text-[#64748B] mt-0.5">
                ResearchSphere AI strictly separates empirical facts from AI hypotheses and literature gaps.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-left">
              {/* Fact 1 */}
              <div className="p-4 rounded-lg bg-teal-50/50 border border-teal-200 space-y-2">
                <div className="flex items-center gap-1 text-[12px] font-semibold text-[#0D9488]">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Source-Supported Finding</span>
                </div>
                <p className="text-[12px] text-[#0F172A] leading-relaxed">
                  Empirical findings extracted directly from peer-reviewed literature with verified coordinates.
                </p>
                <span className="inline-block text-[10px] font-mono font-medium text-[#0D9488] bg-white px-2 py-0.5 rounded border border-teal-200">
                  Epistemic: Fact
                </span>
              </div>

              {/* Fact 2 */}
              <div className="p-4 rounded-lg bg-blue-50/50 border border-blue-200 space-y-2">
                <div className="flex items-center gap-1 text-[12px] font-semibold text-[#2563EB]">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>AI-Generated Hypothesis</span>
                </div>
                <p className="text-[12px] text-[#0F172A] leading-relaxed">
                  Synthesized extrapolations derived from multi-paper co-citations. Requires experimental validation.
                </p>
                <span className="inline-block text-[10px] font-mono font-medium text-[#2563EB] bg-white px-2 py-0.5 rounded border border-blue-200">
                  Epistemic: Hypothesis
                </span>
              </div>

              {/* Fact 3 */}
              <div className="p-4 rounded-lg bg-amber-50/60 border border-amber-200 space-y-2">
                <div className="flex items-center gap-1 text-[12px] font-semibold text-amber-800">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Potential Research Gap</span>
                </div>
                <p className="text-[12px] text-[#0F172A] leading-relaxed">
                  Topological gaps between disciplines. Caveat: requires domain validation and scrutiny.
                </p>
                <span className="inline-block text-[10px] font-mono font-medium text-amber-800 bg-white px-2 py-0.5 rounded border border-amber-200">
                  Epistemic: Caveat
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column (~35% width = 4 cols) */}
        <div className="lg:col-span-4 space-y-6">
          {/* Quick Actions Panel */}
          <div className="bg-white rounded-xl border border-[#E2E8F0] p-5 shadow-xs space-y-3">
            <div className="pb-1 border-b border-[#E2E8F0]">
              <h2 className="text-[15px] font-semibold text-[#0F172A]">Quick Actions</h2>
              <p className="text-[12px] text-[#64748B]">Immediate operational workflows</p>
            </div>

            <div className="space-y-2">
              {/* Action 1 */}
              <Link
                to="/projects"
                className="w-full text-left p-3 rounded-lg bg-[#F8FAFC] hover:bg-slate-100 transition-colors flex items-center gap-3 group border border-[#E2E8F0]"
              >
                <div className="w-9 h-9 rounded-lg bg-blue-100 text-[#2563EB] flex items-center justify-center shrink-0 group-hover:bg-[#2563EB] group-hover:text-white transition-colors">
                  <Folder className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-semibold text-[#0F172A] group-hover:text-[#2563EB] transition-colors">
                    Create Project
                  </div>
                  <div className="text-[11px] text-[#64748B] truncate">
                    Set up a new research workspace &amp; corpus
                  </div>
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
              </Link>

              {/* Action 2 */}
              <Link
                to="/papers"
                className="w-full text-left p-3 rounded-lg bg-[#F8FAFC] hover:bg-slate-100 transition-colors flex items-center gap-3 group border border-[#E2E8F0]"
              >
                <div className="w-9 h-9 rounded-lg bg-teal-100 text-[#0D9488] flex items-center justify-center shrink-0 group-hover:bg-[#0D9488] group-hover:text-white transition-colors">
                  <Upload className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-semibold text-[#0F172A] group-hover:text-[#2563EB] transition-colors">
                    Upload Paper
                  </div>
                  <div className="text-[11px] text-[#64748B] truncate">
                    Import PDF, arXiv link, or PubMed DOI
                  </div>
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
              </Link>

              {/* Action 3 */}
              <Link
                to="/assistant"
                className="w-full text-left p-3 rounded-lg bg-[#F8FAFC] hover:bg-slate-100 transition-colors flex items-center gap-3 group border border-[#E2E8F0]"
              >
                <div className="w-9 h-9 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-semibold text-[#0F172A] group-hover:text-[#2563EB] transition-colors">
                    Ask AI Assistant
                  </div>
                  <div className="text-[11px] text-[#64748B] truncate">
                    Synthesize literature or query your library
                  </div>
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
              </Link>

              {/* Action 4 */}
              <Link
                to="/compare"
                className="w-full text-left p-3 rounded-lg bg-[#F8FAFC] hover:bg-slate-100 transition-colors flex items-center gap-3 group border border-[#E2E8F0]"
              >
                <div className="w-9 h-9 rounded-lg bg-slate-200 text-[#0F172A] flex items-center justify-center shrink-0 group-hover:bg-[#0F172A] group-hover:text-white transition-colors">
                  <ArrowLeftRight className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-semibold text-[#0F172A] group-hover:text-[#2563EB] transition-colors">
                    Compare Papers
                  </div>
                  <div className="text-[11px] text-[#64748B] truncate">
                    Side-by-side methodology breakdown
                  </div>
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
              </Link>
            </div>
          </div>

          {/* Processing Activity Card */}
          <div className="bg-white rounded-xl border border-[#E2E8F0] p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-[#E2E8F0]">
              <h2 className="text-[15px] font-semibold text-[#0F172A]">Processing Activity</h2>
              <span className="text-[11px] font-mono text-[#64748B]">0 Active</span>
            </div>
            <div className="py-6 text-center space-y-1">
              <p className="text-[13px] font-medium text-[#0F172A]">No background activity</p>
              <p className="text-[11px] text-[#64748B]">
                Chunking, vector embedding, and entity extraction will stream here in real-time.
              </p>
            </div>
          </div>

          {/* Infrastructure Health Indicator */}
          <div className="bg-white rounded-xl border border-[#E2E8F0] p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-[#E2E8F0]">
              <h2 className="text-[15px] font-semibold text-[#0F172A]">System Infrastructure</h2>
              <span className="text-[11px] font-mono text-[#0D9488] font-semibold">PostgreSQL 18</span>
            </div>

            <div className="space-y-2 text-[12px]">
              <div className="flex items-center justify-between p-2 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0]">
                <div className="flex items-center gap-2">
                  <Server className="w-4 h-4 text-[#2563EB]" />
                  <span className="text-[#0F172A] font-medium">FastAPI Backend</span>
                </div>
                <span
                  className={`font-semibold ${
                    backendStatus === 'connected' ? 'text-[#0D9488]' : 'text-amber-500'
                  }`}
                >
                  {backendStatus === 'connected' ? '200 OK' : 'Checking...'}
                </span>
              </div>

              <div className="flex items-center justify-between p-2 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0]">
                <div className="flex items-center gap-2">
                  <Database className="w-4 h-4 text-[#0D9488]" />
                  <span className="text-[#0F172A] font-medium">PostgreSQL Database</span>
                </div>
                <span
                  className={`font-semibold ${
                    dbStatus === 'connected' ? 'text-[#0D9488]' : 'text-amber-500'
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

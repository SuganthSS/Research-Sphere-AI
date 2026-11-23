import React from 'react'
import { FileText, Upload } from 'lucide-react'

export const PapersPage: React.FC = () => {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-slate-800">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
            Research Papers
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Extract, parse, and organize scientific PDFs for semantic RAG synthesis.
          </p>
        </div>

        <button
          type="button"
          disabled
          className="inline-flex items-center space-x-2 px-3.5 py-2 rounded-lg bg-indigo-600/50 text-indigo-200 text-xs font-medium cursor-not-allowed border border-indigo-500/20"
          title="Document ingestion will be introduced in future iterations"
        >
          <Upload className="w-4 h-4" />
          <span>Upload PDF</span>
        </button>
      </div>

      <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/30 p-12 text-center max-w-2xl mx-auto space-y-4 my-8">
        <div className="w-12 h-12 rounded-xl bg-slate-800/80 border border-slate-700/80 flex items-center justify-center mx-auto text-slate-400">
          <FileText className="w-6 h-6" />
        </div>

        <div className="space-y-1">
          <h3 className="text-base font-semibold text-white">No Scientific Papers Ingested</h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
            Upload scientific manuscripts and articles. PyMuPDF parsing, metadata extraction,
            and semantic chunking will process literature for retrieval.
          </p>
        </div>

        <span className="inline-block px-3 py-1 rounded-full bg-slate-800/80 text-[11px] font-mono text-slate-400 border border-slate-700">
          PDF Processing & Document Ingestion Module · Coming in future iterations
        </span>
      </div>
    </div>
  )
}

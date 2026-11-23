import React from 'react'
import { GitCompare } from 'lucide-react'

export const ComparePage: React.FC = () => {
  return (
    <div className="space-y-6">
      <div className="pb-6 border-b border-slate-800">
        <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
          Compare Research Papers
        </h2>
        <p className="text-xs sm:text-sm text-slate-400 mt-1">
          Perform multi-paper comparative analysis across methodologies, benchmarks, and claims.
        </p>
      </div>

      <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/30 p-12 text-center max-w-2xl mx-auto space-y-4 my-8">
        <div className="w-12 h-12 rounded-xl bg-slate-800/80 border border-slate-700/80 flex items-center justify-center mx-auto text-slate-400">
          <GitCompare className="w-6 h-6" />
        </div>

        <div className="space-y-1">
          <h3 className="text-base font-semibold text-white">Comparative Matrix Ready</h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
            Select multiple scientific papers to generate automated side-by-side matrices contrasting
            datasets, evaluation metrics, strengths, limitations, and empirical conclusions.
          </p>
        </div>

        <span className="inline-block px-3 py-1 rounded-full bg-slate-800/80 text-[11px] font-mono text-slate-400 border border-slate-700">
          Paper Comparison Matrix Module · Coming in future iterations
        </span>
      </div>
    </div>
  )
}

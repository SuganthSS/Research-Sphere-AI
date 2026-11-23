import React from 'react'
import { Compass } from 'lucide-react'

export const ResearchGapsPage: React.FC = () => {
  return (
    <div className="space-y-6">
      <div className="pb-6 border-b border-slate-800">
        <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
          Research Gap Discovery
        </h2>
        <p className="text-xs sm:text-sm text-slate-400 mt-1">
          Detect unexplored scientific domains, methodology limitations, and novel hypotheses.
        </p>
      </div>

      <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/30 p-12 text-center max-w-2xl mx-auto space-y-4 my-8">
        <div className="w-12 h-12 rounded-xl bg-slate-800/80 border border-slate-700/80 flex items-center justify-center mx-auto text-slate-400">
          <Compass className="w-6 h-6" />
        </div>

        <div className="space-y-1">
          <h3 className="text-base font-semibold text-white">Gap Discovery Engine Ready</h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
            Automated reasoning algorithms synthesize corpus-level contradictions, under-explored
            intersections, and open challenges to propose high-impact research directions.
          </p>
        </div>

        <span className="inline-block px-3 py-1 rounded-full bg-slate-800/80 text-[11px] font-mono text-slate-400 border border-slate-700">
          Hypothesis & Research Gap Engine · Coming in future iterations
        </span>
      </div>
    </div>
  )
}

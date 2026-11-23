import React from 'react'
import { Sparkles } from 'lucide-react'

export const AssistantPage: React.FC = () => {
  return (
    <div className="space-y-6">
      <div className="pb-6 border-b border-slate-800">
        <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
          AI Research Assistant
        </h2>
        <p className="text-xs sm:text-sm text-slate-400 mt-1">
          Interact with ingested literature through grounded RAG with verifiable citations.
        </p>
      </div>

      <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/30 p-12 text-center max-w-2xl mx-auto space-y-4 my-8">
        <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mx-auto text-indigo-400">
          <Sparkles className="w-6 h-6" />
        </div>

        <div className="space-y-1">
          <h3 className="text-base font-semibold text-white">AI Research Assistant Initialized</h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
            The conversational assistant will synthesize multi-paper queries via Groq LLM
            inference and vector similarity retrieval over indexed paper embeddings.
          </p>
        </div>

        <span className="inline-block px-3 py-1 rounded-full bg-slate-800/80 text-[11px] font-mono text-slate-400 border border-slate-700">
          Groq RAG & Literature Synthesis Module · Coming in future iterations
        </span>
      </div>
    </div>
  )
}

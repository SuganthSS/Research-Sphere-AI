import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Network,
  RefreshCw,
  ZoomIn,
  ZoomOut,
  Maximize2,
  FileText,
  User,
  Hash,
  Cpu,
  Database,
  AlertCircle,
  CheckCircle2,
  X,
} from 'lucide-react'
import cytoscape from 'cytoscape'
import type { Core, EventObject } from 'cytoscape'
import { getPapers, getPaperGraph, generatePaperGraph, getNeo4jStatus } from '../services/api'
import type { Paper, KnowledgeGraphResponse, GraphNode, Neo4jStatusResponse } from '../types'

const NODE_COLORS: Record<string, { bg: string; border: string; text: string; icon: typeof FileText }> = {
  Paper: { bg: '#1E3A8A', border: '#3B82F6', text: '#BFDBFE', icon: FileText },
  Author: { bg: '#92400E', border: '#F59E0B', text: '#FDE68A', icon: User },
  Topic: { bg: '#065F46', border: '#10B981', text: '#A7F3D0', icon: Hash },
  Method: { bg: '#5B21B6', border: '#8B5CF6', text: '#DDD6FE', icon: Cpu },
  Dataset: { bg: '#9F1239', border: '#F43F5E', text: '#FECDD3', icon: Database },
}

export const KnowledgeGraphPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams()
  const [papers, setPapers] = useState<Paper[]>([])
  const [selectedPaperId, setSelectedPaperId] = useState<string>('')
  const [graphData, setGraphData] = useState<KnowledgeGraphResponse | null>(null)
  const [neo4jStatus, setNeo4jStatus] = useState<Neo4jStatusResponse | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null)

  const cyContainerRef = useRef<HTMLDivElement>(null)
  const cyRef = useRef<Core | null>(null)

  // 1. Load papers list and Neo4j status
  useEffect(() => {
    const init = async () => {
      try {
        const [papersResp, neo4jResp] = await Promise.all([
          getPapers(),
          getNeo4jStatus(),
        ])
        const eligible = (papersResp.papers || []).filter(
          (p: Paper) => p.chunking_status === 'completed' || p.status === 'embedded' || p.status === 'processed'
        )
        setPapers(eligible)
        setNeo4jStatus(neo4jResp)

        // Pre-select paper from URL query param if present
        const urlPaperId = searchParams.get('paper')
        if (urlPaperId && eligible.some((p: Paper) => p.id === urlPaperId)) {
          setSelectedPaperId(urlPaperId)
        } else if (eligible.length > 0) {
          setSelectedPaperId(eligible[0].id)
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to load initial graph context.')
      }
    }
    init()
  }, [searchParams])

  // 2. Fetch existing graph when selectedPaperId changes
  const fetchGraph = useCallback(async (paperId: string) => {
    if (!paperId) return
    setIsLoading(true)
    setError(null)
    setSelectedNode(null)
    try {
      const data = await getPaperGraph(paperId)
      setGraphData(data)
    } catch {
      // 404 means not generated yet
      setGraphData(null)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (selectedPaperId) {
      fetchGraph(selectedPaperId)
    }
  }, [selectedPaperId, fetchGraph])

  // 3. Generate / Rebuild Graph
  const handleGenerate = async () => {
    if (!selectedPaperId) return
    setIsGenerating(true)
    setError(null)
    setSelectedNode(null)
    try {
      const data = await generatePaperGraph(selectedPaperId)
      setGraphData(data)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to generate knowledge graph.')
    } finally {
      setIsGenerating(false)
    }
  }

  // 4. Render Cytoscape Graph
  useEffect(() => {
    if (!cyContainerRef.current || !graphData || graphData.nodes.length === 0) {
      if (cyRef.current) {
        cyRef.current.destroy()
        cyRef.current = null
      }
      return
    }

    const elements: cytoscape.ElementDefinition[] = []

    graphData.nodes.forEach((node) => {
      elements.push({
        group: 'nodes',
        data: {
          id: node.id,
          label: node.label,
          name: node.name,
          colorBg: NODE_COLORS[node.label]?.bg || '#334155',
          colorBorder: NODE_COLORS[node.label]?.border || '#64748B',
          colorText: NODE_COLORS[node.label]?.text || '#F8FAFC',
          size: node.label === 'Paper' ? 64 : 44,
        },
      })
    })

    graphData.edges.forEach((edge) => {
      elements.push({
        group: 'edges',
        data: {
          id: edge.id,
          source: edge.source,
          target: edge.target,
          label: edge.label,
        },
      })
    })

    if (cyRef.current) {
      cyRef.current.destroy()
    }

    const cy = cytoscape({
      container: cyContainerRef.current,
      elements,
      style: [
        {
          selector: 'node',
          style: {
            'background-color': 'data(colorBg)',
            'border-color': 'data(colorBorder)',
            'border-width': 2,
            width: 'data(size)',
            height: 'data(size)',
            label: 'data(name)',
            color: '#F8FAFC',
            'font-size': '11px',
            'font-family': 'Inter, system-ui, sans-serif',
            'font-weight': 600,
            'text-valign': 'bottom',
            'text-margin-y': 6,
            'text-wrap': 'ellipsis',
            'text-max-width': '120px',
            'overlay-opacity': 0,
          },
        },
        {
          selector: 'node:selected',
          style: {
            'border-color': '#FFFFFF',
            'border-width': 4,
          },
        },
        {
          selector: 'edge',
          style: {
            width: 1.5,
            'line-color': '#475569',
            'target-arrow-color': '#94A3B8',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            'arrow-scale': 0.9,
            label: 'data(label)',
            'font-size': '9px',
            'font-family': 'monospace',
            color: '#94A3B8',
            'text-rotation': 'autorotate',
            'text-background-color': '#0F172A',
            'text-background-opacity': 0.8,
            'text-background-padding': '2px',
          },
        },
      ],
      layout: {
        name: 'cose',
        animate: false,
        nodeDimensionsIncludeLabels: true,
        nodeRepulsion: () => 450000,
        idealEdgeLength: () => 100,
        padding: 40,
      },
      minZoom: 0.2,
      maxZoom: 3,
      wheelSensitivity: 0.3,
    })

    cy.on('tap', 'node', (evt: EventObject) => {
      const node = evt.target
      const nId = node.id()
      const nLabel = node.data('label')
      const nName = node.data('name')
      setSelectedNode({ id: nId, label: nLabel, name: nName })
    })

    cy.on('tap', (evt: EventObject) => {
      if (evt.target === cy) {
        setSelectedNode(null)
      }
    })

    cyRef.current = cy

    return () => {
      if (cyRef.current) {
        cyRef.current.destroy()
        cyRef.current = null
      }
    }
  }, [graphData])

  // Controls
  const handleZoomIn = () => cyRef.current?.zoom(cyRef.current.zoom() * 1.25)
  const handleZoomOut = () => cyRef.current?.zoom(cyRef.current.zoom() * 0.8)
  const handleFit = () => cyRef.current?.fit(undefined, 30)

  const selectedPaper = papers.find((p) => p.id === selectedPaperId)

  return (
    <div className="space-y-6 max-w-7xl mx-auto" data-testid="knowledge-graph-page">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight flex items-center gap-2">
              <Network className="w-6 h-6 text-indigo-400" />
              Scientific Knowledge Graph
            </h2>
            {/* Neo4j Status Pill */}
            {neo4jStatus && (
              <span
                data-testid="neo4j-status-badge"
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono border ${
                  neo4jStatus.status === 'Connected'
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                    : neo4jStatus.status === 'Not configured'
                    ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                    : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                }`}
                title={neo4jStatus.message}
              >
                {neo4jStatus.status === 'Connected' ? (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                ) : (
                  <AlertCircle className="w-3.5 h-3.5" />
                )}
                Neo4j: {neo4jStatus.status}
              </span>
            )}
          </div>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Topological entities (Authors, Topics, Methods, Datasets) and relationships powered by Cytoscape.js and Neo4j.
          </p>
        </div>

        {/* Paper Selector & Rebuild Button */}
        <div className="flex flex-wrap items-center gap-3">
          <select
            data-testid="paper-select"
            value={selectedPaperId}
            onChange={(e) => {
              setSelectedPaperId(e.target.value)
              setSearchParams({ paper: e.target.value })
            }}
            className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-200 text-xs font-medium focus:outline-none focus:border-indigo-500 max-w-xs truncate"
          >
            {papers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>

          <button
            type="button"
            data-testid="generate-graph-button"
            onClick={handleGenerate}
            disabled={isGenerating || !selectedPaperId}
            className="inline-flex items-center space-x-2 px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-medium transition cursor-pointer shadow-sm shadow-indigo-600/30"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isGenerating ? 'animate-spin' : ''}`} />
            <span>{graphData ? 'Rebuild Graph' : 'Generate Graph'}</span>
          </button>
        </div>
      </div>

      {/* Error alert */}
      {error && (
        <div className="p-4 rounded-xl border border-rose-500/20 bg-rose-500/10 text-rose-300 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-rose-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main Graph Canvas Area */}
      <div className="relative rounded-2xl border border-slate-800 bg-slate-950/70 overflow-hidden min-h-[580px] flex flex-col">
        {/* Graph Legend / Controls Bar */}
        <div className="p-3 border-b border-slate-800 bg-slate-900/60 flex flex-wrap items-center justify-between gap-3 text-xs">
          {/* Legend */}
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-slate-400 font-medium">Entities:</span>
            {Object.entries(NODE_COLORS).map(([label, c]) => (
              <span key={label} className="inline-flex items-center gap-1.5 text-[11px] font-medium" style={{ color: c.border }}>
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: c.border }} />
                {label}
              </span>
            ))}
          </div>

          {/* Canvas Tools */}
          <div className="flex items-center space-x-1">
            <button
              onClick={handleZoomIn}
              className="p-1.5 rounded-md hover:bg-slate-800 text-slate-400 hover:text-slate-200"
              title="Zoom In"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <button
              onClick={handleZoomOut}
              className="p-1.5 rounded-md hover:bg-slate-800 text-slate-400 hover:text-slate-200"
              title="Zoom Out"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <button
              onClick={handleFit}
              className="p-1.5 rounded-md hover:bg-slate-800 text-slate-400 hover:text-slate-200"
              title="Fit to Screen"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Loading state */}
        {(isLoading || isGenerating) && (
          <div className="absolute inset-0 z-20 bg-slate-950/80 backdrop-blur-xs flex flex-col items-center justify-center space-y-3">
            <RefreshCw className="w-8 h-8 text-indigo-400 animate-spin" />
            <p className="text-xs font-medium text-slate-300">
              {isGenerating ? 'Extracting entities with Groq & updating graph...' : 'Loading knowledge graph...'}
            </p>
          </div>
        )}

        {/* Empty state (Not generated yet) */}
        {!isLoading && !isGenerating && (!graphData || graphData.nodes.length === 0) && (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center space-y-4">
            <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
              <Network className="w-6 h-6" />
            </div>
            <div className="space-y-1 max-w-sm">
              <h3 className="text-sm font-semibold text-white">No Knowledge Graph Generated</h3>
              <p className="text-xs text-slate-400">
                {selectedPaper
                  ? `Generate a scientific graph for "${selectedPaper.title}" to visualize its author, topic, method, and dataset relationships.`
                  : 'Select an indexed research paper above to explore its scientific knowledge graph.'}
              </p>
            </div>
            {selectedPaperId && (
              <button
                onClick={handleGenerate}
                className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition cursor-pointer"
              >
                Generate Knowledge Graph Now
              </button>
            )}
          </div>
        )}

        {/* Cytoscape Canvas */}
        <div
          ref={cyContainerRef}
          data-testid="cytoscape-canvas"
          className="flex-1 w-full h-[520px]"
          style={{ display: graphData && graphData.nodes.length > 0 ? 'block' : 'none' }}
        />

        {/* Node Detail Slide-over / Overlay Panel */}
        {selectedNode && (
          <div
            data-testid="node-detail-panel"
            className="absolute top-16 right-4 z-10 w-72 rounded-xl border border-slate-800 bg-slate-900/95 shadow-xl p-4 space-y-3 text-xs"
          >
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <span
                className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold"
                style={{
                  backgroundColor: `${NODE_COLORS[selectedNode.label]?.bg}55`,
                  color: NODE_COLORS[selectedNode.label]?.border,
                  border: `1px solid ${NODE_COLORS[selectedNode.label]?.border}66`,
                }}
              >
                {selectedNode.label}
              </span>
              <button
                onClick={() => setSelectedNode(null)}
                className="text-slate-400 hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1">
              <span className="text-[10px] uppercase font-mono text-slate-400">Entity Name</span>
              <p className="text-sm font-semibold text-white break-words">{selectedNode.name}</p>
            </div>

            <div className="space-y-1">
              <span className="text-[10px] uppercase font-mono text-slate-400">Node ID</span>
              <p className="font-mono text-[11px] text-slate-300 truncate">{selectedNode.id}</p>
            </div>

            <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
              <span>Graph Storage:</span>
              <span className="text-slate-300 font-mono">
                {graphData?.neo4j_synced ? 'Neo4j & Postgres' : 'Postgres'}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

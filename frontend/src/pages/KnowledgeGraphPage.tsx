import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
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
  Layers,
  ArrowRight,
  Filter,
  Info,
} from 'lucide-react'
import cytoscape from 'cytoscape'
import type { Core, EventObject } from 'cytoscape'
import { getPapers, getPaperGraph, generatePaperGraph, getNeo4jStatus } from '../services/api'
import type { Paper, KnowledgeGraphResponse, GraphNode, Neo4jStatusResponse } from '../types'

interface NodeTypeConfig {
  label: string
  bg: string
  border: string
  text: string
  glow: string
  badgeBg: string
  badgeText: string
  badgeBorder: string
  icon: React.ComponentType<{ className?: string }>
}

const NODE_TYPES: Record<string, NodeTypeConfig> = {
  Paper: {
    label: 'Paper',
    bg: '#1E3A8A',
    border: '#60A5FA',
    text: '#DBEAFE',
    glow: '#3B82F6',
    badgeBg: 'bg-blue-500/15',
    badgeText: 'text-blue-300',
    badgeBorder: 'border-blue-500/30',
    icon: FileText,
  },
  Author: {
    label: 'Author',
    bg: '#78350F',
    border: '#FBBF24',
    text: '#FEF3C7',
    glow: '#F59E0B',
    badgeBg: 'bg-amber-500/15',
    badgeText: 'text-amber-300',
    badgeBorder: 'border-amber-500/30',
    icon: User,
  },
  Topic: {
    label: 'Topic',
    bg: '#064E3B',
    border: '#34D399',
    text: '#D1FAE5',
    glow: '#10B981',
    badgeBg: 'bg-teal-500/15',
    badgeText: 'text-teal-300',
    badgeBorder: 'border-teal-500/30',
    icon: Hash,
  },
  Method: {
    label: 'Method',
    bg: '#4C1D95',
    border: '#A78BFA',
    text: '#EDE9FE',
    glow: '#8B5CF6',
    badgeBg: 'bg-purple-500/15',
    badgeText: 'text-purple-300',
    badgeBorder: 'border-purple-500/30',
    icon: Cpu,
  },
  Dataset: {
    label: 'Dataset',
    bg: '#831843',
    border: '#FB7185',
    text: '#FFE4E6',
    glow: '#F43F5E',
    badgeBg: 'bg-rose-500/15',
    badgeText: 'text-rose-300',
    badgeBorder: 'border-rose-500/30',
    icon: Database,
  },
}

function formatEdgeLabel(label: string): string {
  if (!label) return 'related to'
  const cleaned = label.replace(/_/g, ' ').toLowerCase()
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1)
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
  const [activeTypeFilter, setActiveTypeFilter] = useState<string>('all')

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
    setActiveTypeFilter('all')
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
      const cfg = NODE_TYPES[node.label] || {
        bg: '#1E293B',
        border: '#64748B',
        text: '#F8FAFC',
      }
      elements.push({
        group: 'nodes',
        data: {
          id: node.id,
          label: node.label,
          name: node.name,
          colorBg: cfg.bg,
          colorBorder: cfg.border,
          colorText: cfg.text,
          size: node.label === 'Paper' ? 62 : 42,
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
          label: formatEdgeLabel(edge.label),
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
            color: '#F1F5F9',
            'font-size': '11px',
            'font-family': 'Inter, system-ui, sans-serif',
            'font-weight': 600,
            'text-valign': 'bottom',
            'text-margin-y': 6,
            'text-wrap': 'ellipsis',
            'text-max-width': '130px',
            'text-background-color': '#0B1220',
            'text-background-opacity': 0.85,
            'text-background-padding': '3px',
            'text-background-shape': 'roundrectangle',
            'overlay-opacity': 0,
            'transition-property': 'opacity, border-width, border-color',
            'transition-duration': 0.2,
          },
        },
        {
          selector: 'node:selected',
          style: {
            'border-color': '#FFFFFF',
            'border-width': 3,
          },
        },
        {
          selector: '.hidden',
          style: {
            display: 'none',
          },
        },
        {
          selector: 'edge',
          style: {
            width: 1.5,
            'line-color': '#334155',
            'target-arrow-color': '#64748B',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            'arrow-scale': 0.85,
            label: 'data(label)',
            'font-size': '9px',
            'font-family': 'monospace',
            color: '#94A3B8',
            'text-rotation': 'autorotate',
            'text-background-color': '#0B1220',
            'text-background-opacity': 0.9,
            'text-background-padding': '2px',
            'text-background-shape': 'roundrectangle',
            'transition-property': 'opacity, line-color',
            'transition-duration': 0.2,
          },
        },
        {
          selector: '.faded',
          style: {
            opacity: 0.18,
          },
        },
        {
          selector: '.highlighted',
          style: {
            opacity: 1,
            'line-color': '#60A5FA',
            'target-arrow-color': '#93C5FD',
            width: 2.2,
          },
        },
      ],
      layout: {
        name: 'cose',
        animate: false,
        nodeDimensionsIncludeLabels: true,
        nodeRepulsion: () => 500000,
        idealEdgeLength: () => 110,
        padding: 50,
      },
      minZoom: 0.25,
      maxZoom: 3,
      wheelSensitivity: 0.25,
    })

    // Neighborhood highlighting on node tap
    cy.on('tap', 'node', (evt: EventObject) => {
      const node = evt.target
      const nId = node.id()
      const nLabel = node.data('label')
      const nName = node.data('name')
      setSelectedNode({ id: nId, label: nLabel, name: nName })

      // Highlight 1-hop neighborhood and mute unrelated
      cy.elements().removeClass('highlighted')
      cy.elements().addClass('faded')

      const neighborhood = node.neighborhood().add(node)
      neighborhood.removeClass('faded')
      node.connectedEdges().addClass('highlighted')
    })

    // Reset highlighting on canvas tap
    cy.on('tap', (evt: EventObject) => {
      if (evt.target === cy) {
        setSelectedNode(null)
        cy.elements().removeClass('faded highlighted')
      }
    })

    cyRef.current = cy
    ;(window as unknown as { cy?: Core | null }).cy = cy

    return () => {
      ;(window as unknown as { cy?: Core | null }).cy = null
      if (cyRef.current) {
        cyRef.current.destroy()
        cyRef.current = null
      }
    }
  }, [graphData])

  // Filter nodes when activeTypeFilter changes
  useEffect(() => {
    const cy = cyRef.current
    if (!cy) return

    cy.elements().removeClass('faded highlighted')
    if (activeTypeFilter === 'all') {
      cy.elements().removeClass('hidden')
    } else {
      cy.batch(() => {
        cy.nodes().forEach((n) => {
          if (n.data('label') === activeTypeFilter) {
            n.removeClass('hidden')
          } else {
            n.addClass('hidden')
          }
        })
        cy.edges().forEach((e) => {
          if (!e.source().hasClass('hidden') && !e.target().hasClass('hidden')) {
            e.removeClass('hidden')
          } else {
            e.addClass('hidden')
          }
        })
      })
    }
    // Re-fit view to visible elements
    const visibleElements = cy.elements().not('.hidden')
    if (visibleElements.length > 0) {
      cy.fit(visibleElements, 35)
    }
  }, [activeTypeFilter])

  // Canvas Controls
  const handleZoomIn = () => cyRef.current?.zoom(cyRef.current.zoom() * 1.25)
  const handleZoomOut = () => cyRef.current?.zoom(cyRef.current.zoom() * 0.8)
  const handleFit = () => cyRef.current?.fit(undefined, 35)

  // Statistics calculation
  const stats = useMemo(() => {
    if (!graphData) return { nodes: 0, edges: 0, authors: 0, topics: 0, methods: 0, datasets: 0 }
    return {
      nodes: graphData.nodes.length,
      edges: graphData.edges.length,
      authors: graphData.nodes.filter((n) => n.label === 'Author').length,
      topics: graphData.nodes.filter((n) => n.label === 'Topic').length,
      methods: graphData.nodes.filter((n) => n.label === 'Method').length,
      datasets: graphData.nodes.filter((n) => n.label === 'Dataset').length,
    }
  }, [graphData])

  // Selected node relationship connections
  const connectedDetails = useMemo(() => {
    if (!selectedNode || !graphData) return { total: 0, groups: {} as Record<string, { label: string; name: string; relation: string }[]> }
    
    const nodeMap = new Map<string, GraphNode>()
    graphData.nodes.forEach((n) => nodeMap.set(n.id, n))

    const groups: Record<string, { label: string; name: string; relation: string }[]> = {}
    let total = 0

    graphData.edges.forEach((edge) => {
      let otherId: string | null = null
      let relation = formatEdgeLabel(edge.label)
      if (edge.source === selectedNode.id) {
        otherId = edge.target
      } else if (edge.target === selectedNode.id) {
        otherId = edge.source
        relation = `Incoming (${relation})`
      }

      if (otherId && nodeMap.has(otherId)) {
        const otherNode = nodeMap.get(otherId)!
        if (!groups[otherNode.label]) {
          groups[otherNode.label] = []
        }
        groups[otherNode.label].push({
          label: otherNode.label,
          name: otherNode.name,
          relation,
        })
        total += 1
      }
    })

    return { total, groups }
  }, [selectedNode, graphData])

  const selectedPaper = papers.find((p) => p.id === selectedPaperId)

  return (
    <div
      className="p-6 lg:p-8 max-w-[1560px] mx-auto w-full space-y-6 lg:space-y-8"
      data-testid="knowledge-graph-page"
    >
      {/* 1. Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-5 border-b border-slate-200/90">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
              <Network className="w-6 h-6 text-indigo-600" />
              Scientific Knowledge Graph
            </h1>
            {/* Neo4j Status Badge */}
            {neo4jStatus && (
              <span
                data-testid="neo4j-status-badge"
                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                  neo4jStatus.status === 'Connected'
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200/80'
                    : neo4jStatus.status === 'Not configured'
                    ? 'bg-amber-50 text-amber-700 border-amber-200/80'
                    : 'bg-rose-50 text-rose-700 border-rose-200/80'
                }`}
                title={neo4jStatus.message}
              >
                {neo4jStatus.status === 'Connected' ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                ) : (
                  <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
                )}
                Neo4j: {neo4jStatus.status}
              </span>
            )}
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Topological entities (Authors, Topics, Methods, Datasets) and graph relationships extracted across indexed research literature.
          </p>
        </div>

        {/* Paper Selector & Graph Action Button */}
        <div className="flex flex-wrap items-center gap-3">
          <select
            data-testid="paper-select"
            value={selectedPaperId}
            onChange={(e) => {
              setSelectedPaperId(e.target.value)
              setSearchParams({ paper: e.target.value })
            }}
            className="h-9 px-3 rounded-lg bg-white border border-slate-200 text-slate-800 text-xs font-medium shadow-2xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 max-w-xs truncate"
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
            className="h-9 inline-flex items-center space-x-2 px-3.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold transition cursor-pointer shadow-2xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isGenerating ? 'animate-spin' : ''}`} />
            <span>{graphData ? 'Rebuild Graph' : 'Generate Graph'}</span>
          </button>
        </div>
      </div>

      {/* Error alert */}
      {error && (
        <div className="p-4 rounded-xl border border-rose-200 bg-rose-50/70 text-rose-800 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span className="font-medium">{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-rose-500 hover:text-rose-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 2. Compact Statistics Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs p-3.5 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Total Nodes</p>
            <p className="text-lg font-bold text-slate-900 mt-0.5">{stats.nodes}</p>
          </div>
          <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-600">
            <Layers className="w-4 h-4" />
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs p-3.5 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Relationships</p>
            <p className="text-lg font-bold text-slate-900 mt-0.5">{stats.edges}</p>
          </div>
          <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600">
            <Network className="w-4 h-4" />
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs p-3.5 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Authors</p>
            <p className="text-lg font-bold text-amber-700 mt-0.5">{stats.authors}</p>
          </div>
          <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center text-amber-600">
            <User className="w-4 h-4" />
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs p-3.5 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Topics</p>
            <p className="text-lg font-bold text-teal-700 mt-0.5">{stats.topics}</p>
          </div>
          <div className="w-8 h-8 rounded-lg bg-teal-50 flex items-center justify-center text-teal-600">
            <Hash className="w-4 h-4" />
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs p-3.5 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Methods</p>
            <p className="text-lg font-bold text-purple-700 mt-0.5">{stats.methods}</p>
          </div>
          <div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center text-purple-600">
            <Cpu className="w-4 h-4" />
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs p-3.5 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Datasets</p>
            <p className="text-lg font-bold text-rose-700 mt-0.5">{stats.datasets}</p>
          </div>
          <div className="w-8 h-8 rounded-lg bg-rose-50 flex items-center justify-center text-rose-600">
            <Database className="w-4 h-4" />
          </div>
        </div>
      </div>

      {/* 3. Graph Workspace (Canvas + Inspector) */}
      <div className="rounded-2xl border border-slate-200/90 bg-[#0B1220] shadow-sm overflow-hidden flex flex-col">
        {/* Graph Toolbar & Interactive Filters */}
        <div className="px-4 py-3 bg-[#0F172A] border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
          {/* Entity Filter Chips */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-slate-400 font-medium flex items-center gap-1 mr-1">
              <Filter className="w-3.5 h-3.5" />
              Filter:
            </span>
            <button
              type="button"
              onClick={() => setActiveTypeFilter('all')}
              className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition cursor-pointer ${
                activeTypeFilter === 'all'
                  ? 'bg-slate-700 text-white shadow-2xs'
                  : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700'
              }`}
            >
              All ({stats.nodes})
            </button>
            {Object.entries(NODE_TYPES).map(([label, cfg]) => {
              const count =
                label === 'Paper'
                  ? graphData?.nodes.filter((n) => n.label === 'Paper').length || 0
                  : label === 'Author'
                  ? stats.authors
                  : label === 'Topic'
                  ? stats.topics
                  : label === 'Method'
                  ? stats.methods
                  : stats.datasets

              const isActive = activeTypeFilter === label
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => setActiveTypeFilter(isActive ? 'all' : label)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border transition cursor-pointer ${
                    isActive
                      ? `${cfg.badgeBg} ${cfg.badgeText} ${cfg.badgeBorder} ring-1 ring-white/20`
                      : 'bg-slate-800/60 text-slate-400 border-slate-700/60 hover:text-slate-200'
                  }`}
                >
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: cfg.border }}
                  />
                  <span>{label}</span>
                  <span className="text-[10px] opacity-75 font-mono">({count})</span>
                </button>
              )
            })}
          </div>

          {/* Canvas Navigation Tools */}
          <div className="flex items-center space-x-1 border border-slate-700 rounded-lg p-0.5 bg-slate-800/50">
            <button
              onClick={handleZoomIn}
              className="p-1.5 rounded-md hover:bg-slate-700 text-slate-300 hover:text-white transition"
              title="Zoom In"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <button
              onClick={handleZoomOut}
              className="p-1.5 rounded-md hover:bg-slate-700 text-slate-300 hover:text-white transition"
              title="Zoom Out"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <button
              onClick={handleFit}
              className="p-1.5 rounded-md hover:bg-slate-700 text-slate-300 hover:text-white transition"
              title="Fit to Screen"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Canvas & Contextual Inspector Row */}
        <div className="relative flex flex-col lg:flex-row min-h-[640px]">
          {/* Left Canvas Area (~75% on desktop) */}
          <div className="relative flex-1 min-h-[600px] lg:min-h-[640px] flex flex-col">
            {/* Loading Overlay */}
            {(isLoading || isGenerating) && (
              <div className="absolute inset-0 z-20 bg-[#0B1220]/85 backdrop-blur-xs flex flex-col items-center justify-center space-y-3">
                <RefreshCw className="w-8 h-8 text-indigo-400 animate-spin" />
                <p className="text-xs font-medium text-slate-300">
                  {isGenerating ? 'Extracting entities with Groq & updating graph...' : 'Loading knowledge graph...'}
                </p>
              </div>
            )}

            {/* Empty State */}
            {!isLoading && !isGenerating && (!graphData || graphData.nodes.length === 0) && (
              <div className="flex-1 flex flex-col items-center justify-center p-12 text-center space-y-4">
                <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shadow-inner">
                  <Network className="w-7 h-7" />
                </div>
                <div className="space-y-1.5 max-w-sm">
                  <h3 className="text-sm font-semibold text-white">No Knowledge Graph Generated</h3>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    {selectedPaper
                      ? `Generate a topological graph for "${selectedPaper.title}" to map and analyze authors, topics, methods, and datasets.`
                      : 'Select an indexed research paper above to explore its scientific knowledge graph.'}
                  </p>
                </div>
                {selectedPaperId && (
                  <button
                    onClick={handleGenerate}
                    className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition cursor-pointer shadow-md"
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
              className="flex-1 w-full h-full min-h-[600px]"
              style={{ display: graphData && graphData.nodes.length > 0 ? 'block' : 'none' }}
            />
          </div>

          {/* Right Contextual Inspector Panel (~25% width on desktop) */}
          <div
            data-testid="node-detail-panel"
            className="w-full lg:w-80 lg:min-w-[320px] bg-[#0E1626] border-t lg:border-t-0 lg:border-l border-slate-800 p-5 flex flex-col text-xs text-slate-300 overflow-y-auto max-h-[640px]"
          >
            {selectedNode ? (
              <div className="space-y-5">
                {/* Header with Type Badge and Close */}
                <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                      NODE_TYPES[selectedNode.label]?.badgeBg || 'bg-slate-800'
                    } ${
                      NODE_TYPES[selectedNode.label]?.badgeText || 'text-slate-300'
                    } ${
                      NODE_TYPES[selectedNode.label]?.badgeBorder || 'border-slate-700'
                    }`}
                  >
                    {React.createElement(NODE_TYPES[selectedNode.label]?.icon || Network, {
                      className: 'w-3.5 h-3.5',
                    })}
                    {selectedNode.label}
                  </span>
                  <button
                    onClick={() => {
                      setSelectedNode(null)
                      cyRef.current?.elements().removeClass('faded highlighted')
                    }}
                    className="text-slate-400 hover:text-white p-1 rounded-md transition"
                    title="Close Inspector"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Entity Details */}
                <div className="space-y-1">
                  <span className="text-[10px] uppercase font-mono tracking-wider text-slate-500">Entity Name</span>
                  <p className="text-base font-bold text-white break-words leading-snug">{selectedNode.name}</p>
                </div>

                <div className="p-3 rounded-lg bg-[#0B1220] border border-slate-800 space-y-1">
                  <span className="text-[10px] uppercase font-mono tracking-wider text-slate-500">Topological Node ID</span>
                  <p className="font-mono text-[11px] text-slate-300 truncate" title={selectedNode.id}>
                    {selectedNode.id}
                  </p>
                </div>

                {/* Direct Relationships Grouping */}
                <div className="space-y-3 pt-2 border-t border-slate-800/80">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      Direct Relationships
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-slate-800 text-[10px] font-mono text-slate-300">
                      {connectedDetails.total} connected
                    </span>
                  </div>

                  {connectedDetails.total === 0 ? (
                    <p className="text-[11px] text-slate-500 italic">No direct relationships recorded for this node.</p>
                  ) : (
                    <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                      {Object.entries(connectedDetails.groups).map(([type, entities]) => (
                        <div key={type} className="space-y-1.5">
                          <p className="text-[10px] font-mono uppercase text-slate-400 tracking-wider flex items-center gap-1">
                            <span
                              className="w-1.5 h-1.5 rounded-full"
                              style={{ backgroundColor: NODE_TYPES[type]?.border || '#64748B' }}
                            />
                            {type}s ({entities.length})
                          </p>
                          <div className="space-y-1">
                            {entities.map((item, idx) => (
                              <div
                                key={idx}
                                className="p-2 rounded-lg bg-[#0B1220] border border-slate-800/90 text-[11px] flex flex-col gap-1"
                              >
                                <span className="font-medium text-slate-200 line-clamp-2">{item.name}</span>
                                <div className="flex items-center gap-1 text-[10px] text-slate-400 font-mono">
                                  <ArrowRight className="w-3 h-3 text-indigo-400 shrink-0" />
                                  <span>{item.relation}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Storage Badge */}
                <div className="pt-3 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
                  <span>Graph Storage:</span>
                  <span className="text-slate-300 font-mono text-[10px] bg-slate-800 px-2 py-0.5 rounded">
                    {graphData?.neo4j_synced ? 'Neo4j + Postgres' : 'Postgres Fallback'}
                  </span>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-6 space-y-3">
                <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center text-slate-400">
                  <Info className="w-5 h-5" />
                </div>
                <div className="space-y-1">
                  <h4 className="text-xs font-semibold text-slate-200">Contextual Inspector</h4>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    Select any entity node in the graph canvas to inspect its direct taxonomic connections, relationship labels, and storage details.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

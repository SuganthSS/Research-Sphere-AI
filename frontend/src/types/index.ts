/**
 * TypeScript definitions for API responses and application state.
 */

export interface HealthResponse {
  status: string
  service: string
}

export interface DatabaseHealthResponse {
  status: string
  database: string
}

export type HealthCheckStatus = 'loading' | 'connected' | 'unavailable'
export type DatabaseCheckStatus = 'loading' | 'connected' | 'unavailable' | 'unreachable'

export interface HealthCheckState {
  backendStatus: HealthCheckStatus
  backendData: HealthResponse | null
  backendError: string | null
  dbStatus: DatabaseCheckStatus
  dbData: DatabaseHealthResponse | null
  dbError: string | null
  lastChecked: Date | null
}

export interface UserRegisterPayload {
  name: string
  email: string
  password: string
}

export interface UserLoginPayload {
  email: string
  password: string
}

export interface UserResponse {
  id: string
  name: string
  email: string
  created_at: string
}

export interface LoginResponse {
  access_token: string
  token_type: string
  user: UserResponse
}

export interface Project {
  id: string
  user_id: string
  name: string
  description: string | null
  created_at: string
  updated_at: string
}

export interface ProjectCreateInput {
  name: string
  description?: string | null
}

export interface ProjectUpdateInput {
  name?: string | null
  description?: string | null
}

export interface ProjectListResponse {
  projects: Project[]
  total: number
}

export interface Paper {
  id: string
  user_id: string
  project_id: string
  project_name?: string | null
  title: string
  original_filename: string
  file_size: number
  mime_type: string
  status: string
  extraction_status: 'not_started' | 'processing' | 'completed' | 'failed' | string
  page_count?: number | null
  extracted_at?: string | null
  extraction_error?: string | null
  chunking_status: 'not_started' | 'processing' | 'completed' | 'failed' | string
  chunk_count?: number | null
  chunked_at?: string | null
  chunking_error?: string | null
  embedding_status: 'not_started' | 'processing' | 'completed' | 'failed' | string
  embedded_chunk_count?: number | null
  embedded_at?: string | null
  embedding_error?: string | null
  created_at: string
  updated_at: string
}

export interface PaperPage {
  id: string
  paper_id: string
  page_number: number
  text: string
  character_count: number
  created_at: string
}

export interface PaperPagesListResponse {
  paper_id: string
  page_count: number
  pages: PaperPage[]
}

export interface PaperExtractionResponse {
  paper_id: string
  extraction_status: string
  page_count: number
  extracted_at: string
  message: string
}

export interface PaperListResponse {
  papers: Paper[]
  total: number
}

export interface PaperChunk {
  id?: string
  chunk_index: number
  section_name: string | null
  text: string
  character_count: number
  token_count_estimate?: number | null
  start_page: number
  end_page: number
}

export interface PaperChunksListResponse {
  paper_id: string
  chunk_count: number
  sections: string[]
  chunks: PaperChunk[]
}

export interface PaperProcessingResponse {
  paper_id: string
  chunking_status: string
  chunk_count: number
  sections_detected: string[]
  chunked_at: string
  message: string
}

export interface PaperEmbeddingResponse {
  paper_id: string
  embedding_status: string
  embedded_chunk_count: number
  embedded_at: string
  message: string
}

export interface SemanticSearchRequest {
  query: string
  project_id?: string | null
  paper_id?: string | null
  limit?: number
}

export interface SearchResultItem {
  score: number
  paper_id: string
  paper_title: string
  project_id: string
  chunk_id: string
  chunk_index: number
  section_name?: string | null
  start_page: number
  end_page: number
  text: string
  character_count: number
  token_count_estimate?: number | null
}

export interface SemanticSearchResponse {
  query: string
  total_results: number
  results: SearchResultItem[]
}

export interface SourceCitationItem {
  source_number: number
  paper_id: string
  paper_title: string
  chunk_id: string
  chunk_index: number
  section_name: string
  start_page: number
  end_page: number
  similarity_score: number
  text: string
}

export interface AskAssistantRequest {
  question: string
  scope: 'paper' | 'project'
  paper_id?: string | null
  project_id?: string | null
  mode?: 'standard' | 'graph'
}

export interface AskAssistantResponse {
  question: string
  answer: string
  scope: string
  paper_id?: string | null
  project_id?: string | null
  sources: SourceCitationItem[]
  total_sources: number
  insufficient_evidence: boolean
  retrieval_mode?: string
  graph_context_used?: boolean
  graph_entities?: string[]
  graph_relationships?: string[]
  graph_fallback?: boolean
  graph_fallback_reason?: string | null
}

export interface AssistantStatusResponse {
  provider: string
  model: string
  configured: boolean
  status: string
  message: string
}

export interface GroqHealthResponse {
  status: string
  provider: string
  model: string
  configured: boolean
  state: string
  message: string
}

export interface SummaryCitation {
  source_number: number
  paper_id: string
  chunk_id: string
  chunk_index: number
  section_name: string
  start_page: number
  end_page: number
}

export interface SummarySection {
  summary: string
  citations: SummaryCitation[]
}

export interface StructuredSummary {
  objective: SummarySection
  methodology: SummarySection
  dataset_setup: SummarySection
  key_findings: SummarySection
  limitations: SummarySection
  future_work: SummarySection
}

export interface PaperSummaryResponse {
  id: string
  paper_id: string
  summary: StructuredSummary
  model_provider: string
  model_name: string
  created_at: string
  updated_at: string
}

export interface ComparisonCitation {
  source_number: number
  paper_id: string
  chunk_id: string
  chunk_index: number
  section_name: string
  start_page: number
  end_page: number
}

export interface PaperMetadataBrief {
  id: string
  title: string
  original_filename: string
  page_count?: number | null
  chunk_count?: number | null
}

export interface PaperDimensionSummary {
  paper_id: string
  paper_title: string
  summary: string
  citations: ComparisonCitation[]
}

export interface ComparisonDimensionRow {
  dimension: string
  label: string
  papers: Record<string, PaperDimensionSummary>
  synthesis?: string | null
}

export interface SynthesisItem {
  title: string
  description: string
  paper_ids: string[]
  citations: ComparisonCitation[]
}

export interface StructuredComparison {
  compared_papers: PaperMetadataBrief[]
  dimensions: Record<string, ComparisonDimensionRow>
  similarities: SynthesisItem[]
  differences: SynthesisItem[]
}

export interface ComparePapersRequest {
  paper_ids: string[]
}

export interface PaperComparisonResponse {
  id: string
  user_id: string
  paper_ids: string[]
  comparison: StructuredComparison
  model_provider: string
  model_name: string
  created_at: string
  updated_at: string
}

export interface GraphNode {
  id: string
  label: 'Paper' | 'Author' | 'Topic' | 'Method' | 'Dataset' | string
  name: string
  properties?: Record<string, unknown>
}

export interface GraphEdge {
  id: string
  source: string
  target: string
  label: 'AUTHORED_BY' | 'DISCUSSES' | 'USES_METHOD' | 'USES_DATASET' | 'RELATED_TO' | string
  properties?: Record<string, unknown>
}

export interface KnowledgeGraphResponse {
  paper_id: string
  nodes: GraphNode[]
  edges: GraphEdge[]
  neo4j_synced: boolean
}

export interface Neo4jStatusResponse {
  status: 'Connected' | 'Not configured' | 'Unavailable'
  uri: string
  message: string
}

export type GapType =
  | 'Methodological Gap'
  | 'Dataset / Evaluation Gap'
  | 'Limitation-Derived Gap'
  | 'Future-Work Gap'
  | 'Cross-Paper Inconsistency / Underexplored Connection'

export type ConfidenceLevel = 'High' | 'Medium' | 'Low'

export interface GapCitationItem {
  source_number: number
  paper_id: string
  paper_title: string
  chunk_id: string
  chunk_index: number
  section_name: string
  start_page: number
  end_page: number
  text: string
}

export interface PotentialResearchGap {
  id: string
  title: string
  gap_type: GapType
  potential_gap: string
  rationale: string
  why_it_matters: string
  supporting_papers: string[]
  confidence: ConfidenceLevel
  citations: GapCitationItem[]
}

export interface AnalyzeResearchGapsRequest {
  scope: 'selected' | 'project'
  paper_ids?: string[] | null
  force_regenerate?: boolean
}

export interface ResearchGapAnalysisResponse {
  id: string
  project_id: string
  paper_ids: string[]
  gaps: PotentialResearchGap[]
  total_gaps: number
  insufficient_evidence: boolean
  insufficient_evidence_reason?: string | null
  caution_notice: string
  model_provider: string
  model_name: string
  version: number
  created_at: string
  updated_at: string
}

export interface PaperRecommendationItem {
  paper_id: string
  paper_title: string
  project_id: string
  project_name: string
  relevance_score: number
  shared_topics: string[]
  shared_methods: string[]
  recommendation_reason: string
  source_paper_title?: string | null
}

export interface PaperRecommendationsResponse {
  target_paper_id?: string | null
  target_paper_title?: string | null
  total_recommendations: number
  recommendations: PaperRecommendationItem[]
  message?: string | null
}

export interface ResearcherPaperBrief {
  paper_id: string
  paper_title: string
  project_id: string
  project_name: string
}

export interface ResearcherProfile {
  author_id: string
  name: string
  papers_count: number
  papers: ResearcherPaperBrief[]
  topics: string[]
  methods: string[]
  relevance_score: number
  match_label: string
  collaboration_explanation: string
}

export interface ResearcherDiscoveryResponse {
  total_researchers: number
  researchers: ResearcherProfile[]
  caution_notice: string
  message?: string | null
}

export interface DiscoveredPaperItem {
  paper_id: string
  title: string
  authors: string[]
  year?: number | null
  venue?: string | null
  abstract?: string | null
  citation_count: number
  doi?: string | null
  arxiv_id?: string | null
  source_url?: string | null
  is_open_access: boolean
  open_access_pdf_url?: string | null
  provider: string
  topics: string[]
}

export interface PaperDiscoverySearchResponse {
  query: string
  total_results: number
  papers: DiscoveredPaperItem[]
  provider: string
  message?: string | null
}

export interface PaperImportPayload {
  project_id: string
  title: string
  open_access_pdf_url: string
  paper_id?: string | null
  doi?: string | null
  arxiv_id?: string | null
  authors?: string[]
  year?: number | null
  venue?: string | null
  abstract?: string | null
  citation_count?: number | null
  source_url?: string | null
  auto_extract?: boolean
}

export interface PaperImportResponse {
  paper_id: string
  project_id: string
  project_name?: string | null
  title: string
  original_filename: string
  stored_filename: string
  file_size: number
  mime_type: string
  status: string
  extraction_status: string
  page_count?: number | null
  message: string
}








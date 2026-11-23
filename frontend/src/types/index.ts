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

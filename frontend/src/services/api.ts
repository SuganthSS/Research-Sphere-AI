import { envConfig } from '../config/env'
import type {
  HealthResponse,
  DatabaseHealthResponse,
  UserRegisterPayload,
  UserLoginPayload,
  UserResponse,
  LoginResponse,
  Project,
  ProjectCreateInput,
  ProjectUpdateInput,
  ProjectListResponse,
  Paper,
  PaperListResponse,
  PaperChunksListResponse,
  PaperProcessingResponse,
  PaperEmbeddingResponse,
  SemanticSearchRequest,
  SemanticSearchResponse,
  AskAssistantRequest,
  AskAssistantResponse,
  AssistantStatusResponse,
  GroqHealthResponse,
  PaperSummaryResponse,
  PaperComparisonResponse,
} from '../types'

export class ApiError extends Error {
  public statusCode?: number

  constructor(message: string, statusCode?: number) {
    super(message)
    this.name = 'ApiError'
    this.statusCode = statusCode
  }
}

/**
 * Fetches the backend operational health status from GET /api/health.
 */
export async function fetchHealthStatus(signal?: AbortSignal): Promise<HealthResponse> {
  const url = `${envConfig.apiBaseUrl}/api/health`

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
      signal,
    })

    if (!response.ok) {
      throw new ApiError(
        `Backend returned HTTP ${response.status} (${response.statusText || 'Error'})`,
        response.status
      )
    }

    const data = (await response.json()) as HealthResponse

    if (!data || typeof data.status !== 'string' || typeof data.service !== 'string') {
      throw new ApiError('Invalid response format received from backend health endpoint.')
    }

    return data
  } catch (err: unknown) {
    if (err instanceof ApiError) {
      throw err
    }
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw err
    }

    throw new ApiError(
      `Unable to reach backend API at ${envConfig.apiBaseUrl}. Ensure FastAPI server is running.`
    )
  }
}

/**
 * Fetches PostgreSQL database connectivity status from GET /api/health/database.
 */
export async function fetchDatabaseHealthStatus(signal?: AbortSignal): Promise<DatabaseHealthResponse> {
  const url = `${envConfig.apiBaseUrl}/api/health/database`

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
      signal,
    })

    if (response.status === 200 || response.status === 503) {
      const data = (await response.json()) as DatabaseHealthResponse
      return data
    }

    throw new ApiError(
      `Database health check failed with unexpected status: HTTP ${response.status}`,
      response.status
    )
  } catch (err: unknown) {
    if (err instanceof ApiError) {
      throw err
    }
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw err
    }

    throw new ApiError(
      `Could not contact database health endpoint at ${envConfig.apiBaseUrl}. Backend may be offline.`
    )
  }
}

/**
 * Registers a new user account via POST /api/auth/register.
 */
export async function registerUser(
  payload: UserRegisterPayload,
  signal?: AbortSignal
): Promise<UserResponse> {
  const url = `${envConfig.apiBaseUrl}/api/auth/register`

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
      signal,
    })

    if (response.status === 201) {
      return (await response.json()) as UserResponse
    }

    if (response.status === 409) {
      const data = await response.json().catch(() => ({}))
      throw new ApiError(
        data.detail || 'An account with this email already exists.',
        409
      )
    }

    if (response.status === 422) {
      const data = await response.json().catch(() => ({}))
      let msg = 'Invalid registration details provided.'
      if (Array.isArray(data.detail) && data.detail.length > 0) {
        msg = data.detail.map((d: { msg?: string }) => d.msg).filter(Boolean).join(' ') || msg
      }
      throw new ApiError(msg, 422)
    }

    throw new ApiError(`Registration failed with status HTTP ${response.status}`, response.status)
  } catch (err: unknown) {
    if (err instanceof ApiError) {
      throw err
    }
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw err
    }

    throw new ApiError(
      `Unable to reach backend API at ${envConfig.apiBaseUrl}. Please verify server connection.`
    )
  }
}

/**
 * Authenticates user credentials via POST /api/auth/login and receives JWT access token.
 */
export async function loginUser(
  payload: UserLoginPayload,
  signal?: AbortSignal
): Promise<LoginResponse> {
  const url = `${envConfig.apiBaseUrl}/api/auth/login`

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
      signal,
    })

    if (response.status === 200) {
      return (await response.json()) as LoginResponse
    }

    if (response.status === 401) {
      const data = await response.json().catch(() => ({}))
      throw new ApiError(
        data.detail || 'Invalid email or password.',
        401
      )
    }

    if (response.status === 422) {
      const data = await response.json().catch(() => ({}))
      let msg = 'Please enter a valid email and password.'
      if (Array.isArray(data.detail) && data.detail.length > 0) {
        msg = data.detail.map((d: { msg?: string }) => d.msg).filter(Boolean).join(' ') || msg
      }
      throw new ApiError(msg, 422)
    }

    throw new ApiError(`Login failed with status HTTP ${response.status}`, response.status)
  } catch (err: unknown) {
    if (err instanceof ApiError) {
      throw err
    }
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw err
    }

    throw new ApiError(
      `Unable to reach backend API at ${envConfig.apiBaseUrl}. Please verify server connection.`
    )
  }
}

/**
 * Verifies bearer token and retrieves authenticated user from GET /api/auth/me.
 */
export async function fetchCurrentUser(
  token: string,
  signal?: AbortSignal
): Promise<UserResponse> {
  const url = `${envConfig.apiBaseUrl}/api/auth/me`

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
      signal,
    })

    if (response.status === 200) {
      return (await response.json()) as UserResponse
    }

    if (response.status === 401) {
      const data = await response.json().catch(() => ({}))
      throw new ApiError(data.detail || 'Authentication session expired or invalid.', 401)
    }

    throw new ApiError(
      `Session verification failed with status HTTP ${response.status}`,
      response.status
    )
  } catch (err: unknown) {
    if (err instanceof ApiError) {
      throw err
    }
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw err
    }

    throw new ApiError(
      `Unable to reach backend API at ${envConfig.apiBaseUrl} to verify session.`
    )
  }
}

/**
 * Returns the bearer auth header from token or localStorage.
 */
function resolveAuthHeader(token?: string | null): Record<string, string> {
  const authToken = token || (typeof window !== 'undefined' ? localStorage.getItem('researchsphere_token') : null)
  return authToken ? { Authorization: `Bearer ${authToken}` } : {}
}

/**
 * Lists all projects for the authenticated researcher from GET /api/projects.
 */
export async function getProjects(
  token?: string | null,
  signal?: AbortSignal
): Promise<ProjectListResponse> {
  const url = `${envConfig.apiBaseUrl}/api/projects`

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        ...resolveAuthHeader(token),
      },
      signal,
    })

    if (response.status === 200) {
      return (await response.json()) as ProjectListResponse
    }

    if (response.status === 401) {
      const data = await response.json().catch(() => ({}))
      throw new ApiError(data.detail || 'Authentication required to view projects.', 401)
    }

    throw new ApiError(`Failed to fetch projects (HTTP ${response.status})`, response.status)
  } catch (err: unknown) {
    if (err instanceof ApiError) throw err
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    throw new ApiError(`Unable to reach backend API to fetch projects.`)
  }
}

/**
 * Retrieves a single project by ID from GET /api/projects/:projectId.
 */
export async function getProject(
  projectId: string,
  token?: string | null,
  signal?: AbortSignal
): Promise<Project> {
  const url = `${envConfig.apiBaseUrl}/api/projects/${projectId}`

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        ...resolveAuthHeader(token),
      },
      signal,
    })

    if (response.status === 200) {
      return (await response.json()) as Project
    }

    if (response.status === 404) {
      throw new ApiError('Project not found.', 404)
    }

    if (response.status === 401) {
      throw new ApiError('Authentication required to view this project.', 401)
    }

    throw new ApiError(`Failed to fetch project (HTTP ${response.status})`, response.status)
  } catch (err: unknown) {
    if (err instanceof ApiError) throw err
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    throw new ApiError(`Unable to reach backend API to fetch project.`)
  }
}

/**
 * Creates a new research project via POST /api/projects.
 */
export async function createProject(
  payload: ProjectCreateInput,
  token?: string | null,
  signal?: AbortSignal
): Promise<Project> {
  const url = `${envConfig.apiBaseUrl}/api/projects`

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...resolveAuthHeader(token),
      },
      body: JSON.stringify(payload),
      signal,
    })

    if (response.status === 201) {
      return (await response.json()) as Project
    }

    if (response.status === 422) {
      const data = await response.json().catch(() => ({}))
      const detailMsg = Array.isArray(data.detail)
        ? data.detail.map((d: { msg?: string }) => d.msg || '').join(', ')
        : data.detail || 'Validation failed. Please verify project inputs.'
      throw new ApiError(detailMsg, 422)
    }

    if (response.status === 401) {
      throw new ApiError('Authentication required to create a project.', 401)
    }

    throw new ApiError(`Failed to create project (HTTP ${response.status})`, response.status)
  } catch (err: unknown) {
    if (err instanceof ApiError) throw err
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    throw new ApiError(`Unable to reach backend API to create project.`)
  }
}

/**
 * Updates an existing research project via PATCH /api/projects/:projectId.
 */
export async function updateProject(
  projectId: string,
  payload: ProjectUpdateInput,
  token?: string | null,
  signal?: AbortSignal
): Promise<Project> {
  const url = `${envConfig.apiBaseUrl}/api/projects/${projectId}`

  try {
    const response = await fetch(url, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...resolveAuthHeader(token),
      },
      body: JSON.stringify(payload),
      signal,
    })

    if (response.status === 200) {
      return (await response.json()) as Project
    }

    if (response.status === 404) {
      throw new ApiError('Project not found.', 404)
    }

    if (response.status === 422) {
      const data = await response.json().catch(() => ({}))
      const detailMsg = Array.isArray(data.detail)
        ? data.detail.map((d: { msg?: string }) => d.msg || '').join(', ')
        : data.detail || 'Validation failed.'
      throw new ApiError(detailMsg, 422)
    }

    if (response.status === 401) {
      throw new ApiError('Authentication required.', 401)
    }

    throw new ApiError(`Failed to update project (HTTP ${response.status})`, response.status)
  } catch (err: unknown) {
    if (err instanceof ApiError) throw err
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    throw new ApiError(`Unable to reach backend API to update project.`)
  }
}

/**
 * Deletes an existing research project via DELETE /api/projects/:projectId.
 */
export async function deleteProject(
  projectId: string,
  token?: string | null,
  signal?: AbortSignal
): Promise<void> {
  const url = `${envConfig.apiBaseUrl}/api/projects/${projectId}`

  try {
    const response = await fetch(url, {
      method: 'DELETE',
      headers: {
        Accept: 'application/json',
        ...resolveAuthHeader(token),
      },
      signal,
    })

    if (response.status === 204) {
      return
    }

    if (response.status === 404) {
      throw new ApiError('Project not found.', 404)
    }

    if (response.status === 401) {
      throw new ApiError('Authentication required.', 401)
    }

    throw new ApiError(`Failed to delete project (HTTP ${response.status})`, response.status)
  } catch (err: unknown) {
    if (err instanceof ApiError) throw err
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    throw new ApiError(`Unable to reach backend API to delete project.`)
  }
}

/**
 * Lists all papers in user library across all projects from GET /api/papers.
 */
export async function getPapers(
  token?: string | null,
  signal?: AbortSignal
): Promise<PaperListResponse> {
  const url = `${envConfig.apiBaseUrl}/api/papers`

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        ...resolveAuthHeader(token),
      },
      signal,
    })

    if (response.status === 200) {
      return (await response.json()) as PaperListResponse
    }

    if (response.status === 401) {
      throw new ApiError('Authentication required to view papers.', 401)
    }

    throw new ApiError(`Failed to fetch papers (HTTP ${response.status})`, response.status)
  } catch (err: unknown) {
    if (err instanceof ApiError) throw err
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    throw new ApiError('Unable to reach backend API to fetch papers.')
  }
}

/**
 * Lists papers belonging to a specific research project from GET /api/projects/:projectId/papers.
 */
export async function getProjectPapers(
  projectId: string,
  token?: string | null,
  signal?: AbortSignal
): Promise<PaperListResponse> {
  const url = `${envConfig.apiBaseUrl}/api/projects/${projectId}/papers`

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        ...resolveAuthHeader(token),
      },
      signal,
    })

    if (response.status === 200) {
      return (await response.json()) as PaperListResponse
    }

    if (response.status === 404) {
      throw new ApiError('Project not found.', 404)
    }

    if (response.status === 401) {
      throw new ApiError('Authentication required to view project papers.', 401)
    }

    throw new ApiError(`Failed to fetch project papers (HTTP ${response.status})`, response.status)
  } catch (err: unknown) {
    if (err instanceof ApiError) throw err
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    throw new ApiError('Unable to reach backend API to fetch project papers.')
  }
}

/**
 * Retrieves a single paper by ID from GET /api/papers/:paperId.
 */
export async function getPaper(
  paperId: string,
  token?: string | null,
  signal?: AbortSignal
): Promise<Paper> {
  const url = `${envConfig.apiBaseUrl}/api/papers/${paperId}`

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        ...resolveAuthHeader(token),
      },
      signal,
    })

    if (response.status === 200) {
      return (await response.json()) as Paper
    }

    if (response.status === 404) {
      throw new ApiError('Paper not found.', 404)
    }

    if (response.status === 401) {
      throw new ApiError('Authentication required to view paper details.', 401)
    }

    throw new ApiError(`Failed to fetch paper (HTTP ${response.status})`, response.status)
  } catch (err: unknown) {
    if (err instanceof ApiError) throw err
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    throw new ApiError('Unable to reach backend API to fetch paper.')
  }
}

/**
 * Uploads a research PDF paper associated with a project via POST /api/projects/:projectId/papers.
 */
export async function uploadPaper(
  projectId: string,
  file: File,
  token?: string | null,
  signal?: AbortSignal
): Promise<Paper> {
  const url = `${envConfig.apiBaseUrl}/api/projects/${projectId}/papers`
  const formData = new FormData()
  formData.append('file', file)

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        // Do NOT set Content-Type header manually for FormData to let browser generate multipart boundary
        ...resolveAuthHeader(token),
      },
      body: formData,
      signal,
    })

    if (response.status === 201) {
      return (await response.json()) as Paper
    }

    const data = await response.json().catch(() => ({}))
    const detailMsg = Array.isArray(data.detail)
      ? data.detail.map((d: { msg?: string }) => d.msg || '').join(', ')
      : data.detail || `Upload failed with HTTP ${response.status}`

    if (response.status === 400 || response.status === 413 || response.status === 422) {
      throw new ApiError(detailMsg, response.status)
    }

    if (response.status === 404) {
      throw new ApiError('Target research project not found.', 404)
    }

    if (response.status === 401) {
      throw new ApiError('Authentication required to upload papers.', 401)
    }

    throw new ApiError(detailMsg, response.status)
  } catch (err: unknown) {
    if (err instanceof ApiError) throw err
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    throw new ApiError('Unable to reach backend API to upload paper.')
  }
}

/**
 * Downloads the original PDF binary file for a paper via GET /api/papers/:paperId/file.
 */
export async function downloadPaperFile(
  paperId: string,
  suggestedFilename: string,
  token?: string | null
): Promise<void> {
  const url = `${envConfig.apiBaseUrl}/api/papers/${paperId}/file`

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        ...resolveAuthHeader(token),
      },
    })

    if (!response.ok) {
      if (response.status === 404) throw new ApiError('Paper file not found.', 404)
      if (response.status === 401) throw new ApiError('Authentication required to download paper.', 401)
      throw new ApiError(`Failed to download paper file (HTTP ${response.status})`, response.status)
    }

    const blob = await response.blob()
    const downloadUrl = window.URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = downloadUrl
    anchor.download = suggestedFilename || 'paper.pdf'
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
    window.URL.revokeObjectURL(downloadUrl)
  } catch (err: unknown) {
    if (err instanceof ApiError) throw err
    throw new ApiError('Unable to download paper file.')
  }
}

/**
 * Deletes a paper and its underlying storage via DELETE /api/papers/:paperId.
 */
export async function deletePaper(
  paperId: string,
  token?: string | null,
  signal?: AbortSignal
): Promise<void> {
  const url = `${envConfig.apiBaseUrl}/api/papers/${paperId}`

  try {
    const response = await fetch(url, {
      method: 'DELETE',
      headers: {
        Accept: 'application/json',
        ...resolveAuthHeader(token),
      },
      signal,
    })

    if (response.status === 204) {
      return
    }

    if (response.status === 404) {
      throw new ApiError('Paper not found.', 404)
    }

    if (response.status === 401) {
      throw new ApiError('Authentication required to delete paper.', 401)
    }

    throw new ApiError(`Failed to delete paper (HTTP ${response.status})`, response.status)
  } catch (err: unknown) {
    if (err instanceof ApiError) throw err
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    throw new ApiError('Unable to reach backend API to delete paper.')
  }
}

/**
 * Triggers synchronous PDF text extraction via POST /api/papers/:paperId/extract.
 */
export async function extractPaper(
  paperId: string,
  token?: string | null,
  signal?: AbortSignal
): Promise<{ paper_id: string; extraction_status: string; page_count: number; extracted_at: string; message: string }> {
  const url = `${envConfig.apiBaseUrl}/api/papers/${paperId}/extract`

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        ...resolveAuthHeader(token),
      },
      signal,
    })

    if (response.ok) {
      return await response.json()
    }

    if (response.status === 404) {
      throw new ApiError('Research paper not found.', 404)
    }

    if (response.status === 401) {
      throw new ApiError('Authentication required to extract paper text.', 401)
    }

    if (response.status === 422) {
      const data = await response.json().catch(() => ({}))
      throw new ApiError(data.detail || 'Text extraction failed for this PDF document.', 422)
    }

    const data = await response.json().catch(() => ({}))
    throw new ApiError(data.detail || `Extraction failed with HTTP ${response.status}`, response.status)
  } catch (err: unknown) {
    if (err instanceof ApiError) throw err
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    throw new ApiError('Unable to reach backend API to extract paper text.')
  }
}

/**
 * Fetches page-preserved extracted text for a paper via GET /api/papers/:paperId/pages.
 */
export async function getPaperPages(
  paperId: string,
  token?: string | null,
  signal?: AbortSignal
): Promise<{ paper_id: string; page_count: number; pages: import('../types').PaperPage[] }> {
  const url = `${envConfig.apiBaseUrl}/api/papers/${paperId}/pages`

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        ...resolveAuthHeader(token),
      },
      signal,
    })

    if (response.ok) {
      return await response.json()
    }

    if (response.status === 404) {
      throw new ApiError('Research paper not found.', 404)
    }

    if (response.status === 401) {
      throw new ApiError('Authentication required to view extracted pages.', 401)
    }

    throw new ApiError(`Failed to fetch extracted pages (HTTP ${response.status})`, response.status)
  } catch (err: unknown) {
    if (err instanceof ApiError) throw err
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    throw new ApiError('Unable to reach backend API to fetch extracted pages.')
  }
}

/**
 * POST /api/papers/{paperId}/process
 * Triggers text cleaning, section detection, and chunking for an extracted paper.
 * Requires extraction_status === 'completed'.
 */
export async function processPaper(
  paperId: string,
  token?: string | null,
  signal?: AbortSignal,
): Promise<PaperProcessingResponse> {
  const url = `${envConfig.apiBaseUrl}/api/papers/${paperId}/process`

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        ...resolveAuthHeader(token),
      },
      signal,
    })

    if (response.ok) {
      return await response.json()
    }

    if (response.status === 401) {
      throw new ApiError('Authentication required to process document.', 401)
    }

    if (response.status === 404) {
      throw new ApiError('Research paper not found.', 404)
    }

    if (response.status === 422) {
      const body = await response.json().catch(() => ({}))
      throw new ApiError(body?.detail || 'Text extraction must be completed before processing.', 422)
    }

    throw new ApiError(`Failed to process paper (HTTP ${response.status})`, response.status)
  } catch (err: unknown) {
    if (err instanceof ApiError) throw err
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    throw new ApiError('Unable to reach backend API to process paper.')
  }
}

/**
 * GET /api/papers/{paperId}/chunks
 * Retrieves all text chunks for a processed research paper.
 */
export async function getPaperChunks(
  paperId: string,
  token?: string | null,
  signal?: AbortSignal,
): Promise<PaperChunksListResponse> {
  const url = `${envConfig.apiBaseUrl}/api/papers/${paperId}/chunks`

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        ...resolveAuthHeader(token),
      },
      signal,
    })

    if (response.ok) {
      return await response.json()
    }

    if (response.status === 401) {
      throw new ApiError('Authentication required to view paper chunks.', 401)
    }

    if (response.status === 404) {
      throw new ApiError('Research paper not found.', 404)
    }

    throw new ApiError(`Failed to fetch paper chunks (HTTP ${response.status})`, response.status)
  } catch (err: unknown) {
    if (err instanceof ApiError) throw err
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    throw new ApiError('Unable to reach backend API to fetch paper chunks.')
  }
}

/**
 * POST /api/papers/{paperId}/embed
 * Vectorizes all chunks of a paper using SentenceTransformers and indexes into Qdrant.
 */
export async function embedPaper(
  paperId: string,
  token?: string | null,
  signal?: AbortSignal,
): Promise<PaperEmbeddingResponse> {
  const url = `${envConfig.apiBaseUrl}/api/papers/${paperId}/embed`

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        ...resolveAuthHeader(token),
      },
      signal,
    })

    if (response.ok) {
      return await response.json()
    }

    if (response.status === 401) {
      throw new ApiError('Authentication required to generate embeddings.', 401)
    }

    if (response.status === 404) {
      throw new ApiError('Research paper not found.', 404)
    }

    if (response.status === 422) {
      const body = await response.json().catch(() => ({}))
      throw new ApiError(body?.detail || 'Document chunking must be completed before generating embeddings.', 422)
    }

    throw new ApiError(`Failed to generate embeddings (HTTP ${response.status})`, response.status)
  } catch (err: unknown) {
    if (err instanceof ApiError) throw err
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    throw new ApiError('Unable to reach backend API to generate embeddings.')
  }
}

/**
 * POST /api/search/semantic
 * Executes semantic similarity search across embedded paper chunks.
 */
export async function searchSemantic(
  payload: SemanticSearchRequest,
  token?: string | null,
  signal?: AbortSignal,
): Promise<SemanticSearchResponse> {
  const url = `${envConfig.apiBaseUrl}/api/search/semantic`

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...resolveAuthHeader(token),
      },
      body: JSON.stringify(payload),
      signal,
    })

    if (response.ok) {
      return await response.json()
    }

    if (response.status === 401) {
      throw new ApiError('Authentication required to perform semantic search.', 401)
    }

    if (response.status === 404) {
      const body = await response.json().catch(() => ({}))
      throw new ApiError(body?.detail || 'Target research project or paper not found.', 404)
    }

    if (response.status === 422) {
      const body = await response.json().catch(() => ({}))
      let msg = 'Invalid search query parameters.'
      if (Array.isArray(body.detail) && body.detail.length > 0) {
        msg = body.detail.map((d: { msg?: string }) => d.msg).filter(Boolean).join(' ') || msg
      }
      throw new ApiError(msg, 422)
    }

    throw new ApiError(`Semantic search request failed (HTTP ${response.status})`, response.status)
  } catch (err: unknown) {
    if (err instanceof ApiError) throw err
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    throw new ApiError('Unable to reach backend API to perform semantic search.')
  }
}

/**
 * POST /api/assistant/ask
 * Asks a grounded scientific research question via semantic retrieval and Groq LLM.
 */
export async function askAssistant(
  payload: AskAssistantRequest,
  token?: string | null,
  signal?: AbortSignal,
): Promise<AskAssistantResponse> {
  const url = `${envConfig.apiBaseUrl}/api/assistant/ask`

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...resolveAuthHeader(token),
      },
      body: JSON.stringify(payload),
      signal,
    })

    if (response.ok) {
      return await response.json()
    }

    if (response.status === 401) {
      throw new ApiError('Authentication required to interact with the AI Research Assistant.', 401)
    }

    const body = await response.json().catch(() => ({}))
    const detailMsg = body?.detail || `AI Assistant request failed (HTTP ${response.status})`
    throw new ApiError(detailMsg, response.status)
  } catch (err: unknown) {
    if (err instanceof ApiError) throw err
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    throw new ApiError('Unable to reach backend API for AI Research Assistant.')
  }
}

/**
 * GET /api/assistant/status
 */
export async function getAssistantStatus(signal?: AbortSignal): Promise<AssistantStatusResponse> {
  const url = `${envConfig.apiBaseUrl}/api/assistant/status`
  try {
    const response = await fetch(url, { method: 'GET', signal })
    if (response.ok) {
      return await response.json()
    }
    throw new ApiError(`Status check failed (HTTP ${response.status})`, response.status)
  } catch (err: unknown) {
    if (err instanceof ApiError) throw err
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    throw new ApiError('Unable to reach AI Assistant status endpoint.')
  }
}

/**
 * GET /api/health/groq
 */
export async function getGroqHealth(signal?: AbortSignal): Promise<GroqHealthResponse> {
  const url = `${envConfig.apiBaseUrl}/api/health/groq`
  try {
    const response = await fetch(url, { method: 'GET', signal })
    if (response.ok) {
      return await response.json()
    }
    throw new ApiError(`Groq health check failed (HTTP ${response.status})`, response.status)
  } catch (err: unknown) {
    if (err instanceof ApiError) throw err
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    throw new ApiError('Unable to reach Groq health endpoint.')
  }
}

/**
 * GET /api/papers/{paper_id}/summary
 */
export async function getPaperSummary(
  paperId: string,
  token?: string | null,
  signal?: AbortSignal
): Promise<PaperSummaryResponse> {
  const url = `${envConfig.apiBaseUrl}/api/papers/${paperId}/summary`
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        ...resolveAuthHeader(token),
      },
      signal,
    })

    if (response.ok) {
      return await response.json()
    }

    if (response.status === 404) {
      throw new ApiError('No summary has been generated for this paper yet.', 404)
    }

    if (response.status === 401) {
      throw new ApiError('Authentication required to access paper summary.', 401)
    }

    const body = await response.json().catch(() => ({}))
    throw new ApiError(body?.detail || `Failed to fetch summary (HTTP ${response.status})`, response.status)
  } catch (err: unknown) {
    if (err instanceof ApiError) throw err
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    throw new ApiError('Unable to reach backend API for paper summary.')
  }
}

/**
 * POST /api/papers/{paper_id}/summary
 */
export async function generatePaperSummary(
  paperId: string,
  token?: string | null,
  signal?: AbortSignal
): Promise<PaperSummaryResponse> {
  const url = `${envConfig.apiBaseUrl}/api/papers/${paperId}/summary`
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        ...resolveAuthHeader(token),
      },
      signal,
    })

    if (response.ok) {
      return await response.json()
    }

    if (response.status === 401) {
      throw new ApiError('Authentication required to generate paper summary.', 401)
    }

    const body = await response.json().catch(() => ({}))
    throw new ApiError(body?.detail || `Failed to generate summary (HTTP ${response.status})`, response.status)
  } catch (err: unknown) {
    if (err instanceof ApiError) throw err
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    throw new ApiError('Unable to reach backend API to generate paper summary.')
  }
}

/**
 * POST /api/comparisons
 */
export async function comparePapers(
  paperIds: string[],
  token?: string | null,
  signal?: AbortSignal
): Promise<PaperComparisonResponse> {
  const url = `${envConfig.apiBaseUrl}/api/comparisons`
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...resolveAuthHeader(token),
      },
      body: JSON.stringify({ paper_ids: paperIds }),
      signal,
    })

    if (response.ok) {
      return await response.json()
    }

    if (response.status === 401) {
      throw new ApiError('Authentication required to compare research papers.', 401)
    }

    const body = await response.json().catch(() => ({}))
    throw new ApiError(body?.detail || `Failed to compare papers (HTTP ${response.status})`, response.status)
  } catch (err: unknown) {
    if (err instanceof ApiError) throw err
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    throw new ApiError('Unable to reach backend API for paper comparison.')
  }
}

/**
 * GET /api/comparisons/{comparisonId}
 */
export async function getComparisonById(
  comparisonId: string,
  token?: string | null,
  signal?: AbortSignal
): Promise<PaperComparisonResponse> {
  const url = `${envConfig.apiBaseUrl}/api/comparisons/${comparisonId}`
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        ...resolveAuthHeader(token),
      },
      signal,
    })

    if (response.ok) {
      return await response.json()
    }

    if (response.status === 401) {
      throw new ApiError('Authentication required to retrieve comparison.', 401)
    }

    const body = await response.json().catch(() => ({}))
    throw new ApiError(body?.detail || `Failed to fetch comparison (HTTP ${response.status})`, response.status)
  } catch (err: unknown) {
    if (err instanceof ApiError) throw err
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    throw new ApiError('Unable to reach backend API for paper comparison.')
  }
}

/**
 * GET /api/comparisons?paper_ids=...
 */
export async function getComparisonByPaperIds(
  paperIds: string[],
  token?: string | null,
  signal?: AbortSignal
): Promise<PaperComparisonResponse> {
  const params = new URLSearchParams()
  paperIds.forEach((id) => params.append('paper_ids', id))
  const url = `${envConfig.apiBaseUrl}/api/comparisons?${params.toString()}`

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        ...resolveAuthHeader(token),
      },
      signal,
    })

    if (response.ok) {
      return await response.json()
    }

    if (response.status === 404) {
      throw new ApiError('No existing comparison found for these papers.', 404)
    }

    if (response.status === 401) {
      throw new ApiError('Authentication required to retrieve comparison.', 401)
    }

    const body = await response.json().catch(() => ({}))
    throw new ApiError(body?.detail || `Failed to fetch comparison (HTTP ${response.status})`, response.status)
  } catch (err: unknown) {
    if (err instanceof ApiError) throw err
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    throw new ApiError('Unable to reach backend API for paper comparison.')
  }
}





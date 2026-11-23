import { envConfig } from '../config/env'
import type {
  HealthResponse,
  DatabaseHealthResponse,
  UserRegisterPayload,
  UserLoginPayload,
  UserResponse,
  LoginResponse,
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

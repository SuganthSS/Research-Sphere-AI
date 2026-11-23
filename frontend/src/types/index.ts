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

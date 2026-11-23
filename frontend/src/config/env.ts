/**
 * Frontend environment configuration.
 * Reads environment variables configured via Vite with safe fallbacks.
 */

const getApiBaseUrl = (): string => {
  const envUrl = import.meta.env.VITE_API_BASE_URL
  if (typeof envUrl === 'string' && envUrl.trim().length > 0) {
    // Strip trailing slash if present for consistent endpoint composition
    return envUrl.trim().replace(/\/+$/, '')
  }
  return 'http://127.0.0.1:8000'
}

export const envConfig = {
  apiBaseUrl: getApiBaseUrl(),
} as const

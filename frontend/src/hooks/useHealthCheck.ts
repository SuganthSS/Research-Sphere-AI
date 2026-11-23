import { useState, useEffect, useCallback, useRef } from 'react'
import { fetchHealthStatus, fetchDatabaseHealthStatus, ApiError } from '../services/api'
import type { HealthCheckState } from '../types'

export function useHealthCheck() {
  const [state, setState] = useState<HealthCheckState>({
    backendStatus: 'loading',
    backendData: null,
    backendError: null,
    dbStatus: 'loading',
    dbData: null,
    dbError: null,
    lastChecked: null,
  })

  const abortControllerRef = useRef<AbortController | null>(null)

  const checkHealth = useCallback(async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }

    const controller = new AbortController()
    abortControllerRef.current = controller

    setState((prev) => ({
      ...prev,
      backendStatus: 'loading',
      backendError: null,
      dbStatus: 'loading',
      dbError: null,
    }))

    try {
      // 1. Verify Backend API Health
      const backendData = await fetchHealthStatus(controller.signal)

      // 2. Since Backend is reachable, verify Database connectivity
      try {
        const dbData = await fetchDatabaseHealthStatus(controller.signal)
        const isDbConnected = dbData.database === 'connected' && dbData.status === 'healthy'

        setState({
          backendStatus: 'connected',
          backendData,
          backendError: null,
          dbStatus: isDbConnected ? 'connected' : 'unavailable',
          dbData,
          dbError: isDbConnected ? null : 'PostgreSQL database connection is currently unavailable.',
          lastChecked: new Date(),
        })
      } catch (dbErr: unknown) {
        if (dbErr instanceof DOMException && dbErr.name === 'AbortError') return
        const dbErrorMessage =
          dbErr instanceof ApiError ? dbErr.message : 'Database connectivity verification failed.'

        setState({
          backendStatus: 'connected',
          backendData,
          backendError: null,
          dbStatus: 'unavailable',
          dbData: null,
          dbError: dbErrorMessage,
          lastChecked: new Date(),
        })
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') return

      const backendErrorMessage =
        err instanceof ApiError ? err.message : 'Unable to connect to backend server.'

      // When FastAPI is offline, do NOT falsely claim PostgreSQL is down — mark as unreachable via backend
      setState({
        backendStatus: 'unavailable',
        backendData: null,
        backendError: backendErrorMessage,
        dbStatus: 'unreachable',
        dbData: null,
        dbError: 'Cannot check database status while backend API is offline.',
        lastChecked: new Date(),
      })
    }
  }, [])

  useEffect(() => {
    checkHealth()

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [checkHealth])

  return {
    ...state,
    retry: checkHealth,
  }
}

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import type { UserResponse } from '../types'
import { fetchCurrentUser } from '../services/api'

export interface AuthContextType {
  user: UserResponse | null
  token: string | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (token: string, user: UserResponse) => void
  logout: () => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

const TOKEN_KEY = 'researchsphere_token'
const USER_KEY = 'researchsphere_user'

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(() => {
    try {
      return localStorage.getItem(TOKEN_KEY)
    } catch {
      return null
    }
  })

  const [user, setUser] = useState<UserResponse | null>(() => {
    try {
      const savedUser = localStorage.getItem(USER_KEY)
      return savedUser ? (JSON.parse(savedUser) as UserResponse) : null
    } catch {
      return null
    }
  })

  // Start in loading state if there is a persisted token to verify with the backend
  const [isLoading, setIsLoading] = useState<boolean>(() => {
    try {
      return !!localStorage.getItem(TOKEN_KEY)
    } catch {
      return false
    }
  })

  const clearAuth = useCallback(() => {
    setToken(null)
    setUser(null)
    try {
      localStorage.removeItem(TOKEN_KEY)
      localStorage.removeItem(USER_KEY)
    } catch (e) {
      console.warn('Could not clear auth credentials from localStorage:', e)
    }
  }, [])

  const login = useCallback((newToken: string, newUser: UserResponse) => {
    setToken(newToken)
    setUser(newUser)
    setIsLoading(false)
    try {
      localStorage.setItem(TOKEN_KEY, newToken)
      localStorage.setItem(USER_KEY, JSON.stringify(newUser))
    } catch (e) {
      console.warn('Could not persist auth credentials to localStorage:', e)
    }
  }, [])

  const logout = useCallback(() => {
    clearAuth()
    setIsLoading(false)
  }, [clearAuth])

  // Verify persisted token against GET /api/auth/me on mount
  useEffect(() => {
    let isMounted = true
    const abortController = new AbortController()

    const verifyPersistedSession = async () => {
      const storedToken = localStorage.getItem(TOKEN_KEY)
      if (!storedToken) {
        if (isMounted) {
          setIsLoading(false)
        }
        return
      }

      try {
        const verifiedUser = await fetchCurrentUser(storedToken, abortController.signal)
        if (isMounted) {
          setUser(verifiedUser)
          setToken(storedToken)
          try {
            localStorage.setItem(USER_KEY, JSON.stringify(verifiedUser))
          } catch {}
          setIsLoading(false)
        }
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          return
        }

        // Token invalid, expired, or rejected with 401
        if (isMounted) {
          clearAuth()
          setIsLoading(false)
        }
      }
    }

    verifyPersistedSession()

    return () => {
      isMounted = false
      abortController.abort()
    }
  }, [clearAuth])

  // Synchronize state across storage events (e.g. multiple tabs)
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === TOKEN_KEY) {
        if (!e.newValue) {
          clearAuth()
        } else {
          setToken(e.newValue)
        }
      }
      if (e.key === USER_KEY) {
        if (!e.newValue) {
          setUser(null)
        } else {
          try {
            setUser(JSON.parse(e.newValue) as UserResponse)
          } catch {}
        }
      }
    }
    window.addEventListener('storage', handleStorageChange)
    return () => window.removeEventListener('storage', handleStorageChange)
  }, [clearAuth])

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!token && !!user,
        isLoading,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

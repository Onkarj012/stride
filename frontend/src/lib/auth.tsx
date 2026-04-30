import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3210'

interface AuthUser {
  userId: string
  name: string
  email: string
}

interface AuthContextType {
  user: AuthUser | null
  token: string | null
  login: (email: string, password: string) => Promise<void>
  signup: (name: string, email: string, password: string) => Promise<void>
  logout: () => void
  isLoading: boolean
  isAuthLoading: boolean
  error: string | null
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

async function apiFetch(path: string, options: RequestInit = {}) {
  const token = localStorage.getItem('auth_token')
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  const res = await fetch(`${API_URL}${path}`, { ...options, headers })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Request failed')
  return data
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('auth_token'))
  const [user, setUser] = useState<AuthUser | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isAuthLoading, setIsAuthLoading] = useState(!!token)

  useEffect(() => {
    if (token) {
      localStorage.setItem('auth_token', token)
      setIsAuthLoading(true)
      apiFetch('/api/auth/me')
        .then((data) => {
          setUser({ userId: data.userId, name: data.name, email: data.email })
        })
        .catch(() => {
          localStorage.removeItem('auth_token')
          setToken(null)
          setUser(null)
        })
        .finally(() => setIsAuthLoading(false))
    } else {
      localStorage.removeItem('auth_token')
      setUser(null)
      setIsAuthLoading(false)
    }
  }, [token])

  const login = useCallback(async (email: string, password: string) => {
    setIsLoading(true)
    setError(null)
    try {
      const result = await apiFetch('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      })
      setToken(result.token)
    } catch (err: any) {
      setError(err.message || 'Login failed')
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [])

  const signup = useCallback(async (name: string, email: string, password: string) => {
    setIsLoading(true)
    setError(null)
    try {
      const result = await apiFetch('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email, password, name }),
      })
      setToken(result.token)
    } catch (err: any) {
      setError(err.message || 'Signup failed')
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [])

  const logout = useCallback(async () => {
    if (token) {
      try {
        await apiFetch('/api/auth/logout', { method: 'POST' })
      } catch (e) {
        // ignore
      }
    }
    setToken(null)
  }, [token])

  return (
    <AuthContext.Provider value={{ user, token, login, signup, logout, isLoading, isAuthLoading, error }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

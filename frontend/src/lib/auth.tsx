import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import { useQuery, useMutation, useAction } from 'convex/react'
import { api } from '../../../backend/convex/_generated/api'

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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('auth_token'))
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const me = useQuery(api.auth.me, token ? { token } : 'skip')
  const isAuthLoading = token !== null && me === undefined

  const loginMutation = useAction(api.authActions.login)
  const registerMutation = useAction(api.authActions.register)
  const logoutMutation = useMutation(api.auth.logout)

  useEffect(() => {
    if (token) {
      localStorage.setItem('auth_token', token)
    } else {
      localStorage.removeItem('auth_token')
    }
  }, [token])

  const login = useCallback(async (email: string, password: string) => {
    setIsLoading(true)
    setError(null)
    try {
      const result = await loginMutation({ email, password })
      setToken(result.token)
    } catch (err: any) {
      setError(err.message || 'Login failed')
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [loginMutation])

  const signup = useCallback(async (name: string, email: string, password: string) => {
    setIsLoading(true)
    setError(null)
    try {
      const result = await registerMutation({ email, password, name })
      setToken(result.token)
    } catch (err: any) {
      setError(err.message || 'Signup failed')
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [registerMutation])

  const logout = useCallback(async () => {
    if (token) {
      try {
        await logoutMutation({ token })
      } catch (e) {
        // ignore
      }
    }
    setToken(null)
  }, [token, logoutMutation])

  const user = me
    ? { userId: me.userId, name: me.name, email: me.email }
    : null

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

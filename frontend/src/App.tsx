import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/auth'
import Login from './pages/Login'
import Signup from './pages/Signup'
import Dashboard from './pages/Dashboard'
import { Loader2 } from 'lucide-react'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isAuthLoading } = useAuth()
  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-white dark:bg-gray-950 text-black font-mono flex items-center justify-center transition-colors">
        <div className="flex flex-col items-center gap-4">
          <Loader2 size={32} className="animate-spin text-red-600" />
          <div className="text-sm font-bold text-neutral-500 dark:text-gray-400">AUTHENTICATING...</div>
        </div>
      </div>
    )
  }
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  )
}

export default App

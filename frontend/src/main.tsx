import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, useNavigate, Navigate } from 'react-router-dom'
import { ClerkProvider, SignIn, SignUp, useAuth } from '@clerk/react'
import { ThemeProvider } from './lib/theme'
import Dashboard from './pages/Dashboard'
import { Loader2 } from 'lucide-react'
import './index.css'

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth()
  if (!isLoaded) {
    return (
      <div className="min-h-screen bg-white dark:bg-gray-950 text-black font-mono flex items-center justify-center transition-colors">
        <div className="flex flex-col items-center gap-4">
          <Loader2 size={32} className="animate-spin text-red-600" />
          <div className="text-sm font-bold text-neutral-500 dark:text-gray-400">AUTHENTICATING...</div>
        </div>
      </div>
    )
  }
  if (!isSignedIn) return <Navigate to="/sign-in" replace />
  return <>{children}</>
}

function ClerkProviderWithRoutes() {
  const navigate = useNavigate()

  return (
    <ClerkProvider
      publishableKey={PUBLISHABLE_KEY}
      routerPush={(to) => navigate(to)}
      routerReplace={(to) => navigate(to, { replace: true })}
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      signInFallbackRedirectUrl="/"
      signUpFallbackRedirectUrl="/"
      afterSignOutUrl="/sign-in"
    >
      <ThemeProvider>
        <Routes>
          <Route
            path="/sign-in/*"
            element={
              <div className="min-h-screen bg-white dark:bg-gray-950 flex items-center justify-center transition-colors">
                <SignIn />
              </div>
            }
          />
          <Route
            path="/sign-up/*"
            element={
              <div className="min-h-screen bg-white dark:bg-gray-950 flex items-center justify-center transition-colors">
                <SignUp />
              </div>
            }
          />
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
      </ThemeProvider>
    </ClerkProvider>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ClerkProviderWithRoutes />
    </BrowserRouter>
  </StrictMode>,
)

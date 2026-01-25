import { lazy, Suspense } from 'react'
import { useAuth } from './contexts/AuthContext'
import { LogOut } from 'lucide-react'

// Only load what we need for PWA
const PWAHome = lazy(() => import('./pages/PWAHome'))
const Login = lazy(() => import('./pages/Login'))

export default function PWAApp() {
  const { isAuthenticated, signOut } = useAuth()

  const handleLogin = async () => {
    // Login handled by AuthContext
  }

  const handleLogout = async () => {
    await signOut()
  }

  // Loading spinner
  const LoadingSpinner = () => (
    <div className="min-h-screen bg-theme-primary flex items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500"></div>
    </div>
  )

  if (!isAuthenticated) {
    return (
      <Suspense fallback={<LoadingSpinner />}>
        <Login onLogin={handleLogin} />
      </Suspense>
    )
  }

  return (
    <div className="min-h-screen bg-theme-primary flex flex-col">
      {/* Minimal PWA Header */}
      <header className="bg-theme-surface border-b border-theme px-4 py-3 flex items-center justify-between">
        <img 
          src="/assets/logos/logo-icon.svg" 
          alt="OpSyncPro" 
          className="h-8 w-auto"
        />
        <button
          onClick={handleLogout}
          className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-theme-hover"
          aria-label="Logout"
        >
          <LogOut className="w-5 h-5" />
        </button>
      </header>

      {/* PWA Home - Simple Upload/Add Interface */}
      <main className="flex-1 overflow-hidden">
        <Suspense fallback={<LoadingSpinner />}>
          <PWAHome />
        </Suspense>
      </main>
    </div>
  )
}

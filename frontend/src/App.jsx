import { useState, useEffect, lazy, Suspense } from 'react'
import { Routes, Route, Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'

// Lazy load all page components for code splitting
const Account = lazy(() => import('./pages/Account'))
const Strategies = lazy(() => import('./pages/Strategies'))
const Listings = lazy(() => import('./pages/Listings'))
const Login = lazy(() => import('./pages/Login'))
const AutoList = lazy(() => import('./pages/AutoList'))
const AdminSettings = lazy(() => import('./pages/AdminSettings'))
const ListingSettings = lazy(() => import('./pages/ListingSettings'))
const InfluencerAsinCorrelation = lazy(() => import('./pages/InfluencerAsinCorrelation'))
const ApiKeys = lazy(() => import('./pages/ApiKeys'))

export default function App() {
  const { user, isAuthenticated, signOut } = useAuth()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    if (!isAuthenticated && location.pathname !== '/login') {
      navigate('/login')
    }
  }, [isAuthenticated, location.pathname, navigate])

  // Close mobile menu when route changes
  useEffect(() => {
    setMobileMenuOpen(false)
  }, [location.pathname])

  // Close mobile menu when clicking outside
  useEffect(() => {
    if (mobileMenuOpen) {
      const handleDocumentClick = (event) => {
        const nav = document.querySelector('nav')
        if (nav && !nav.contains(event.target)) {
          setMobileMenuOpen(false)
        }
      }

      document.addEventListener('click', handleDocumentClick)
      return () => document.removeEventListener('click', handleDocumentClick)
    }
  }, [mobileMenuOpen])

  const handleLogin = async () => {
    // Login is handled by AuthContext
    navigate('/')
  }

  const handleLogout = async () => {
    await signOut()
    navigate('/login')
  }

  if (!isAuthenticated) {
    return (
      <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="text-lg">Loading...</div></div>}>
        <Login onLogin={handleLogin} />
      </Suspense>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-blue-600 text-white shadow-lg relative z-50">
        <div className={location.pathname === '/listings' ? 'w-full px-4' : 'max-w-7xl mx-auto px-4'}>
          {/* Main Navigation Bar */}
          <div className="flex justify-between items-center h-16">

            {/* Logo Section */}
            <div className="flex items-center min-w-0">
              <h1 className="text-lg font-bold truncate">
                <span className="sm:hidden">eBay PR</span>
                <span className="hidden sm:inline">eBay Price Reducer</span>
              </h1>
            </div>

            {/* Desktop Navigation - Hidden on mobile */}
            <div className="hidden lg:flex items-center space-x-6">
              <Link
                to="/listings"
                className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  location.pathname === '/listings' || location.pathname === '/'
                    ? 'bg-blue-700 text-white'
                    : 'text-blue-100 hover:text-white hover:bg-blue-700'
                }`}
              >
                Listings
              </Link>
              <Link
                to="/auto-list"
                className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  location.pathname === '/auto-list'
                    ? 'bg-blue-700 text-white'
                    : 'text-blue-100 hover:text-white hover:bg-blue-700'
                }`}
              >
                Auto-List
              </Link>
              <Link
                to="/strategies"
                className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  location.pathname === '/strategies'
                    ? 'bg-blue-700 text-white'
                    : 'text-blue-100 hover:text-white hover:bg-blue-700'
                }`}
              >
                Strategies
              </Link>
              <Link
                to="/asin-lookup"
                className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  location.pathname === '/asin-lookup'
                    ? 'bg-blue-700 text-white'
                    : 'text-blue-100 hover:text-white hover:bg-blue-700'
                }`}
              >
                Influencer Central
              </Link>
              <Link
                to="/account"
                className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  location.pathname === '/account'
                    ? 'bg-blue-700 text-white'
                    : 'text-blue-100 hover:text-white hover:bg-blue-700'
                }`}
              >
                Account
              </Link>
              <Link
                to="/api-keys"
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  location.pathname === '/api-keys'
                    ? 'bg-blue-700 text-white'
                    : 'text-blue-100 hover:text-white hover:bg-blue-700'
                }`}
              >
                API Keys
              </Link>
              <button
                onClick={handleLogout}
                className="bg-blue-800 hover:bg-blue-900 px-4 py-2 rounded-md text-sm font-medium transition-colors"
              >
                Logout
              </button>
            </div>

            {/* Mobile Menu Button */}
            <div className="lg:hidden">
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="p-2 rounded-md text-blue-100 hover:text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-white transition-colors"
                aria-expanded={mobileMenuOpen}
                aria-label="Toggle navigation menu"
              >
                <svg
                  className="h-6 w-6 transform transition-transform duration-200"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  style={{ transform: mobileMenuOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}
                >
                  {mobileMenuOpen ? (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  )}
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Menu Overlay */}
        {mobileMenuOpen && (
          <>
            {/* Backdrop */}
            <div
              className="lg:hidden fixed inset-0 bg-black bg-opacity-25 z-40"
              onClick={() => setMobileMenuOpen(false)}
              aria-hidden="true"
            />

            {/* Mobile Menu Panel */}
            <div className="lg:hidden absolute top-16 left-0 right-0 bg-blue-600 border-t border-blue-500 shadow-lg z-50">
              <div className="px-4 py-3 space-y-1">

                {/* User Welcome */}
                {user && (
                  <div className="px-3 py-2 text-blue-100 text-sm border-b border-blue-500 mb-2">
                    {user.name || user.username || 'User'}
                  </div>
                )}

                {/* Navigation Links */}
                <Link
                  to="/listings"
                  className={`flex items-center px-3 py-3 rounded-md text-base font-medium transition-colors ${
                    location.pathname === '/listings' || location.pathname === '/'
                      ? 'bg-blue-700 text-white'
                      : 'text-blue-100 hover:text-white hover:bg-blue-700'
                  }`}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <svg className="mr-3 h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                  Listings
                </Link>

                <Link
                  to="/auto-list"
                  className={`flex items-center px-3 py-3 rounded-md text-base font-medium transition-colors ${
                    location.pathname === '/auto-list'
                      ? 'bg-blue-700 text-white'
                      : 'text-blue-100 hover:text-white hover:bg-blue-700'
                  }`}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <svg className="mr-3 h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                  Auto-List
                </Link>

                <Link
                  to="/strategies"
                  className={`flex items-center px-3 py-3 rounded-md text-base font-medium transition-colors ${
                    location.pathname === '/strategies'
                      ? 'bg-blue-700 text-white'
                      : 'text-blue-100 hover:text-white hover:bg-blue-700'
                  }`}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <svg className="mr-3 h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                  Strategies
                </Link>

                <Link
                  to="/asin-lookup"
                  className={`flex items-center px-3 py-3 rounded-md text-base font-medium transition-colors ${
                    location.pathname === '/asin-lookup'
                      ? 'bg-blue-700 text-white'
                      : 'text-blue-100 hover:text-white hover:bg-blue-700'
                  }`}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <svg className="mr-3 h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  Influencer Central
                </Link>

                <Link
                  to="/account"
                  className={`flex items-center px-3 py-3 rounded-md text-base font-medium transition-colors ${
                    location.pathname === '/account'
                      ? 'bg-blue-700 text-white'
                      : 'text-blue-100 hover:text-white hover:bg-blue-700'
                  }`}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <svg className="mr-3 h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  Account
                </Link>

                {/* Logout Button */}
                <div className="pt-2 mt-2 border-t border-blue-500">
                  <button
                    onClick={() => {
                      handleLogout()
                      setMobileMenuOpen(false)
                    }}
                    className="flex items-center w-full px-3 py-3 rounded-md text-base font-medium text-blue-100 hover:text-white hover:bg-red-600 transition-colors"
                  >
                    <svg className="mr-3 h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                    Logout
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </nav>

      <main className={location.pathname === '/listings' ? 'w-full py-4 px-2 sm:py-6 sm:px-4 lg:px-8' : 'max-w-7xl mx-auto py-4 px-2 sm:py-6 sm:px-6 lg:px-8'}>
        <div className={location.pathname === '/listings' ? '' : 'sm:px-0'}>
          <Suspense fallback={
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                <p className="mt-2 text-gray-600">Loading...</p>
              </div>
            </div>
          }>
            <Routes>
              <Route path="/" element={<Listings />} />
              <Route path="/listings" element={<Listings />} />
              <Route path="/auto-list" element={<AutoList />} />
              <Route path="/strategies" element={<Strategies />} />
              <Route path="/account" element={<Account />} />
              <Route path="/listing-settings" element={<ListingSettings />} />
              <Route path="/admin-settings" element={<AdminSettings />} />
              <Route path="/asin-lookup" element={<InfluencerAsinCorrelation />} />
              <Route path="/api-keys" element={<ApiKeys />} />
            </Routes>
          </Suspense>
        </div>
      </main>
    </div>
  )
}

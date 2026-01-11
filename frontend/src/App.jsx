import { useState, useEffect, lazy, Suspense } from 'react'
import { Routes, Route, Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import { 
  LayoutList, 
  Plus, 
  TrendingDown, 
  Search, 
  User, 
  Key, 
  LogOut, 
  Menu, 
  X 
} from 'lucide-react'

// Lazy load all page components for code splitting
const Account = lazy(() => import('./pages/Account'))
const Strategies = lazy(() => import('./pages/Strategies'))
const Listings = lazy(() => import('./pages/Listings'))
const Login = lazy(() => import('./pages/Login'))
const QuickList = lazy(() => import('./pages/QuickList'))
const AutoListBulk = lazy(() => import('./pages/AutoList')) // Renamed: bulk upload option
const CreateListing = lazy(() => import('./pages/CreateListing'))
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
      <Suspense fallback={
        <div className="min-h-screen bg-dark-bg flex items-center justify-center">
          <div className="text-text-secondary">Loading...</div>
        </div>
      }>
        <Login onLogin={handleLogin} />
      </Suspense>
    )
  }

  return (
    <div className="min-h-screen bg-dark-bg">
      <nav className="bg-dark-surface border-b border-dark-border relative z-50">
        <div className={location.pathname === '/listings' ? 'w-full px-4' : 'max-w-7xl mx-auto px-4'}>
          {/* Main Navigation Bar */}
          <div className="flex justify-between items-center h-14">

            {/* Logo Section */}
            <div className="flex items-center min-w-0">
              <h1 className="text-lg font-semibold text-text-primary truncate">
                <span className="sm:hidden">eBay PR</span>
                <span className="hidden sm:inline">eBay Price Reducer</span>
              </h1>
            </div>

            {/* Desktop Navigation - Hidden on mobile */}
            <div className="hidden lg:flex items-center space-x-1">
              <Link
                to="/listings"
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  location.pathname === '/listings' || location.pathname === '/'
                    ? 'bg-accent text-white'
                    : 'text-text-secondary hover:text-text-primary hover:bg-dark-hover'
                }`}
              >
                Listings
              </Link>
              <Link
                to="/create"
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  location.pathname === '/create'
                    ? 'bg-accent text-white'
                    : 'text-text-secondary hover:text-text-primary hover:bg-dark-hover'
                }`}
              >
                Create
              </Link>
              <Link
                to="/auto-list"
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  location.pathname === '/auto-list'
                    ? 'bg-accent text-white'
                    : 'text-text-secondary hover:text-text-primary hover:bg-dark-hover'
                }`}
              >
                Quick List
              </Link>
              <Link
                to="/strategies"
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  location.pathname === '/strategies'
                    ? 'bg-accent text-white'
                    : 'text-text-secondary hover:text-text-primary hover:bg-dark-hover'
                }`}
              >
                Strategies
              </Link>
              <Link
                to="/asin-lookup"
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  location.pathname === '/asin-lookup'
                    ? 'bg-accent text-white'
                    : 'text-text-secondary hover:text-text-primary hover:bg-dark-hover'
                }`}
              >
                Influencer Central
              </Link>
              <Link
                to="/account"
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  location.pathname === '/account'
                    ? 'bg-accent text-white'
                    : 'text-text-secondary hover:text-text-primary hover:bg-dark-hover'
                }`}
              >
                Account
              </Link>
              <Link
                to="/api-keys"
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  location.pathname === '/api-keys'
                    ? 'bg-accent text-white'
                    : 'text-text-secondary hover:text-text-primary hover:bg-dark-hover'
                }`}
              >
                API Keys
              </Link>
              <button
                onClick={handleLogout}
                className="ml-2 bg-dark-hover hover:bg-dark-border text-text-secondary hover:text-text-primary px-3 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                Logout
              </button>
            </div>

            {/* Mobile Menu Button */}
            <div className="lg:hidden">
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="p-2 rounded-lg text-text-secondary hover:text-text-primary hover:bg-dark-hover focus:outline-none focus:ring-2 focus:ring-accent transition-colors"
                aria-expanded={mobileMenuOpen}
                aria-label="Toggle navigation menu"
              >
                {mobileMenuOpen ? (
                  <X className="h-5 w-5" strokeWidth={1.5} />
                ) : (
                  <Menu className="h-5 w-5" strokeWidth={1.5} />
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Menu Overlay */}
        {mobileMenuOpen && (
          <>
            {/* Backdrop */}
            <div
              className="lg:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
              onClick={() => setMobileMenuOpen(false)}
              aria-hidden="true"
            />

            {/* Mobile Menu Panel */}
            <div className="lg:hidden absolute top-14 left-0 right-0 bg-dark-surface border-b border-dark-border shadow-xl z-50">
              <div className="px-4 py-3 space-y-1">

                {/* User Welcome */}
                {user && (
                  <div className="px-3 py-2 text-text-tertiary text-sm border-b border-dark-border mb-2">
                    {user.name || user.username || 'User'}
                  </div>
                )}

                {/* Navigation Links */}
                <Link
                  to="/listings"
                  className={`flex items-center px-3 py-3 rounded-lg text-base font-medium transition-colors ${
                    location.pathname === '/listings' || location.pathname === '/'
                      ? 'bg-accent text-white'
                      : 'text-text-secondary hover:text-text-primary hover:bg-dark-hover'
                  }`}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <LayoutList className="mr-3 h-5 w-5" strokeWidth={1.5} />
                  Listings
                </Link>

                <Link
                  to="/create"
                  className={`flex items-center px-3 py-3 rounded-lg text-base font-medium transition-colors ${
                    location.pathname === '/create'
                      ? 'bg-accent text-white'
                      : 'text-text-secondary hover:text-text-primary hover:bg-dark-hover'
                  }`}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <Plus className="mr-3 h-5 w-5" strokeWidth={1.5} />
                  Create
                </Link>

                <Link
                  to="/auto-list"
                  className={`flex items-center px-3 py-3 rounded-lg text-base font-medium transition-colors ${
                    location.pathname === '/auto-list'
                      ? 'bg-accent text-white'
                      : 'text-text-secondary hover:text-text-primary hover:bg-dark-hover'
                  }`}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <Plus className="mr-3 h-5 w-5" strokeWidth={1.5} />
                  Quick List
                </Link>

                <Link
                  to="/strategies"
                  className={`flex items-center px-3 py-3 rounded-lg text-base font-medium transition-colors ${
                    location.pathname === '/strategies'
                      ? 'bg-accent text-white'
                      : 'text-text-secondary hover:text-text-primary hover:bg-dark-hover'
                  }`}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <TrendingDown className="mr-3 h-5 w-5" strokeWidth={1.5} />
                  Strategies
                </Link>

                <Link
                  to="/asin-lookup"
                  className={`flex items-center px-3 py-3 rounded-lg text-base font-medium transition-colors ${
                    location.pathname === '/asin-lookup'
                      ? 'bg-accent text-white'
                      : 'text-text-secondary hover:text-text-primary hover:bg-dark-hover'
                  }`}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <Search className="mr-3 h-5 w-5" strokeWidth={1.5} />
                  Influencer Central
                </Link>

                <Link
                  to="/account"
                  className={`flex items-center px-3 py-3 rounded-lg text-base font-medium transition-colors ${
                    location.pathname === '/account'
                      ? 'bg-accent text-white'
                      : 'text-text-secondary hover:text-text-primary hover:bg-dark-hover'
                  }`}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <User className="mr-3 h-5 w-5" strokeWidth={1.5} />
                  Account
                </Link>

                <Link
                  to="/api-keys"
                  className={`flex items-center px-3 py-3 rounded-lg text-base font-medium transition-colors ${
                    location.pathname === '/api-keys'
                      ? 'bg-accent text-white'
                      : 'text-text-secondary hover:text-text-primary hover:bg-dark-hover'
                  }`}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <Key className="mr-3 h-5 w-5" strokeWidth={1.5} />
                  API Keys
                </Link>

                {/* Logout Button */}
                <div className="pt-2 mt-2 border-t border-dark-border">
                  <button
                    onClick={() => {
                      handleLogout()
                      setMobileMenuOpen(false)
                    }}
                    className="flex items-center w-full px-3 py-3 rounded-lg text-base font-medium text-text-secondary hover:text-error hover:bg-error/10 transition-colors"
                  >
                    <LogOut className="mr-3 h-5 w-5" strokeWidth={1.5} />
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
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-accent"></div>
                <p className="mt-2 text-text-secondary">Loading...</p>
              </div>
            </div>
          }>
            <Routes>
              <Route path="/" element={<Listings />} />
              <Route path="/listings" element={<Listings />} />
              <Route path="/create" element={<CreateListing />} />
              <Route path="/auto-list" element={<QuickList />} />
              <Route path="/bulk-list" element={<AutoListBulk />} />
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

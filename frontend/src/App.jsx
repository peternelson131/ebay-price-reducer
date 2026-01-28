import { useState, useEffect, lazy, Suspense } from 'react'
import { Routes, Route, Link, useNavigate, useLocation, Navigate } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import { useTheme } from './contexts/ThemeContext'
import { 
  LayoutList, 
  Plus, 
  TrendingDown, 
  Search, 
  User, 
  Key, 
  LogOut, 
  Menu, 
  X,
  Sun,
  Moon,
  TrendingUp,
  Plug,
  Share2
} from 'lucide-react'

// Lazy load all page components for code splitting
const Account = lazy(() => import('./pages/Account'))
const Strategies = lazy(() => import('./pages/Strategies'))
const Listings = lazy(() => import('./pages/Listings'))
const Login = lazy(() => import('./pages/Login'))
const QuickList = lazy(() => import('./pages/QuickList'))
const AutoListBulk = lazy(() => import('./pages/AutoList')) // Renamed: bulk upload option
const AdminSettings = lazy(() => import('./pages/AdminSettings'))
const ListingSettings = lazy(() => import('./pages/ListingSettings'))
const InfluencerCentral = lazy(() => import('./pages/InfluencerCentral'))
const EbayCentral = lazy(() => import('./pages/EbayCentral'))
const ApiKeys = lazy(() => import('./pages/ApiKeys'))
const Integrations = lazy(() => import('./pages/Integrations'))
const WhatNotAnalysis = lazy(() => import('./pages/WhatNotAnalysis'))
const ProductCRM = lazy(() => import('./pages/ProductCRM'))
const SocialPosts = lazy(() => import('./pages/SocialPosts'))
const Inbox = lazy(() => import('./pages/Inbox'))
const InboxSettings = lazy(() => import('./pages/InboxSettings'))

export default function App() {
  const { user, isAuthenticated, signOut } = useAuth()
  const { isDark, toggleTheme } = useTheme()
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
    // Navigate to Product CRM as default landing page
    navigate('/product-crm')
  }

  const handleLogout = async () => {
    await signOut()
    navigate('/login')
  }

  if (!isAuthenticated) {
    return (
      <Suspense fallback={
        <div className="min-h-screen bg-theme-primary flex items-center justify-center">
          <div className="text-theme-secondary">Loading...</div>
        </div>
      }>
        <Login onLogin={handleLogin} />
      </Suspense>
    )
  }

  // Hide nav bar on WhatNot page (standalone page like login)
  const hideNav = location.pathname === '/whatnot'

  return (
    <div className="min-h-screen bg-theme-primary">
      {!hideNav && <nav className="bg-theme-surface border-b border-theme relative z-50">
        {/* Full-bleed container - no padding */}
        <div className="w-full">
          {/* Main Navigation Bar - edge to edge */}
          <div className="flex justify-between items-center h-14">

            {/* Logo Section - FAR LEFT edge */}
            <div className="flex items-center pl-2">
              {/* Mobile: Menu Button + Icon Logo */}
              <div className="flex items-center lg:hidden">
                <button
                  onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                  className="p-2 rounded-lg text-theme-secondary hover:text-theme-primary hover:bg-theme-hover focus:outline-none focus:ring-2 focus:ring-accent transition-colors mr-2"
                  aria-expanded={mobileMenuOpen}
                  aria-label="Toggle navigation menu"
                >
                  {mobileMenuOpen ? (
                    <X className="h-5 w-5" strokeWidth={1.5} />
                  ) : (
                    <Menu className="h-5 w-5" strokeWidth={1.5} />
                  )}
                </button>
                <img 
                  src="/assets/logos/logo-icon.svg" 
                  alt="OpSyncPro" 
                  className="h-10 w-auto"
                />
              </div>
              
              {/* Desktop: Full Logo (bigger) - swap based on theme */}
              <img 
                src={isDark ? "/assets/logos/logo-navbar.svg" : "/assets/logos/logo-navbar-light.svg"} 
                alt="OpSyncPro" 
                className="h-12 w-auto hidden lg:block"
              />
            </div>

            {/* Desktop Navigation - FAR RIGHT edge */}
            <div className="hidden lg:flex items-center space-x-1 pr-2">
              <Link
                to="/asin-lookup"
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  location.pathname === '/asin-lookup' || location.pathname === '/product-crm' || location.pathname === '/posts'
                    ? 'bg-accent text-white'
                    : 'text-theme-secondary hover:text-theme-primary hover:bg-theme-hover'
                }`}
              >
                Influencer Central
              </Link>
              <Link
                to="/ebay-central"
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  location.pathname === '/ebay-central' || location.pathname === '/listings' || location.pathname === '/'
                    ? 'bg-accent text-white'
                    : 'text-theme-secondary hover:text-theme-primary hover:bg-theme-hover'
                }`}
              >
                Marketplace Central
              </Link>
              <Link
                to="/integrations"
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  location.pathname === '/integrations'
                    ? 'bg-accent text-white'
                    : 'text-theme-secondary hover:text-theme-primary hover:bg-theme-hover'
                }`}
              >
                Integrations
              </Link>
              <Link
                to="/account"
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  location.pathname === '/account'
                    ? 'bg-accent text-white'
                    : 'text-theme-secondary hover:text-theme-primary hover:bg-theme-hover'
                }`}
              >
                Account
              </Link>
              {/* Theme Toggle */}
              <button
                onClick={toggleTheme}
                className="p-2 rounded-lg text-theme-secondary hover:text-theme-primary hover:bg-theme-hover dark:hover:bg-theme-hover transition-colors"
                aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
                title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              >
                {isDark ? (
                  <Sun className="h-5 w-5" strokeWidth={1.5} />
                ) : (
                  <Moon className="h-5 w-5" strokeWidth={1.5} />
                )}
              </button>
              <button
                onClick={handleLogout}
                className="ml-2 bg-theme-hover hover:opacity-80 text-theme-secondary hover:text-theme-primary px-3 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                Logout
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
            <div className="lg:hidden absolute top-14 left-0 right-0 bg-theme-surface border-b border-theme shadow-xl z-50">
              <div className="px-4 py-3 space-y-1">

                {/* User Welcome */}
                {user && (
                  <div className="px-3 py-2 text-theme-tertiary text-sm border-b border-theme mb-2">
                    {user.name || user.username || 'User'}
                  </div>
                )}

                {/* Navigation Links */}
                <Link
                  to="/asin-lookup"
                  className={`flex items-center px-3 py-3 rounded-lg text-base font-medium transition-colors ${
                    location.pathname === '/asin-lookup' || location.pathname === '/product-crm' || location.pathname === '/posts'
                      ? 'bg-accent text-white'
                      : 'text-theme-secondary hover:text-theme-primary hover:bg-theme-hover'
                  }`}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <Search className="mr-3 h-5 w-5" strokeWidth={1.5} />
                  Influencer Central
                </Link>

                <Link
                  to="/ebay-central"
                  className={`flex items-center px-3 py-3 rounded-lg text-base font-medium transition-colors ${
                    location.pathname === '/ebay-central' || location.pathname === '/listings' || location.pathname === '/'
                      ? 'bg-accent text-white'
                      : 'text-theme-secondary hover:text-theme-primary hover:bg-theme-hover'
                  }`}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <LayoutList className="mr-3 h-5 w-5" strokeWidth={1.5} />
                  Marketplace Central
                </Link>

                <Link
                  to="/integrations"
                  className={`flex items-center px-3 py-3 rounded-lg text-base font-medium transition-colors ${
                    location.pathname === '/integrations'
                      ? 'bg-accent text-white'
                      : 'text-theme-secondary hover:text-theme-primary hover:bg-theme-hover'
                  }`}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <Plug className="mr-3 h-5 w-5" strokeWidth={1.5} />
                  Integrations
                </Link>

                <Link
                  to="/account"
                  className={`flex items-center px-3 py-3 rounded-lg text-base font-medium transition-colors ${
                    location.pathname === '/account'
                      ? 'bg-accent text-white'
                      : 'text-theme-secondary hover:text-theme-primary hover:bg-theme-hover'
                  }`}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <User className="mr-3 h-5 w-5" strokeWidth={1.5} />
                  Account
                </Link>

                {/* Theme Toggle & Logout */}
                <div className="pt-2 mt-2 border-t border-theme space-y-1">
                  <button
                    onClick={toggleTheme}
                    className="flex items-center w-full px-3 py-3 rounded-lg text-base font-medium text-theme-secondary hover:text-theme-primary hover:bg-theme-hover transition-colors"
                  >
                    {isDark ? (
                      <>
                        <Sun className="mr-3 h-5 w-5" strokeWidth={1.5} />
                        Light Mode
                      </>
                    ) : (
                      <>
                        <Moon className="mr-3 h-5 w-5" strokeWidth={1.5} />
                        Dark Mode
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => {
                      handleLogout()
                      setMobileMenuOpen(false)
                    }}
                    className="flex items-center w-full px-3 py-3 rounded-lg text-base font-medium text-theme-secondary hover:text-error hover:bg-error/10 transition-colors"
                  >
                    <LogOut className="mr-3 h-5 w-5" strokeWidth={1.5} />
                    Logout
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </nav>}

      <main className={['/listings', '/asin-lookup', '/ebay-central', '/whatnot', '/product-crm', '/inbox'].includes(location.pathname) || location.pathname === '/' ? 'w-full' : 'max-w-7xl mx-auto py-4 px-2 sm:py-6 sm:px-6 lg:px-8'}>
        <div className={['/listings', '/asin-lookup', '/ebay-central', '/whatnot', '/product-crm', '/inbox'].includes(location.pathname) || location.pathname === '/' ? '' : 'sm:px-0'}>
          <Suspense fallback={
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-accent"></div>
                <p className="mt-2 text-theme-secondary">Loading...</p>
              </div>
            </div>
          }>
            <Routes>
              <Route path="/" element={<Navigate to="/asin-lookup#product-crm" replace />} />
              <Route path="/ebay-central" element={<EbayCentral />} />
              <Route path="/listings" element={<Listings />} />
              <Route path="/auto-list" element={<QuickList />} />
              <Route path="/bulk-list" element={<AutoListBulk />} />
              <Route path="/strategies" element={<Strategies />} />
              <Route path="/account" element={<Account />} />
              <Route path="/listing-settings" element={<ListingSettings />} />
              <Route path="/admin-settings" element={<AdminSettings />} />
              <Route path="/asin-lookup" element={<InfluencerCentral />} />
              <Route path="/whatnot" element={<WhatNotAnalysis />} />
              <Route path="/integrations" element={<Integrations />} />
              <Route path="/api-keys" element={<Navigate to="/integrations" replace />} />
              <Route path="/settings" element={<Navigate to="/integrations" replace />} />
              <Route path="/product-crm" element={<Navigate to="/asin-lookup#product-crm" replace />} />
              <Route path="/posts" element={<Navigate to="/asin-lookup#posts" replace />} />
              <Route path="/inbox" element={<Navigate to="/asin-lookup#inbox" replace />} />
              <Route path="/inbox-settings" element={<InboxSettings />} />
            </Routes>
          </Suspense>
        </div>
      </main>
    </div>
  )
}

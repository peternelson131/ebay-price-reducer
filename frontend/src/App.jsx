import { useState, useEffect } from 'react'
import { Routes, Route, Link, useNavigate, useLocation } from 'react-router-dom'
import Account from './pages/Account'
import Strategies from './pages/Strategies'
import Listings from './pages/Listings'
import Analytics from './pages/Analytics'
import Login from './pages/Login'

// Simple components without complex dependencies
function Dashboard() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">📈 eBay Price Reducer Dashboard</h1>
        <p className="text-gray-600 mt-2">Configure price drop rules and manage your eBay listings</p>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="bg-blue-100 rounded-md p-3">
              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            </div>
            <div className="ml-4">
              <h2 className="text-lg font-medium text-gray-900">Active Listings</h2>
              <p className="text-2xl font-bold text-gray-600">24</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="bg-green-100 rounded-md p-3">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
              </svg>
            </div>
            <div className="ml-4">
              <h2 className="text-lg font-medium text-gray-900">Price Reductions Today</h2>
              <p className="text-2xl font-bold text-gray-600">7</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="bg-yellow-100 rounded-md p-3">
              <svg className="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-5 5v-5z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4" />
              </svg>
            </div>
            <div className="ml-4">
              <h2 className="text-lg font-medium text-gray-900">Active Strategies</h2>
              <p className="text-2xl font-bold text-gray-600">3</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="bg-purple-100 rounded-md p-3">
              <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
              </svg>
            </div>
            <div className="ml-4">
              <h2 className="text-lg font-medium text-gray-900">Total Savings</h2>
              <p className="text-2xl font-bold text-gray-600">$1,247</p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">Quick Actions</h3>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Link to="/listings" className="bg-blue-50 border border-blue-200 rounded-lg p-4 hover:bg-blue-100 transition-colors">
              <h4 className="font-medium text-blue-900">View All Listings</h4>
              <p className="text-sm text-blue-700 mt-1">Manage your eBay items</p>
            </Link>
            <Link to="/strategies" className="bg-green-50 border border-green-200 rounded-lg p-4 hover:bg-green-100 transition-colors">
              <h4 className="font-medium text-green-900">Manage Strategies</h4>
              <p className="text-sm text-green-700 mt-1">Configure price reduction rules</p>
            </Link>
            <Link to="/analytics" className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 hover:bg-yellow-100 transition-colors">
              <h4 className="font-medium text-yellow-900">Market Analytics</h4>
              <p className="text-sm text-yellow-700 mt-1">Analyze market data and pricing</p>
            </Link>
            <Link to="/account" className="bg-purple-50 border border-purple-200 rounded-lg p-4 hover:bg-purple-100 transition-colors">
              <h4 className="font-medium text-purple-900">Account Settings</h4>
              <p className="text-sm text-purple-700 mt-1">Manage your account</p>
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [user, setUser] = useState(null)
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    const authState = localStorage.getItem('isAuthenticated')
    const userData = localStorage.getItem('userData')

    if (authState === 'true' && userData) {
      setIsAuthenticated(true)
      setUser(JSON.parse(userData))
    }
  }, [])

  useEffect(() => {
    if (!isAuthenticated && location.pathname !== '/login') {
      navigate('/login')
    }
  }, [isAuthenticated, location.pathname, navigate])

  const handleLogin = (userData) => {
    setIsAuthenticated(true)
    setUser(userData)
    localStorage.setItem('isAuthenticated', 'true')
    localStorage.setItem('userData', JSON.stringify(userData))
    navigate('/')
  }

  const handleLogout = () => {
    setIsAuthenticated(false)
    setUser(null)
    localStorage.removeItem('isAuthenticated')
    localStorage.removeItem('userData')
    navigate('/login')
  }

  if (!isAuthenticated) {
    return <Login onLogin={handleLogin} />
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-blue-600 text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center space-x-8">
              <h1 className="text-xl font-bold">eBay Price Reducer</h1>
              {user && (
                <span className="text-blue-100">Welcome, {user.name || user.username || 'User'}</span>
              )}
            </div>
            <div className="flex items-center space-x-6">
              <Link to="/" className="hover:text-blue-200 transition-colors">Dashboard</Link>
              <Link to="/listings" className="hover:text-blue-200 transition-colors">Listings</Link>
              <Link to="/strategies" className="hover:text-blue-200 transition-colors">Strategies</Link>
              <Link to="/analytics" className="hover:text-blue-200 transition-colors">Analytics</Link>
              <Link to="/account" className="hover:text-blue-200 transition-colors">Account</Link>
              <button
                onClick={handleLogout}
                className="bg-blue-700 hover:bg-blue-800 px-3 py-1 rounded transition-colors"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/listings" element={<Listings />} />
            <Route path="/strategies" element={<Strategies />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/account" element={<Account />} />
          </Routes>
        </div>
      </main>
    </div>
  )
}
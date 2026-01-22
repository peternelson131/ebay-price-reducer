import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ChevronDown, ChevronRight, ShoppingCart, Video, Share2, CheckCircle, XCircle, Eye, EyeOff, ExternalLink, Loader, Link2, Unlink, Clock, Youtube, Facebook, Instagram } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { userAPI, supabase } from '../lib/supabase'
import { OneDriveConnection } from '../components/onedrive'
import { toast } from 'react-toastify'
import { useQuery, useQueryClient } from '@tanstack/react-query'

// Category configuration
const CATEGORIES = [
  {
    id: 'marketplace',
    name: 'Marketplace Integrations',
    icon: ShoppingCart,
    description: 'Connect to selling platforms and product data sources',
    integrations: ['ebay', 'keepa']
  },
  {
    id: 'influencer',
    name: 'Influencer Integrations',
    icon: Video,
    description: 'Tools for content creation and storage',
    integrations: ['onedrive', 'elevenlabs']
  },
  {
    id: 'social',
    name: 'Social Media Integrations',
    icon: Share2,
    description: 'Connect social platforms for content distribution',
    integrations: ['youtube', 'meta']
  }
]

// Accordion Component
function AccordionSection({ category, isOpen, onToggle, children, connectedCount, isLoading }) {
  const IconComponent = category.icon
  
  return (
    <div className="border border-theme rounded-lg overflow-hidden bg-theme-surface">
      <button
        onClick={onToggle}
        className="w-full px-6 py-4 flex items-center justify-between hover:bg-theme-hover transition-colors"
      >
        <div className="flex items-center gap-3">
          <IconComponent className="w-5 h-5 text-accent" />
          <div className="text-left">
            <h3 className="text-lg font-medium text-theme-primary">{category.name}</h3>
            <p className="text-sm text-theme-tertiary">{category.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {isLoading ? (
            <span className="px-2.5 py-1 bg-accent/10 text-accent text-sm rounded-full font-medium flex items-center gap-2">
              <Loader className="w-3.5 h-3.5 animate-spin" />
              Loading...
            </span>
          ) : (
            <span className="px-2.5 py-1 bg-accent/10 text-accent text-sm rounded-full font-medium">
              {connectedCount}/{category.integrations.length} connected
            </span>
          )}
          {isOpen ? (
            <ChevronDown className="w-5 h-5 text-theme-tertiary" />
          ) : (
            <ChevronRight className="w-5 h-5 text-theme-tertiary" />
          )}
        </div>
      </button>
      
      {isOpen && (
        <div className="px-6 py-4 border-t border-theme space-y-4">
          {children}
        </div>
      )}
    </div>
  )
}

// eBay Integration Card
function EbayIntegration({ onStatusChange }) {
  const [status, setStatus] = useState('loading')
  const [message, setMessage] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState(null)

  useEffect(() => {
    checkConnectionStatus()
  }, [])

  // Notify parent when connection status changes
  useEffect(() => {
    onStatusChange?.(connectionStatus?.connected === true)
  }, [connectionStatus, onStatusChange])

  const checkConnectionStatus = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const response = await fetch('/.netlify/functions/ebay-connection-status', {
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      })
      const data = await response.json()
      
      if (data.connected) {
        setStatus('connected')
        setConnectionStatus(data)
      } else if (data.status === 'pending') {
        setStatus('pending')
      } else {
        setStatus('not_connected')
      }
    } catch (error) {
      console.error('Failed to check eBay status:', error)
      setStatus('not_connected')
    }
  }

  const connectEbay = async () => {
    setConnecting(true)
    setMessage('')

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not authenticated')

      const response = await fetch('/.netlify/functions/ebay-oauth-start', {
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to start authorization')
      }

      window.location.href = data.authUrl
    } catch (error) {
      console.error('OAuth start error:', error)
      setMessage(error.message)
      setConnecting(false)
    }
  }

  const disconnectEbay = async () => {
    if (!confirm('Are you sure you want to disconnect your eBay account?')) return

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not authenticated')

      const response = await fetch('/.netlify/functions/ebay-disconnect', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to disconnect')
      }

      setStatus('not_connected')
      setConnectionStatus(null)
      toast.success('eBay account disconnected')
    } catch (error) {
      console.error('Disconnect error:', error)
      toast.error(error.message)
    }
  }

  const getStatusIcon = () => {
    switch (status) {
      case 'loading':
        return <Loader className="h-5 w-5 animate-spin text-theme-tertiary" />
      case 'connected':
        return <CheckCircle className="h-5 w-5 text-success" />
      default:
        return <XCircle className="h-5 w-5 text-theme-tertiary" />
    }
  }

  return (
    <div className="bg-theme-primary rounded-lg border border-theme p-4">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-start gap-3">
          {getStatusIcon()}
          <div>
            <h4 className="font-medium text-theme-primary">eBay</h4>
            <p className="text-sm text-theme-tertiary">Seller account for listing management</p>
          </div>
        </div>
        <span className={`px-2 py-1 text-xs rounded-lg ${
          status === 'connected' 
            ? 'bg-success/10 text-success' 
            : 'bg-gray-200 dark:bg-gray-700 text-theme-tertiary'
        }`}>
          {status === 'connected' ? 'Connected' : 'Not Connected'}
        </span>
      </div>

      {message && (
        <div className="mb-3 p-2 rounded bg-error/10 text-error text-sm">
          {message}
        </div>
      )}

      {status === 'connected' && connectionStatus ? (
        <div className="space-y-2">
          <p className="text-sm text-success">
            Connected as: {connectionStatus.userId || 'eBay User'}
          </p>
          <button
            onClick={disconnectEbay}
            className="flex items-center gap-2 px-3 py-2 text-sm text-error border border-error/30 rounded-lg hover:bg-error/10 transition-colors"
          >
            <Unlink className="h-4 w-4" />
            Disconnect
          </button>
        </div>
      ) : (
        <button
          onClick={connectEbay}
          disabled={connecting}
          className="flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent-hover disabled:opacity-50 transition-colors"
        >
          {connecting ? (
            <>
              <Loader className="h-4 w-4 animate-spin" />
              Connecting...
            </>
          ) : (
            <>
              <Link2 className="h-4 w-4" />
              Connect eBay Account
            </>
          )}
        </button>
      )}
    </div>
  )
}

// Keepa Integration Card
function KeepaIntegration({ onStatusChange }) {
  const [apiKey, setApiKey] = useState('')
  const [existingKey, setExistingKey] = useState(null)
  const [showKey, setShowKey] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadKey()
  }, [])

  // Notify parent when connection status changes
  useEffect(() => {
    onStatusChange?.(existingKey?.hasKey === true)
  }, [existingKey, onStatusChange])

  const loadKey = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const { data } = await supabase
        .from('user_api_keys')
        .select('*')
        .eq('service', 'keepa')
        .maybeSingle()

      if (data) {
        setExistingKey({
          id: data.id,
          hasKey: !!data.api_key_encrypted,
          isValid: data.is_valid
        })
        setApiKey('••••••••••••••••••••••••••••••••••••••••••••••••')
      }
    } catch (error) {
      console.error('Error loading Keepa key:', error)
    }
  }

  const saveKey = async () => {
    if (!apiKey.trim() || apiKey === '••••••••••••••••••••••••••••••••••••••••••••••••') return
    
    setSaving(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not authenticated')

      const response = await fetch('/.netlify/functions/save-api-key', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ service: 'keepa', apiKey: apiKey.trim() })
      })

      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Failed to save key')

      toast.success('Keepa API key saved successfully')
      await loadKey()
    } catch (error) {
      console.error('Error saving key:', error)
      toast.error(error.message)
    } finally {
      setSaving(false)
    }
  }

  const deleteKey = async () => {
    if (!confirm('Are you sure you want to delete your Keepa API key?')) return

    try {
      const { error } = await supabase
        .from('user_api_keys')
        .delete()
        .eq('id', existingKey.id)

      if (error) throw error

      toast.success('Keepa API key deleted')
      setExistingKey(null)
      setApiKey('')
    } catch (error) {
      console.error('Error deleting key:', error)
      toast.error('Failed to delete key')
    }
  }

  return (
    <div className="bg-theme-primary rounded-lg border border-theme p-4">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h4 className="font-medium text-theme-primary">Keepa</h4>
          <p className="text-sm text-theme-tertiary">Amazon product data and price history</p>
          <a
            href="https://keepa.com/#!api"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-accent hover:text-accent-hover transition-colors inline-flex items-center gap-1 mt-1"
          >
            Get API key <ExternalLink className="h-3 w-3" />
          </a>
        </div>
        {existingKey?.hasKey && (
          <span className={`px-2 py-1 text-xs rounded-lg ${
            existingKey.isValid 
              ? 'bg-success/10 text-success' 
              : 'bg-error/10 text-error'
          }`}>
            {existingKey.isValid ? 'Configured' : 'Invalid'}
          </span>
        )}
      </div>

      <div className="flex gap-2">
        <div className="flex-1 relative">
          <input
            type={showKey ? 'text' : 'password'}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            onFocus={() => {
              if (apiKey === '••••••••••••••••••••••••••••••••••••••••••••••••') {
                setApiKey('')
              }
            }}
            placeholder="Enter your Keepa API key"
            className="w-full px-3 py-2 bg-theme-surface border border-theme rounded-lg text-theme-primary"
          />
          <button
            type="button"
            onClick={() => setShowKey(!showKey)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-theme-tertiary hover:text-theme-primary"
          >
            {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        <button
          onClick={saveKey}
          disabled={saving || !apiKey.trim() || apiKey === '••••••••••••••••••••••••••••••••••••••••••••••••'}
          className="px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent-hover disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
        {existingKey?.hasKey && (
          <button
            onClick={deleteKey}
            className="px-4 py-2 bg-error/10 text-error border border-error/30 rounded-lg hover:bg-error/20"
          >
            Delete
          </button>
        )}
      </div>
    </div>
  )
}

// Eleven Labs Integration Card
function ElevenLabsIntegration({ onStatusChange }) {
  const [apiKey, setApiKey] = useState('')
  const [existingKey, setExistingKey] = useState(null)
  const [showKey, setShowKey] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadKey()
  }, [])

  // Notify parent when connection status changes
  useEffect(() => {
    onStatusChange?.(existingKey?.hasKey === true)
  }, [existingKey, onStatusChange])

  const loadKey = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const { data } = await supabase
        .from('user_api_keys')
        .select('*')
        .eq('service', 'elevenlabs')
        .maybeSingle()

      if (data) {
        setExistingKey({
          id: data.id,
          hasKey: !!data.api_key_encrypted,
          isValid: data.is_valid
        })
        setApiKey('••••••••••••••••••••••••••••••••••••••••••••••••')
      }
    } catch (error) {
      console.error('Error loading Eleven Labs key:', error)
    }
  }

  const saveKey = async () => {
    if (!apiKey.trim() || apiKey === '••••••••••••••••••••••••••••••••••••••••••••••••') return
    
    setSaving(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not authenticated')

      const response = await fetch('/.netlify/functions/save-api-key', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ service: 'elevenlabs', apiKey: apiKey.trim() })
      })

      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Failed to save key')

      toast.success('Eleven Labs API key saved successfully')
      await loadKey()
    } catch (error) {
      console.error('Error saving key:', error)
      toast.error(error.message)
    } finally {
      setSaving(false)
    }
  }

  const deleteKey = async () => {
    if (!confirm('Are you sure you want to delete your Eleven Labs API key?')) return

    try {
      const { error } = await supabase
        .from('user_api_keys')
        .delete()
        .eq('id', existingKey.id)

      if (error) throw error

      toast.success('Eleven Labs API key deleted')
      setExistingKey(null)
      setApiKey('')
    } catch (error) {
      console.error('Error deleting key:', error)
      toast.error('Failed to delete key')
    }
  }

  return (
    <div className="bg-theme-primary rounded-lg border border-theme p-4">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h4 className="font-medium text-theme-primary">Eleven Labs</h4>
          <p className="text-sm text-theme-tertiary">AI voice generation for video dubbing</p>
          <a
            href="https://elevenlabs.io/app/settings/api-keys"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-accent hover:text-accent-hover transition-colors inline-flex items-center gap-1 mt-1"
          >
            Get API key <ExternalLink className="h-3 w-3" />
          </a>
        </div>
        {existingKey?.hasKey && (
          <span className={`px-2 py-1 text-xs rounded-lg ${
            existingKey.isValid 
              ? 'bg-success/10 text-success' 
              : 'bg-error/10 text-error'
          }`}>
            {existingKey.isValid ? 'Configured' : 'Invalid'}
          </span>
        )}
      </div>

      <div className="flex gap-2">
        <div className="flex-1 relative">
          <input
            type={showKey ? 'text' : 'password'}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            onFocus={() => {
              if (apiKey === '••••••••••••••••••••••••••••••••••••••••••••••••') {
                setApiKey('')
              }
            }}
            placeholder="Enter your Eleven Labs API key"
            className="w-full px-3 py-2 bg-theme-surface border border-theme rounded-lg text-theme-primary"
          />
          <button
            type="button"
            onClick={() => setShowKey(!showKey)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-theme-tertiary hover:text-theme-primary"
          >
            {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        <button
          onClick={saveKey}
          disabled={saving || !apiKey.trim() || apiKey === '••••••••••••••••••••••••••••••••••••••••••••••••'}
          className="px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent-hover disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
        {existingKey?.hasKey && (
          <button
            onClick={deleteKey}
            className="px-4 py-2 bg-error/10 text-error border border-error/30 rounded-lg hover:bg-error/20"
          >
            Delete
          </button>
        )}
      </div>
    </div>
  )
}

// OneDrive Integration Card
function OneDriveIntegrationCard({ onStatusChange }) {
  return (
    <div className="bg-theme-primary rounded-lg border border-theme p-4">
      <div className="mb-3">
        <h4 className="font-medium text-theme-primary">OneDrive</h4>
        <p className="text-sm text-theme-tertiary">Cloud storage for product videos</p>
      </div>
      <OneDriveConnection onStatusChange={onStatusChange} />
    </div>
  )
}

// Facebook Integration Card
function MetaIntegration({ onStatusChange }) {
  const [searchParams] = useSearchParams()
  const [isConnecting, setIsConnecting] = useState(false)
  
  const { data: metaStatus, isLoading, refetch: refetchMeta } = useQuery(
    ['metaStatus'],
    async () => {
      const token = await userAPI.getAuthToken()
      const response = await fetch('/.netlify/functions/meta-status', {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (!response.ok) throw new Error('Failed to fetch Meta status')
      return response.json()
    },
    {
      refetchOnWindowFocus: false
    }
  )

  // Notify parent when connection status changes
  useEffect(() => {
    const isConnected = metaStatus?.connected === true
    onStatusChange?.(isConnected)
  }, [metaStatus, onStatusChange])

  // Handle Meta OAuth callback from URL params
  useEffect(() => {
    const metaParam = searchParams.get('meta')
    if (metaParam === 'connected') {
      refetchMeta()
      toast.success('Meta connected successfully!')
    } else if (metaParam === 'error') {
      toast.error('Meta connection failed')
    }
  }, [searchParams])

  const handleConnect = async () => {
    setIsConnecting(true)
    try {
      const token = await userAPI.getAuthToken()
      const response = await fetch('/.netlify/functions/meta-auth', {
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await response.json()
      if (data.authUrl) {
        window.location.href = data.authUrl
      }
    } catch (error) {
      console.error('Failed to start Meta auth:', error)
      toast.error('Failed to start Meta connection')
    } finally {
      setIsConnecting(false)
    }
  }

  const handleDisconnect = async () => {
    if (!confirm('Are you sure you want to disconnect your Meta accounts?')) return
    try {
      const token = await userAPI.getAuthToken()
      await fetch('/.netlify/functions/meta-disconnect', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      })
      refetchMeta()
      toast.success('Meta accounts disconnected')
    } catch (error) {
      console.error('Failed to disconnect Meta:', error)
      toast.error('Failed to disconnect Meta')
    }
  }

  const connection = metaStatus?.connection

  return (
    <div className="bg-theme-primary rounded-lg border border-theme p-4">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
          <Facebook className="w-6 h-6 text-white" />
        </div>
        <div className="flex-1">
          <h4 className="font-medium text-theme-primary">Meta (Facebook & Instagram)</h4>
          <p className="text-sm text-theme-tertiary">Post content to Facebook Page and Instagram</p>
        </div>
        {isLoading ? (
          <Loader className="w-5 h-5 animate-spin text-theme-secondary" />
        ) : metaStatus?.connected ? (
          <span className="px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 text-sm rounded-full flex items-center gap-1">
            <CheckCircle className="w-4 h-4" /> Connected
          </span>
        ) : (
          <span className="px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 text-sm rounded-full">
            Not connected
          </span>
        )}
      </div>

      {metaStatus?.connected ? (
        <div className="space-y-4">
          {/* Connected Accounts Info */}
          <div className="space-y-2">
            {connection?.pageName && (
              <div className="flex items-center gap-3 p-3 bg-theme-surface rounded-lg">
                <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                  <Facebook className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-theme-primary">{connection.pageName}</p>
                  <p className="text-sm text-theme-secondary">Facebook Page</p>
                </div>
                <CheckCircle className="w-5 h-5 text-green-500" />
              </div>
            )}
            {connection?.instagramUsername ? (
              <div className="flex items-center gap-3 p-3 bg-theme-surface rounded-lg">
                <div className="w-8 h-8 bg-gradient-to-br from-purple-500 via-pink-500 to-orange-500 rounded-lg flex items-center justify-center">
                  <Instagram className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-theme-primary">@{connection.instagramUsername}</p>
                  <p className="text-sm text-theme-secondary">Instagram Business</p>
                </div>
                <CheckCircle className="w-5 h-5 text-green-500" />
              </div>
            ) : (
              <div className="flex items-center gap-3 p-3 bg-theme-surface rounded-lg opacity-60">
                <div className="w-8 h-8 bg-gray-600 rounded-lg flex items-center justify-center">
                  <Instagram className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-theme-primary">Instagram not linked</p>
                  <p className="text-sm text-theme-secondary">Link in Meta Business Suite</p>
                </div>
              </div>
            )}
            {connection?.connectedAt && (
              <p className="text-sm text-theme-secondary px-3">
                Connected {new Date(connection.connectedAt).toLocaleDateString()}
              </p>
            )}
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={handleDisconnect}
              className="text-red-500 hover:text-red-600 text-sm"
            >
              Disconnect
            </button>
            <a
              href="/docs/meta-connection-guide"
              target="_blank"
              className="text-accent hover:underline text-sm flex items-center gap-1"
            >
              <ExternalLink className="w-4 h-4" /> Setup Guide
            </a>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <button
            onClick={handleConnect}
            disabled={isConnecting}
            className="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isConnecting ? (
              <Loader className="w-5 h-5 animate-spin" />
            ) : (
              <Share2 className="w-5 h-5" />
            )}
            Connect Meta Accounts
          </button>
          <a
            href="/docs/meta-connection-guide"
            target="_blank"
            className="block text-center text-accent hover:underline text-sm"
          >
            View Setup Guide
          </a>
        </div>
      )}
    </div>
  )
}

// Instagram Integration Card
function InstagramIntegration({ onStatusChange }) {
  const [searchParams] = useSearchParams()
  const [isConnecting, setIsConnecting] = useState(false)
  
  const { data: instagramStatus, isLoading, refetch: refetchInstagram } = useQuery(
    ['instagramStatus'],
    async () => {
      const token = await userAPI.getAuthToken()
      const response = await fetch('/.netlify/functions/instagram-status', {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (!response.ok) throw new Error('Failed to fetch Instagram status')
      return response.json()
    },
    {
      refetchOnWindowFocus: false
    }
  )

  // Notify parent when connection status changes
  useEffect(() => {
    const isConnected = instagramStatus?.connected === true
    onStatusChange?.(isConnected)
  }, [instagramStatus, onStatusChange])

  // Handle Instagram OAuth callback from URL params
  useEffect(() => {
    const instagramParam = searchParams.get('instagram')
    if (instagramParam === 'connected') {
      refetchInstagram()
      toast.success('Instagram connected successfully!')
    } else if (instagramParam === 'error') {
      toast.error('Instagram connection failed')
    }
  }, [searchParams])

  const handleConnect = async () => {
    setIsConnecting(true)
    try {
      const token = await userAPI.getAuthToken()
      const response = await fetch('/.netlify/functions/instagram-auth', {
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await response.json()
      if (data.authUrl) {
        window.location.href = data.authUrl
      }
    } catch (error) {
      console.error('Failed to start Instagram auth:', error)
      toast.error('Failed to start Instagram connection')
    } finally {
      setIsConnecting(false)
    }
  }

  const handleDisconnect = async () => {
    if (!confirm('Are you sure you want to disconnect Instagram?')) return
    try {
      const token = await userAPI.getAuthToken()
      await fetch('/.netlify/functions/instagram-disconnect', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      })
      refetchInstagram()
      toast.success('Instagram disconnected')
    } catch (error) {
      console.error('Failed to disconnect Instagram:', error)
      toast.error('Failed to disconnect Instagram')
    }
  }

  return (
    <div className="bg-theme-primary rounded-lg border border-theme p-4">
      <div className="flex items-center gap-3 mb-4">
        <div className="flex-1">
          <h4 className="font-medium text-theme-primary">Instagram</h4>
          <p className="text-sm text-theme-tertiary">Post content to Instagram</p>
        </div>
        {isLoading ? (
          <Loader className="w-5 h-5 animate-spin text-theme-secondary" />
        ) : instagramStatus?.connected ? (
          <span className="px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 text-sm rounded-full flex items-center gap-1">
            <CheckCircle className="w-4 h-4" /> Connected
          </span>
        ) : (
          <span className="px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 text-sm rounded-full">
            Not connected
          </span>
        )}
      </div>

      {instagramStatus?.connected ? (
        <div className="space-y-4">
          {/* Connected Account Info */}
          <div className="space-y-2">
            {instagramStatus.connection?.username && (
              <div className="flex items-center gap-3 p-3 bg-theme-surface rounded-lg">
                <div className="flex-1">
                  <p className="font-medium text-theme-primary">@{instagramStatus.connection.username}</p>
                  <p className="text-sm text-theme-secondary">Instagram Account</p>
                </div>
              </div>
            )}
            {instagramStatus.connection?.connectedAt && (
              <p className="text-sm text-theme-secondary px-3">
                Connected {new Date(instagramStatus.connection.connectedAt).toLocaleDateString()}
              </p>
            )}
          </div>

          <button
            onClick={handleDisconnect}
            className="text-red-500 hover:text-red-600 text-sm"
          >
            Disconnect
          </button>
        </div>
      ) : (
        <button
          onClick={handleConnect}
          disabled={isConnecting}
          className="w-full py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg hover:from-purple-700 hover:to-pink-700 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {isConnecting ? (
            <Loader className="w-5 h-5 animate-spin" />
          ) : (
            <Share2 className="w-5 h-5" />
          )}
          Connect Instagram
        </button>
      )}
    </div>
  )
}

// YouTube Integration Card
function YouTubeIntegration({ onStatusChange }) {
  const [searchParams] = useSearchParams()
  const [youtubeSchedule, setYoutubeSchedule] = useState({ 
    post_time: '09:00', 
    timezone: 'America/Chicago', 
    is_active: false 
  })
  const [isConnectingYoutube, setIsConnectingYoutube] = useState(false)
  const [isSavingYoutubeSchedule, setIsSavingYoutubeSchedule] = useState(false)
  
  const { data: youtubeStatus, isLoading: isLoadingYoutube, refetch: refetchYoutube } = useQuery(
    ['youtubeStatus'],
    async () => {
      const token = await userAPI.getAuthToken()
      const response = await fetch('/.netlify/functions/youtube-status', {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (!response.ok) throw new Error('Failed to fetch YouTube status')
      return response.json()
    },
    {
      refetchOnWindowFocus: false,
      onSuccess: (data) => {
        if (data.schedule) {
          setYoutubeSchedule(data.schedule)
        }
      }
    }
  )

  // Notify parent when connection status changes
  useEffect(() => {
    onStatusChange?.(youtubeStatus?.connected === true)
  }, [youtubeStatus, onStatusChange])

  // Handle YouTube OAuth callback from URL params
  useEffect(() => {
    const youtubeParam = searchParams.get('youtube')
    if (youtubeParam === 'connected') {
      refetchYoutube()
      toast.success('YouTube connected successfully!')
    } else if (youtubeParam === 'error') {
      toast.error('YouTube connection failed')
    }
  }, [searchParams])

  const handleConnectYoutube = async () => {
    setIsConnectingYoutube(true)
    try {
      const token = await userAPI.getAuthToken()
      const response = await fetch('/.netlify/functions/youtube-auth', {
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await response.json()
      if (data.authUrl) {
        window.location.href = data.authUrl
      }
    } catch (error) {
      console.error('Failed to start YouTube auth:', error)
      toast.error('Failed to start YouTube connection')
    } finally {
      setIsConnectingYoutube(false)
    }
  }

  const handleDisconnectYoutube = async () => {
    if (!confirm('Are you sure you want to disconnect YouTube?')) return
    try {
      const token = await userAPI.getAuthToken()
      await fetch('/.netlify/functions/youtube-status', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      })
      refetchYoutube()
      toast.success('YouTube disconnected')
    } catch (error) {
      console.error('Failed to disconnect YouTube:', error)
      toast.error('Failed to disconnect YouTube')
    }
  }

  const handleSaveYoutubeSchedule = async () => {
    setIsSavingYoutubeSchedule(true)
    try {
      const token = await userAPI.getAuthToken()
      await fetch('/.netlify/functions/youtube-status', {
        method: 'PUT',
        headers: { 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(youtubeSchedule)
      })
      refetchYoutube()
      toast.success('Schedule saved!')
    } catch (error) {
      console.error('Failed to save schedule:', error)
      toast.error('Failed to save schedule')
    } finally {
      setIsSavingYoutubeSchedule(false)
    }
  }

  return (
    <div className="bg-theme-primary rounded-lg border border-theme p-4">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 bg-red-600 rounded-lg flex items-center justify-center">
          <Youtube className="w-6 h-6 text-white" />
        </div>
        <div className="flex-1">
          <h4 className="font-medium text-theme-primary">YouTube</h4>
          <p className="text-sm text-theme-tertiary">Post videos as YouTube Shorts</p>
        </div>
        {isLoadingYoutube ? (
          <Loader className="w-5 h-5 animate-spin text-theme-secondary" />
        ) : youtubeStatus?.connected ? (
          <span className="px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 text-sm rounded-full flex items-center gap-1">
            <CheckCircle className="w-4 h-4" /> Connected
          </span>
        ) : (
          <span className="px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 text-sm rounded-full">
            Not connected
          </span>
        )}
      </div>

      {youtubeStatus?.connected ? (
        <div className="space-y-4">
          {/* Connected Channel Info */}
          <div className="flex items-center gap-3 p-3 bg-theme-surface rounded-lg">
            {youtubeStatus.connection.channelAvatar && (
              <img 
                src={youtubeStatus.connection.channelAvatar} 
                alt="" 
                className="w-10 h-10 rounded-full"
              />
            )}
            <div className="flex-1">
              <p className="font-medium text-theme-primary">{youtubeStatus.connection.channelName}</p>
              <p className="text-sm text-theme-secondary">
                Connected {new Date(youtubeStatus.connection.connectedAt).toLocaleDateString()}
              </p>
            </div>
            <button
              onClick={handleDisconnectYoutube}
              className="text-red-500 hover:text-red-600 text-sm"
            >
              Disconnect
            </button>
          </div>

          {/* Posting Schedule */}
          <div className="border-t border-theme pt-4">
            <h5 className="font-medium text-theme-primary mb-3 flex items-center gap-2">
              <Clock className="w-4 h-4" /> Daily Posting Schedule
            </h5>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm text-theme-secondary mb-1">Post Time</label>
                <input
                  type="time"
                  value={youtubeSchedule.post_time}
                  onChange={(e) => setYoutubeSchedule(prev => ({ ...prev, post_time: e.target.value }))}
                  className="w-full border border-theme rounded-lg px-3 py-2 bg-theme-surface text-theme-primary"
                />
              </div>
              <div>
                <label className="block text-sm text-theme-secondary mb-1">Timezone</label>
                <select
                  value={youtubeSchedule.timezone}
                  onChange={(e) => setYoutubeSchedule(prev => ({ ...prev, timezone: e.target.value }))}
                  className="w-full border border-theme rounded-lg px-3 py-2 bg-theme-surface text-theme-primary"
                >
                  <option value="America/New_York">Eastern (ET)</option>
                  <option value="America/Chicago">Central (CT)</option>
                  <option value="America/Denver">Mountain (MT)</option>
                  <option value="America/Los_Angeles">Pacific (PT)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-theme-secondary mb-1">Status</label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={youtubeSchedule.is_active}
                    onChange={(e) => setYoutubeSchedule(prev => ({ ...prev, is_active: e.target.checked }))}
                    className="w-4 h-4 rounded"
                  />
                  <span className="text-theme-primary">Enable auto-posting</span>
                </label>
              </div>
            </div>
            <button
              onClick={handleSaveYoutubeSchedule}
              disabled={isSavingYoutubeSchedule}
              className="mt-4 px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent-hover disabled:opacity-50"
            >
              {isSavingYoutubeSchedule ? 'Saving...' : 'Save Schedule'}
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={handleConnectYoutube}
          disabled={isConnectingYoutube}
          className="w-full py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {isConnectingYoutube ? (
            <Loader className="w-5 h-5 animate-spin" />
          ) : (
            <Youtube className="w-5 h-5" />
          )}
          Connect YouTube Channel
        </button>
      )}
    </div>
  )
}

// Main Integrations Page
export default function Integrations() {
  const [searchParams] = useSearchParams()
  const [openCategories, setOpenCategories] = useState([]) // All collapsed by default
  const [connectionStatuses, setConnectionStatuses] = useState({
    ebay: false,
    keepa: false,
    onedrive: false,
    elevenlabs: false,
    youtube: false,
    instagram: false,
    facebook: false
  })
  const [isLoadingStatuses, setIsLoadingStatuses] = useState(true)

  // Check for OAuth callback success/error messages
  useEffect(() => {
    if (searchParams.get('ebay_connected') === 'true') {
      toast.success('eBay connected successfully!')
    } else if (searchParams.get('ebay_error')) {
      toast.error(`eBay connection failed: ${searchParams.get('ebay_error')}`)
    }
  }, [searchParams])

  // Fetch all connection statuses on mount (independent of accordion state)
  useEffect(() => {
    const fetchAllConnectionStatuses = async () => {
      setIsLoadingStatuses(true)
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) {
          setIsLoadingStatuses(false)
          return
        }

        // Fetch eBay status
        try {
          const ebayResponse = await fetch('/.netlify/functions/ebay-connection-status', {
            headers: { 'Authorization': `Bearer ${session.access_token}` }
          })
          const ebayData = await ebayResponse.json()
          updateConnectionStatus('ebay', ebayData.connected === true)
        } catch (error) {
          console.error('Failed to fetch eBay status:', error)
        }

        // Fetch Keepa API key status
        try {
          const { data: keepaData } = await supabase
            .from('user_api_keys')
            .select('*')
            .eq('service', 'keepa')
            .maybeSingle()
          updateConnectionStatus('keepa', keepaData?.api_key_encrypted ? true : false)
        } catch (error) {
          console.error('Failed to fetch Keepa status:', error)
        }

        // Fetch Eleven Labs API key status
        try {
          const { data: elevenLabsData } = await supabase
            .from('user_api_keys')
            .select('*')
            .eq('service', 'elevenlabs')
            .maybeSingle()
          updateConnectionStatus('elevenlabs', elevenLabsData?.api_key_encrypted ? true : false)
        } catch (error) {
          console.error('Failed to fetch Eleven Labs status:', error)
        }

        // Fetch OneDrive status
        try {
          const onedriveResponse = await fetch('/.netlify/functions/onedrive-status', {
            headers: { 'Authorization': `Bearer ${session.access_token}` }
          })
          const onedriveData = await onedriveResponse.json()
          updateConnectionStatus('onedrive', onedriveData.connected === true)
        } catch (error) {
          console.error('Failed to fetch OneDrive status:', error)
        }

        // Fetch YouTube status
        try {
          const youtubeResponse = await fetch('/.netlify/functions/youtube-status', {
            headers: { 'Authorization': `Bearer ${session.access_token}` }
          })
          const youtubeData = await youtubeResponse.json()
          updateConnectionStatus('youtube', youtubeData.connected === true)
        } catch (error) {
          console.error('Failed to fetch YouTube status:', error)
        }

        // Fetch Facebook status
        try {
          const facebookResponse = await fetch('/.netlify/functions/meta-status', {
            headers: { 'Authorization': `Bearer ${session.access_token}` }
          })
          const facebookData = await facebookResponse.json()
          updateConnectionStatus('facebook', facebookData.connected === true)
        } catch (error) {
          console.error('Failed to fetch Facebook status:', error)
        }

        // Fetch Instagram status
        try {
          const instagramResponse = await fetch('/.netlify/functions/instagram-status', {
            headers: { 'Authorization': `Bearer ${session.access_token}` }
          })
          const instagramData = await instagramResponse.json()
          updateConnectionStatus('instagram', instagramData.connected === true)
        } catch (error) {
          console.error('Failed to fetch Instagram status:', error)
        }
      } catch (error) {
        console.error('Failed to fetch connection statuses:', error)
      } finally {
        setIsLoadingStatuses(false)
      }
    }

    fetchAllConnectionStatuses()
  }, [])

  const toggleCategory = (categoryId) => {
    setOpenCategories(prev =>
      prev.includes(categoryId)
        ? prev.filter(id => id !== categoryId)
        : [...prev, categoryId]
    )
  }

  const updateConnectionStatus = (integration, isConnected) => {
    setConnectionStatuses(prev => ({
      ...prev,
      [integration]: isConnected
    }))
  }

  const getConnectedCount = (categoryId) => {
    const category = CATEGORIES.find(cat => cat.id === categoryId)
    if (!category) return 0
    
    return category.integrations.filter(
      integration => connectionStatuses[integration]
    ).length
  }

  return (
    <div className="max-w-5xl mx-auto py-8 px-4">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-theme-primary">Integrations</h1>
        <p className="mt-2 text-theme-secondary">
          Connect your accounts and manage API credentials for external services.
        </p>
      </div>

      <div className="space-y-4">
        {CATEGORIES.map(category => (
          <AccordionSection
            key={category.id}
            category={category}
            isOpen={openCategories.includes(category.id)}
            onToggle={() => toggleCategory(category.id)}
            connectedCount={getConnectedCount(category.id)}
            isLoading={isLoadingStatuses}
          >
            {category.id === 'marketplace' && (
              <>
                <EbayIntegration 
                  onStatusChange={(connected) => updateConnectionStatus('ebay', connected)} 
                />
                <KeepaIntegration 
                  onStatusChange={(connected) => updateConnectionStatus('keepa', connected)} 
                />
              </>
            )}
            {category.id === 'influencer' && (
              <>
                <OneDriveIntegrationCard 
                  onStatusChange={(connected) => updateConnectionStatus('onedrive', connected)} 
                />
                <ElevenLabsIntegration 
                  onStatusChange={(connected) => updateConnectionStatus('elevenlabs', connected)} 
                />
              </>
            )}
            {category.id === 'social' && (
              <>
                <YouTubeIntegration 
                  onStatusChange={(connected) => updateConnectionStatus('youtube', connected)} 
                />
                <MetaIntegration 
                  onStatusChange={(connected) => updateConnectionStatus('meta', connected)} 
                />
              </>
            )}
          </AccordionSection>
        ))}
      </div>

      <div className="mt-8 p-4 bg-accent/10 border border-accent/30 rounded-lg">
        <h3 className="font-medium text-accent">Security Note</h3>
        <p className="mt-1 text-sm text-theme-secondary">
          Your API keys are encrypted at rest and only used to make requests on your behalf. 
          We never share your keys with third parties.
        </p>
      </div>
    </div>
  )
}

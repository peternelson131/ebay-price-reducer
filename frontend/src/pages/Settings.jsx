import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'react-toastify'
import { userAPI } from '../lib/supabase'
import ThumbnailTemplateModal from '../components/ThumbnailTemplateModal'
import { Trash2, Edit, Plus } from 'lucide-react'

export default function Settings() {
  const [activeTab, setActiveTab] = useState('general')
  const [saving, setSaving] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState(null)
  const [loadingStatus, setLoadingStatus] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const { register, handleSubmit } = useForm()

  const onSaveGeneral = (data) => {
    console.log('General settings:', data)
    toast.success('General settings saved')
  }

  const fetchConnectionStatus = async () => {
    try {
      setLoadingStatus(true)
      const token = await userAPI.getAuthToken()
      const response = await fetch('/.netlify/functions/ebay-oauth?action=status', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      const data = await response.json()
      setConnectionStatus(data)
    } catch (error) {
      console.error('Error fetching connection status:', error)
      toast.error('Failed to load eBay connection status. Please refresh the page.')
    } finally {
      setLoadingStatus(false)
    }
  }

  const connectEbay = async () => {
    try {
      // Prevent concurrent connection attempts
      if (window.ebayAuthWindow && !window.ebayAuthWindow.closed) {
        window.ebayAuthWindow.focus()
        toast.info('eBay connection window is already open. Please complete the authorization.')
        return
      }

      setConnecting(true)

      // Get OAuth authorization URL from backend (uses platform credentials)
      const token = await userAPI.getAuthToken()
      const response = await fetch('/.netlify/functions/ebay-oauth-start', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to get authorization URL')
      }

      if (data.authUrl) {
        // Open eBay OAuth in new window
        const authWindow = window.open(
          data.authUrl,
          'ebay-auth',
          'width=600,height=700,scrollbars=yes'
        )

        // Check if popup was blocked
        if (!authWindow || authWindow.closed || typeof authWindow.closed === 'undefined') {
          toast.error('Popup blocked! Please allow popups for this site and try again.')
          setConnecting(false)
          return
        }

        // Store reference to the popup window
        window.ebayAuthWindow = authWindow

        // Allowed origins for security validation
        const allowedOrigins = [
          window.location.origin,
          /^https:\/\/.*\.netlify\.app$/,
          /^http:\/\/localhost(:\d+)?$/
        ]

        // Listen for messages from the popup
        const messageHandler = (event) => {
          // Security: Strict origin validation with exact matching
          const isAllowedOrigin = allowedOrigins.some(allowed => {
            if (typeof allowed === 'string') {
              return event.origin === allowed
            } else if (allowed instanceof RegExp) {
              return allowed.test(event.origin)
            }
            return false
          })

          if (!isAllowedOrigin) {
            console.warn(`Rejected message from untrusted origin: ${event.origin}`)
            return
          }

          if (event.data.type === 'ebay-oauth-success') {
            console.log('eBay OAuth success!', event.data)

            // Clean up listeners and window reference
            clearInterval(checkClosed)
            window.removeEventListener('message', messageHandler)
            window.ebayAuthWindow = null

            // Refresh status
            fetchConnectionStatus()

            toast.success(`Successfully connected to eBay${event.data.ebayUser ? ` as ${event.data.ebayUser}` : ''}!`)
            setConnecting(false)
          } else if (event.data.type === 'ebay-oauth-error') {
            console.error('eBay OAuth error:', event.data)

            // Clean up listeners and window reference
            clearInterval(checkClosed)
            window.removeEventListener('message', messageHandler)
            window.ebayAuthWindow = null

            toast.error(`Failed to connect to eBay: ${event.data.error || 'Unknown error'}`)
            setConnecting(false)
          }
        }

        // Add message event listener
        window.addEventListener('message', messageHandler)

        // Check if window was closed without completing OAuth
        const checkClosed = setInterval(() => {
          if (authWindow.closed) {
            clearInterval(checkClosed)
            window.removeEventListener('message', messageHandler)
            window.ebayAuthWindow = null
            setConnecting(false)
          }
        }, 1000)
      } else {
        throw new Error('Failed to get authorization URL')
      }
    } catch (error) {
      console.error('Connection error:', error)
      toast.error(`Failed to connect to eBay: ${error.message}`)
      setConnecting(false)
    }
  }

  const disconnectEbay = async () => {
    if (!confirm('Are you sure you want to disconnect your eBay account?\n\nThis will remove your OAuth token but keep your developer credentials.')) {
      return
    }

    setDisconnecting(true)

    try {
      const token = await userAPI.getAuthToken()
      const response = await fetch('/.netlify/functions/ebay-oauth?action=disconnect', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })

      const data = await response.json()

      if (response.ok && data.success) {
        // Refresh status
        await fetchConnectionStatus()
        await fetchCredentials()

        toast.success('eBay account disconnected successfully')
      } else {
        throw new Error(data.error || 'Failed to disconnect')
      }
    } catch (error) {
      console.error('Disconnect error:', error)
      toast.error(`Failed to disconnect: ${error.message}`)
    } finally {
      setDisconnecting(false)
    }
  }

  const testConnection = async () => {
    try {
      const token = await userAPI.getAuthToken()
      const response = await fetch('/.netlify/functions/test-ebay-connection', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      const data = await response.json()

      if (data.success) {
        toast.success(`eBay API connection successful! Active listings: ${data.activeListings || 0}`)
      } else {
        toast.error(data.message || 'Connection test failed')
      }
    } catch (error) {
      console.error('Test error:', error)
      toast.error('Failed to test eBay connection')
    }
  }

  const onSaveNotifications = (data) => {
    console.log('Notification settings:', data)
    toast.success('Notification settings saved')
  }

  useEffect(() => {
    if (activeTab === 'ebay') {
      fetchConnectionStatus()
    }
    if (activeTab === 'social-accounts') {
      fetchSocialAccounts()
    }
    if (activeTab === 'ai-matching') {
      fetchAiSettings()
    }
    if (activeTab === 'thumbnail-templates') {
      fetchTemplates()
    }
  }, [activeTab])

  const tabs = [
    { id: 'general', name: 'General' },
    { id: 'ebay', name: 'eBay Integration' },
    { id: 'social-accounts', name: 'Social Accounts' },
    { id: 'notifications', name: 'Notifications' },
    { id: 'ai-matching', name: 'AI Matching' },
    { id: 'thumbnail-templates', name: 'Thumbnail Templates' },
  ]
  
  // AI Matching state
  const [customMatchingEnabled, setCustomMatchingEnabled] = useState(false)
  const [generatingPrompt, setGeneratingPrompt] = useState(false)
  const [feedbackStats, setFeedbackStats] = useState(null)
  const [loadingAiSettings, setLoadingAiSettings] = useState(false)
  
  // Thumbnail Templates state
  const [templates, setTemplates] = useState([])
  const [loadingTemplates, setLoadingTemplates] = useState(false)
  const [showTemplateModal, setShowTemplateModal] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState(null)
  const [deletingTemplateId, setDeletingTemplateId] = useState(null)
  
  // Social Accounts state
  const [socialAccounts, setSocialAccounts] = useState([])
  const [loadingSocialAccounts, setLoadingSocialAccounts] = useState(false)
  const [connectingPlatform, setConnectingPlatform] = useState(null)
  const [disconnectingAccountId, setDisconnectingAccountId] = useState(null)
  
  // Fetch AI matching settings
  const fetchAiSettings = async () => {
    try {
      setLoadingAiSettings(true)
      const token = await userAPI.getAuthToken()
      
      // Get user settings
      const { data: userData } = await userAPI.supabase
        .from('users')
        .select('custom_matching_enabled')
        .single()
      
      if (userData) {
        setCustomMatchingEnabled(userData.custom_matching_enabled || false)
      }
      
      // Get feedback stats
      const statsResponse = await fetch('/.netlify/functions/correlation-feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ action: 'stats' })
      })
      
      if (statsResponse.ok) {
        const statsData = await statsResponse.json()
        setFeedbackStats(statsData.stats)
      }
    } catch (error) {
      console.error('Error fetching AI settings:', error)
    } finally {
      setLoadingAiSettings(false)
    }
  }
  
  const toggleCustomMatching = async () => {
    try {
      const newValue = !customMatchingEnabled
      const { error } = await userAPI.supabase
        .from('users')
        .update({ custom_matching_enabled: newValue })
        .eq('id', (await userAPI.supabase.auth.getUser()).data.user.id)
      
      if (error) throw error
      
      setCustomMatchingEnabled(newValue)
      toast.success(newValue ? 'Custom matching enabled' : 'Custom matching disabled')
    } catch (error) {
      console.error('Error toggling custom matching:', error)
      toast.error('Failed to update setting')
    }
  }
  
  const generateCustomPrompt = async () => {
    try {
      setGeneratingPrompt(true)
      const token = await userAPI.getAuthToken()
      
      const response = await fetch('/.netlify/functions/generate-custom-prompt', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      })
      
      const data = await response.json()
      
      if (data.success) {
        toast.success('Custom matching criteria generated!')
        setCustomMatchingEnabled(true)
        fetchAiSettings()
      } else {
        toast.warning(data.message || 'Could not generate custom prompt')
      }
    } catch (error) {
      console.error('Error generating prompt:', error)
      toast.error('Failed to generate custom prompt')
    } finally {
      setGeneratingPrompt(false)
    }
  }
  
  // Fetch thumbnail templates
  const fetchTemplates = async () => {
    try {
      setLoadingTemplates(true)
      const token = await userAPI.getAuthToken()
      
      const response = await fetch('/.netlify/functions/thumbnail-templates', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
      
      if (response.ok) {
        const data = await response.json()
        setTemplates(data.templates || [])
      } else {
        throw new Error('Failed to fetch templates')
      }
    } catch (error) {
      console.error('Error fetching templates:', error)
      toast.error('Failed to load thumbnail templates')
    } finally {
      setLoadingTemplates(false)
    }
  }
  
  // Save template (create or update)
  const handleSaveTemplate = async (templateData) => {
    try {
      const token = await userAPI.getAuthToken()
      const isUpdate = !!templateData.id
      
      const url = isUpdate 
        ? `/.netlify/functions/thumbnail-templates?id=${templateData.id}`
        : '/.netlify/functions/thumbnail-templates'
      
      const response = await fetch(url, {
        method: isUpdate ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          owner_name: templateData.owner_name,
          template_image: templateData.template_image,
          placement_zone: templateData.placement_zone
        })
      })
      
      if (response.ok) {
        toast.success(isUpdate ? 'Template updated!' : 'Template created!')
        setShowTemplateModal(false)
        setEditingTemplate(null)
        fetchTemplates()
      } else {
        const error = await response.json()
        throw new Error(error.error || 'Failed to save template')
      }
    } catch (error) {
      console.error('Error saving template:', error)
      toast.error(error.message || 'Failed to save template')
    }
  }
  
  // Delete template
  const handleDeleteTemplate = async (templateId) => {
    if (!confirm('Are you sure you want to delete this template? This cannot be undone.')) {
      return
    }
    
    try {
      setDeletingTemplateId(templateId)
      const token = await userAPI.getAuthToken()
      
      const response = await fetch(`/.netlify/functions/thumbnail-templates?id=${templateId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
      
      if (response.ok) {
        toast.success('Template deleted')
        fetchTemplates()
      } else {
        throw new Error('Failed to delete template')
      }
    } catch (error) {
      console.error('Error deleting template:', error)
      toast.error('Failed to delete template')
    } finally {
      setDeletingTemplateId(null)
    }
  }
  
  // Edit template
  const handleEditTemplate = (template) => {
    setEditingTemplate(template)
    setShowTemplateModal(true)
  }
  
  // Fetch social accounts
  const fetchSocialAccounts = async () => {
    try {
      setLoadingSocialAccounts(true)
      const token = await userAPI.getAuthToken()
      
      const response = await fetch('/.netlify/functions/social-accounts-list', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
      
      if (response.ok) {
        const data = await response.json()
        setSocialAccounts(data.accounts || [])
      } else {
        throw new Error('Failed to fetch social accounts')
      }
    } catch (error) {
      console.error('Error fetching social accounts:', error)
      toast.error('Failed to load social account connections')
    } finally {
      setLoadingSocialAccounts(false)
    }
  }
  
  // Connect social account
  const connectSocialAccount = async (platform) => {
    try {
      // Prevent concurrent connection attempts
      if (window.socialAuthWindow && !window.socialAuthWindow.closed) {
        window.socialAuthWindow.focus()
        toast.info(`${platform} connection window is already open. Please complete the authorization.`)
        return
      }

      setConnectingPlatform(platform)

      // Get OAuth authorization URL from backend
      const token = await userAPI.getAuthToken()
      const response = await fetch('/.netlify/functions/social-accounts-connect', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ platform })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to get authorization URL')
      }

      if (data.authorizationUrl) {
        // Open OAuth in new window
        const authWindow = window.open(
          data.authorizationUrl,
          `${platform}-auth`,
          'width=600,height=700,scrollbars=yes'
        )

        // Check if popup was blocked
        if (!authWindow || authWindow.closed || typeof authWindow.closed === 'undefined') {
          toast.error('Popup blocked! Please allow popups for this site and try again.')
          setConnectingPlatform(null)
          return
        }

        // Store reference to the popup window
        window.socialAuthWindow = authWindow

        // Allowed origins for security validation
        const allowedOrigins = [
          window.location.origin,
          /^https:\/\/.*\.netlify\.app$/,
          /^http:\/\/localhost(:\d+)?$/
        ]

        // Listen for messages from the popup
        const messageHandler = (event) => {
          // Security: Strict origin validation
          const isAllowedOrigin = allowedOrigins.some(allowed => {
            if (typeof allowed === 'string') {
              return event.origin === allowed
            } else if (allowed instanceof RegExp) {
              return allowed.test(event.origin)
            }
            return false
          })

          if (!isAllowedOrigin) {
            console.warn(`Rejected message from untrusted origin: ${event.origin}`)
            return
          }

          if (event.data.type === 'social-oauth-success') {
            console.log(`${platform} OAuth success!`, event.data)

            // Clean up listeners and window reference
            clearInterval(checkClosed)
            window.removeEventListener('message', messageHandler)
            window.socialAuthWindow = null

            // Refresh accounts list
            fetchSocialAccounts()

            toast.success(`Successfully connected to ${platform}${event.data.username ? ` as ${event.data.username}` : ''}!`)
            setConnectingPlatform(null)
          } else if (event.data.type === 'social-oauth-error') {
            console.error(`${platform} OAuth error:`, event.data)

            // Clean up listeners and window reference
            clearInterval(checkClosed)
            window.removeEventListener('message', messageHandler)
            window.socialAuthWindow = null

            toast.error(`Failed to connect to ${platform}: ${event.data.error || 'Unknown error'}`)
            setConnectingPlatform(null)
          }
        }

        // Add message event listener
        window.addEventListener('message', messageHandler)

        // Check if window was closed without completing OAuth
        const checkClosed = setInterval(() => {
          if (authWindow.closed) {
            clearInterval(checkClosed)
            window.removeEventListener('message', messageHandler)
            window.socialAuthWindow = null
            setConnectingPlatform(null)
          }
        }, 1000)
      } else {
        throw new Error('Failed to get authorization URL')
      }
    } catch (error) {
      console.error('Connection error:', error)
      toast.error(`Failed to connect to ${platform}: ${error.message}`)
      setConnectingPlatform(null)
    }
  }
  
  // Disconnect social account
  const disconnectSocialAccount = async (accountId, platform) => {
    if (!confirm(`Are you sure you want to disconnect your ${platform} account?\n\nThis will remove your OAuth token and you'll need to reconnect to post to ${platform}.`)) {
      return
    }

    setDisconnectingAccountId(accountId)

    try {
      const token = await userAPI.getAuthToken()
      const response = await fetch(`/.netlify/functions/social-accounts-disconnect?id=${accountId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      const data = await response.json()

      if (response.ok && data.success) {
        // Refresh accounts list
        await fetchSocialAccounts()
        toast.success(`${platform} account disconnected successfully`)
      } else {
        throw new Error(data.error || 'Failed to disconnect')
      }
    } catch (error) {
      console.error('Disconnect error:', error)
      toast.error(`Failed to disconnect: ${error.message}`)
    } finally {
      setDisconnectingAccountId(null)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-theme-primary">Settings</h1>
        <p className="mt-1 text-sm text-theme-tertiary">
          Configure your eBay price reduction preferences
        </p>
      </div>

      <div className="card">
        {/* Tab Navigation */}
        <div className="border-b border-theme">
          <nav className="-mb-px flex space-x-8 px-6">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'border-ebay-blue text-ebay-blue'
                    : 'border-transparent text-theme-tertiary hover:text-theme-secondary hover:border-theme'
                }`}
              >
                {tab.name}
              </button>
            ))}
          </nav>
        </div>

        <div className="card-body">
          {/* General Settings */}
          {activeTab === 'general' && (
            <form onSubmit={handleSubmit(onSaveGeneral)} className="space-y-6">
              <div>
                <h3 className="text-lg font-medium text-theme-primary mb-4">
                  Default Price Reduction Settings
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="form-group">
                    <label className="form-label">Default Reduction Strategy</label>
                    <select {...register('defaultReductionStrategy')} className="form-input">
                      <option value="fixed_percentage">Fixed Percentage</option>
                      <option value="market_based">Market Based</option>
                      <option value="time_based">Time Based</option>
                    </select>
                    <p className="text-xs text-theme-tertiary mt-1">
                      Strategy applied to new imported listings
                    </p>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Default Reduction Percentage (%)</label>
                    <input
                      type="number"
                      min="1"
                      max="50"
                      defaultValue="5"
                      {...register('defaultReductionPercentage')}
                      className="form-input"
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Default Reduction Interval (days)</label>
                    <input
                      type="number"
                      min="1"
                      max="30"
                      defaultValue="7"
                      {...register('defaultReductionInterval')}
                      className="form-input"
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Default Minimum Price Ratio (%)</label>
                    <input
                      type="number"
                      min="10"
                      max="90"
                      defaultValue="70"
                      {...register('defaultMinimumPriceRatio')}
                      className="form-input"
                    />
                    <p className="text-xs text-theme-tertiary mt-1">
                      Percentage of original price to set as minimum (70% = never go below 70% of original)
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-medium text-theme-primary mb-4">
                  Monitoring Preferences
                </h3>

                <div className="space-y-4">
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="autoEnableMonitoring"
                      defaultChecked
                      {...register('autoEnableMonitoring')}
                      className="h-4 w-4 text-ebay-blue focus:ring-ebay-blue border-theme rounded"
                    />
                    <label htmlFor="autoEnableMonitoring" className="ml-2 text-sm text-theme-secondary">
                      Automatically enable monitoring for newly imported listings
                    </label>
                  </div>

                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="pauseOnWeekends"
                      {...register('pauseOnWeekends')}
                      className="h-4 w-4 text-ebay-blue focus:ring-ebay-blue border-theme rounded"
                    />
                    <label htmlFor="pauseOnWeekends" className="ml-2 text-sm text-theme-secondary">
                      Pause price reductions on weekends
                    </label>
                  </div>

                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="marketAnalysisBeforeReduction"
                      defaultChecked
                      {...register('marketAnalysisBeforeReduction')}
                      className="h-4 w-4 text-ebay-blue focus:ring-ebay-blue border-theme rounded"
                    />
                    <label htmlFor="marketAnalysisBeforeReduction" className="ml-2 text-sm text-theme-secondary">
                      Perform market analysis before each price reduction
                    </label>
                  </div>
                </div>
              </div>

              <div className="flex justify-end">
                <button type="submit" className="btn-primary">
                  Save General Settings
                </button>
              </div>
            </form>
          )}

          {/* eBay Integration */}
          {activeTab === 'ebay' && (
            <div className="space-y-6">
              {/* Loading State */}
              {loadingStatus && (
                <div className="bg-theme-primary border border-theme rounded-lg p-4">
                  <div className="animate-pulse flex space-x-4">
                    <div className="h-4 bg-gray-300 rounded w-1/4"></div>
                  </div>
                </div>
              )}

              {/* Connection Status */}
              {!loadingStatus && (
                <div className={`border rounded-lg p-4 ${
                  connectionStatus?.connected
                    ? 'bg-success/10 border-success/30'
                    : 'bg-theme-primary border-theme'
                }`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className={`font-medium ${
                        connectionStatus?.connected ? 'text-green-900' : 'text-theme-primary'
                      }`}>
                        eBay Account {connectionStatus?.connected ? 'Connected' : 'Not Connected'}
                      </h4>
                      {connectionStatus?.connected && connectionStatus.userId && (
                        <p className="text-sm text-green-700 mt-1">
                          Connected as: {connectionStatus.userId}
                        </p>
                      )}
                      {connectionStatus?.connected && connectionStatus.refreshTokenExpiresAt && (
                        <p className="text-xs text-success mt-1">
                          Token expires: {new Date(connectionStatus.refreshTokenExpiresAt).toLocaleDateString()}
                        </p>
                      )}
                      {!connectionStatus?.connected && (
                        <p className="text-sm text-theme-secondary mt-1">
                          Click below to securely connect your eBay seller account via OAuth.
                        </p>
                      )}
                    </div>
                    {connectionStatus?.connected && (
                      <div className="flex items-center space-x-2">
                        <div className="w-3 h-3 bg-success/100 rounded-full animate-pulse"></div>
                        <span className="text-sm font-medium text-green-700">Active</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="flex justify-start space-x-3">
                {/* Show Connect button if not connected */}
                {!connectionStatus?.connected && (
                  <button
                    type="button"
                    onClick={connectEbay}
                    disabled={connecting}
                    className="bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
                  >
                    {connecting ? 'Connecting...' : 'Connect eBay Account'}
                  </button>
                )}

                {/* Show Test/Disconnect buttons if connected */}
                {connectionStatus?.connected && (
                  <>
                    <button
                      type="button"
                      onClick={testConnection}
                      className="bg-accent text-white px-6 py-2 rounded-lg hover:bg-accent-hover transition-colors"
                    >
                      Test Connection
                    </button>
                    <button
                      type="button"
                      onClick={disconnectEbay}
                      disabled={disconnecting}
                      className="bg-red-600 text-white px-6 py-2 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
                    >
                      {disconnecting ? 'Disconnecting...' : 'Disconnect'}
                    </button>
                  </>
                )}
              </div>

              {/* Only show sync settings if connected */}
              {connectionStatus?.connected && (
                <div className="border-t pt-6">
                  <h3 className="text-lg font-medium text-theme-primary mb-4">
                    Sync Settings
                  </h3>

                  <div className="space-y-4">
                    <div className="form-group">
                      <label className="form-label">Auto-sync Interval (hours)</label>
                      <select {...register('syncInterval')} className="form-input">
                        <option value="1">Every hour</option>
                        <option value="6">Every 6 hours</option>
                        <option value="12">Every 12 hours</option>
                        <option value="24">Daily</option>
                      </select>
                      <p className="text-xs text-theme-tertiary mt-1">
                        How often to automatically sync your eBay listings
                      </p>
                    </div>

                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        id="autoImportNewListings"
                        defaultChecked
                        {...register('autoImportNewListings')}
                        className="h-4 w-4 text-ebay-blue focus:ring-ebay-blue border-theme rounded"
                      />
                      <label htmlFor="autoImportNewListings" className="ml-2 text-sm text-theme-secondary">
                        Automatically import new eBay listings
                      </label>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Social Accounts */}
          {activeTab === 'social-accounts' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-medium text-theme-primary mb-4">
                  Connect Social Media Accounts
                </h3>
                <p className="text-sm text-theme-secondary">
                  Connect your Instagram and YouTube accounts to automatically post your product videos.
                </p>
              </div>

              {/* Loading State */}
              {loadingSocialAccounts && (
                <div className="bg-theme-primary border border-theme rounded-lg p-4">
                  <div className="animate-pulse flex space-x-4">
                    <div className="h-4 bg-gray-300 rounded w-1/4"></div>
                  </div>
                </div>
              )}

              {/* Platform Cards */}
              {!loadingSocialAccounts && (
                <div className="space-y-4">
                  {/* Instagram */}
                  {(() => {
                    const instagramAccount = socialAccounts.find(acc => acc.platform === 'instagram')
                    const isConnected = !!instagramAccount
                    const isConnecting = connectingPlatform === 'instagram'
                    const isDisconnecting = disconnectingAccountId === instagramAccount?.id

                    return (
                      <div className={`border rounded-lg p-6 ${
                        isConnected
                          ? 'bg-pink-50 dark:bg-pink-900/10 border-pink-200 dark:border-pink-800'
                          : 'bg-theme-primary border-theme'
                      }`}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                              isConnected ? 'bg-pink-100 dark:bg-pink-900/30' : 'bg-theme-surface'
                            }`}>
                              <svg className="w-6 h-6 text-pink-600" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                              </svg>
                            </div>
                            <div>
                              <h4 className="font-medium text-theme-primary">Instagram</h4>
                              {isConnected && instagramAccount.username && (
                                <p className="text-sm text-theme-secondary mt-1">
                                  Connected as: <span className="font-medium">{instagramAccount.username}</span>
                                </p>
                              )}
                              {isConnected && instagramAccount.tokenExpiresAt && (
                                <p className="text-xs text-theme-tertiary mt-1">
                                  Token expires: {new Date(instagramAccount.tokenExpiresAt).toLocaleDateString()}
                                </p>
                              )}
                              {!isConnected && (
                                <p className="text-sm text-theme-tertiary mt-1">
                                  Not connected
                                </p>
                              )}
                            </div>
                          </div>
                          <div>
                            {!isConnected && (
                              <button
                                type="button"
                                onClick={() => connectSocialAccount('instagram')}
                                disabled={isConnecting}
                                className="bg-pink-600 text-white px-4 py-2 rounded-lg hover:bg-pink-700 transition-colors disabled:opacity-50"
                              >
                                {isConnecting ? 'Connecting...' : 'Connect'}
                              </button>
                            )}
                            {isConnected && (
                              <button
                                type="button"
                                onClick={() => disconnectSocialAccount(instagramAccount.id, 'Instagram')}
                                disabled={isDisconnecting}
                                className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
                              >
                                {isDisconnecting ? 'Disconnecting...' : 'Disconnect'}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })()}

                  {/* YouTube */}
                  {(() => {
                    const youtubeAccount = socialAccounts.find(acc => acc.platform === 'youtube')
                    const isConnected = !!youtubeAccount
                    const isConnecting = connectingPlatform === 'youtube'
                    const isDisconnecting = disconnectingAccountId === youtubeAccount?.id

                    return (
                      <div className={`border rounded-lg p-6 ${
                        isConnected
                          ? 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800'
                          : 'bg-theme-primary border-theme'
                      }`}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                              isConnected ? 'bg-red-100 dark:bg-red-900/30' : 'bg-theme-surface'
                            }`}>
                              <svg className="w-6 h-6 text-red-600" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                              </svg>
                            </div>
                            <div>
                              <h4 className="font-medium text-theme-primary">YouTube</h4>
                              {isConnected && youtubeAccount.username && (
                                <p className="text-sm text-theme-secondary mt-1">
                                  Connected as: <span className="font-medium">{youtubeAccount.username}</span>
                                </p>
                              )}
                              {isConnected && youtubeAccount.tokenExpiresAt && (
                                <p className="text-xs text-theme-tertiary mt-1">
                                  Token expires: {new Date(youtubeAccount.tokenExpiresAt).toLocaleDateString()}
                                </p>
                              )}
                              {!isConnected && (
                                <p className="text-sm text-theme-tertiary mt-1">
                                  Not connected
                                </p>
                              )}
                            </div>
                          </div>
                          <div>
                            {!isConnected && (
                              <button
                                type="button"
                                onClick={() => connectSocialAccount('youtube')}
                                disabled={isConnecting}
                                className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
                              >
                                {isConnecting ? 'Connecting...' : 'Connect'}
                              </button>
                            )}
                            {isConnected && (
                              <button
                                type="button"
                                onClick={() => disconnectSocialAccount(youtubeAccount.id, 'YouTube')}
                                disabled={isDisconnecting}
                                className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
                              >
                                {isDisconnecting ? 'Disconnecting...' : 'Disconnect'}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })()}
                </div>
              )}

              {/* Info box */}
              <div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <h4 className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-2">
                  About Social Media Posting
                </h4>
                <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
                  <li>• Connect your accounts to automatically post product videos</li>
                  <li>• Instagram: Posts as Reels (3-90 seconds, vertical format)</li>
                  <li>• YouTube: Posts as Shorts (up to 60 seconds, vertical format)</li>
                  <li>• You can schedule posts or publish immediately</li>
                </ul>
              </div>
            </div>
          )}

          {/* Notifications */}
          {activeTab === 'notifications' && (
            <form onSubmit={handleSubmit(onSaveNotifications)} className="space-y-6">
              <div>
                <h3 className="text-lg font-medium text-theme-primary mb-4">
                  Email Notifications
                </h3>

                <div className="space-y-4">
                  <div className="form-group">
                    <label className="form-label">Email Address</label>
                    <input
                      type="email"
                      placeholder="your@email.com"
                      {...register('notificationEmail')}
                      className="form-input"
                    />
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        id="priceReductionAlerts"
                        defaultChecked
                        {...register('priceReductionAlerts')}
                        className="h-4 w-4 text-ebay-blue focus:ring-ebay-blue border-theme rounded"
                      />
                      <label htmlFor="priceReductionAlerts" className="ml-2 text-sm text-theme-secondary">
                        Notify when prices are reduced
                      </label>
                    </div>

                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        id="errorAlerts"
                        defaultChecked
                        {...register('errorAlerts')}
                        className="h-4 w-4 text-ebay-blue focus:ring-ebay-blue border-theme rounded"
                      />
                      <label htmlFor="errorAlerts" className="ml-2 text-sm text-theme-secondary">
                        Notify when errors occur
                      </label>
                    </div>

                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        id="weeklyReports"
                        {...register('weeklyReports')}
                        className="h-4 w-4 text-ebay-blue focus:ring-ebay-blue border-theme rounded"
                      />
                      <label htmlFor="weeklyReports" className="ml-2 text-sm text-theme-secondary">
                        Send weekly activity reports
                      </label>
                    </div>

                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        id="marketInsights"
                        {...register('marketInsights')}
                        className="h-4 w-4 text-ebay-blue focus:ring-ebay-blue border-theme rounded"
                      />
                      <label htmlFor="marketInsights" className="ml-2 text-sm text-theme-secondary">
                        Send market analysis insights
                      </label>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-medium text-theme-primary mb-4">
                  Alert Thresholds
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="form-group">
                    <label className="form-label">Alert when price drops below (%)</label>
                    <input
                      type="number"
                      min="10"
                      max="90"
                      defaultValue="80"
                      {...register('priceDropThreshold')}
                      className="form-input"
                    />
                    <p className="text-xs text-theme-tertiary mt-1">
                      Get notified when a listing's price drops below this percentage of its original price
                    </p>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Alert when near minimum price (%)</label>
                    <input
                      type="number"
                      min="90"
                      max="100"
                      defaultValue="95"
                      {...register('nearMinimumThreshold')}
                      className="form-input"
                    />
                    <p className="text-xs text-theme-tertiary mt-1">
                      Get notified when a listing is close to its minimum price
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex justify-end">
                <button type="submit" className="btn-primary">
                  Save Notification Settings
                </button>
              </div>
            </form>
          )}

          {/* AI Matching */}
          {activeTab === 'ai-matching' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-medium text-theme-primary mb-4">
                  AI Product Matching
                </h3>
                <p className="text-sm text-theme-tertiary mb-6">
                  Train the AI to match products based on your preferences. Accept or decline suggested matches in Influencer Central to teach the AI what you're looking for.
                </p>
              </div>

              {loadingAiSettings ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-ebay-blue"></div>
                </div>
              ) : (
                <>
                  {/* Feedback Stats */}
                  {feedbackStats && (
                    <div className="bg-theme-primary rounded-lg p-4 mb-6">
                      <h4 className="text-sm font-medium text-theme-primary mb-3">Your Training Data</h4>
                      <div className="grid grid-cols-3 gap-4">
                        <div className="text-center">
                          <div className="text-2xl font-bold text-theme-primary">{feedbackStats.total || 0}</div>
                          <div className="text-xs text-theme-tertiary">Total Decisions</div>
                        </div>
                        <div className="text-center">
                          <div className="text-2xl font-bold text-success">{feedbackStats.accepted || 0}</div>
                          <div className="text-xs text-theme-tertiary">Accepted</div>
                        </div>
                        <div className="text-center">
                          <div className="text-2xl font-bold text-error">{feedbackStats.declined || 0}</div>
                          <div className="text-xs text-theme-tertiary">Declined</div>
                        </div>
                      </div>
                      {feedbackStats.total < 5 && (
                        <p className="text-xs text-accent mt-3 text-center">
                          Need at least 5 decisions to generate custom matching criteria
                        </p>
                      )}
                    </div>
                  )}

                  {/* Custom Matching Toggle */}
                  <div className="flex items-center justify-between p-4 bg-theme-primary rounded-lg">
                    <div>
                      <h4 className="text-sm font-medium text-theme-primary">Custom Matching Based on My Preferences</h4>
                      <p className="text-xs text-theme-tertiary mt-1">
                        Use AI-generated criteria based on your accept/decline history
                      </p>
                    </div>
                    <button
                      onClick={toggleCustomMatching}
                      className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        customMatchingEnabled ? 'bg-ebay-blue' : 'bg-gray-200 dark:bg-gray-700'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                          customMatchingEnabled ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>

                  {/* Generate Custom Prompt Button */}
                  <div className="mt-6">
                    <button
                      onClick={generateCustomPrompt}
                      disabled={generatingPrompt || (feedbackStats?.total || 0) < 5}
                      className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {generatingPrompt ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                          Analyzing your preferences...
                        </>
                      ) : (
                        <>
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                          </svg>
                          Generate Custom Matching Criteria
                        </>
                      )}
                    </button>
                    <p className="text-xs text-theme-tertiary mt-2 text-center">
                      The AI will analyze your accept/decline history and create personalized matching rules
                    </p>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Thumbnail Templates */}
          {activeTab === 'thumbnail-templates' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-medium text-theme-primary mb-2">
                    Thumbnail Templates
                  </h3>
                  <p className="text-sm text-theme-tertiary">
                    Upload custom templates and define where product images should be placed. 
                    Each owner can have one template for auto-generating thumbnails.
                  </p>
                </div>
                <button
                  onClick={() => {
                    setEditingTemplate(null)
                    setShowTemplateModal(true)
                  }}
                  className="btn-primary flex items-center gap-2"
                >
                  <Plus size={18} />
                  Add Template
                </button>
              </div>

              {loadingTemplates ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-ebay-blue"></div>
                </div>
              ) : templates.length === 0 ? (
                <div className="text-center py-12 bg-theme-primary rounded-lg border-2 border-dashed border-theme">
                  <div className="flex flex-col items-center justify-center space-y-3">
                    <div className="p-4 bg-theme-surface rounded-full">
                      <svg className="w-12 h-12 text-theme-tertiary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-theme-primary font-medium">No templates yet</p>
                      <p className="text-sm text-theme-tertiary mt-1">
                        Click "Add Template" to create your first thumbnail template
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {templates.map((template) => (
                    <div
                      key={template.id}
                      className="bg-theme-primary rounded-lg border border-theme overflow-hidden hover:border-accent/50 transition-colors"
                    >
                      {/* Template Preview */}
                      <div className="relative aspect-video bg-theme-surface">
                        {template.template_url ? (
                          <img
                            src={template.template_url}
                            alt={`${template.owner_name} template`}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <svg className="w-12 h-12 text-theme-tertiary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                          </div>
                        )}
                      </div>

                      {/* Template Info */}
                      <div className="p-4">
                        <h4 className="font-medium text-theme-primary mb-2">
                          {template.owner_name}
                        </h4>
                        {template.placement_zone && (
                          <div className="text-xs text-theme-tertiary mb-3">
                            Zone: {template.placement_zone.x}%, {template.placement_zone.y}% 
                            ({template.placement_zone.width}×{template.placement_zone.height}%)
                          </div>
                        )}

                        {/* Actions */}
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleEditTemplate(template)}
                            className="btn-secondary flex-1 flex items-center justify-center gap-2 text-sm py-2"
                          >
                            <Edit size={14} />
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeleteTemplate(template.id)}
                            disabled={deletingTemplateId === template.id}
                            className="btn-secondary flex-1 flex items-center justify-center gap-2 text-sm py-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                          >
                            {deletingTemplateId === template.id ? (
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-red-600"></div>
                            ) : (
                              <>
                                <Trash2 size={14} />
                                Delete
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Template Modal */}
      {showTemplateModal && (
        <ThumbnailTemplateModal
          existingTemplate={editingTemplate}
          onClose={() => {
            setShowTemplateModal(false)
            setEditingTemplate(null)
          }}
          onSave={handleSaveTemplate}
        />
      )}
    </div>
  )
}
import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'react-toastify'
import { userAPI } from '../lib/supabase'
import { OneDriveConnection } from '../components/onedrive'

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
    if (activeTab === 'ai-matching') {
      fetchAiSettings()
    }
  }, [activeTab])

  const tabs = [
    { id: 'general', name: 'General' },
    { id: 'ebay', name: 'eBay Integration' },
    { id: 'onedrive', name: 'OneDrive' },
    { id: 'notifications', name: 'Notifications' },
    { id: 'ai-matching', name: 'AI Matching' },
  ]
  
  // AI Matching state
  const [customMatchingEnabled, setCustomMatchingEnabled] = useState(false)
  const [generatingPrompt, setGeneratingPrompt] = useState(false)
  const [feedbackStats, setFeedbackStats] = useState(null)
  const [loadingAiSettings, setLoadingAiSettings] = useState(false)
  
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

          {/* OneDrive Integration */}
          {activeTab === 'onedrive' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-medium text-theme-primary mb-4">
                  OneDrive Video Storage
                </h3>
                <p className="text-sm text-theme-secondary mb-6">
                  Connect your OneDrive account to store product videos. Videos are uploaded directly to your OneDrive folder and linked to products in your CRM.
                </p>
              </div>
              
              <OneDriveConnection />
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
        </div>
      </div>
    </div>
  )
}
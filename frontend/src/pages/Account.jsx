import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { userAPI, authAPI } from '../lib/supabase'

export default function Account() {
  const [searchParams] = useSearchParams()
  const [activeTab, setActiveTab] = useState('profile')
  const [isEditing, setIsEditing] = useState(false)
  const [profileData, setProfileData] = useState({})
  const [isEditingPreferences, setIsEditingPreferences] = useState(false)
  const [preferencesData, setPreferencesData] = useState({})
  const [ebayCredentials, setEbayCredentials] = useState({
    app_id: '',
    dev_id: '',
    cert_id: '',
    refresh_token: ''
  })
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  })
  const queryClient = useQueryClient()

  const { data: profile, isLoading } = useQuery(
    ['profile'],
    () => userAPI.getProfile(),
    {
      refetchOnWindowFocus: false
    }
  )

  // Initialize form states when profile data loads
  useEffect(() => {
    if (profile && !isEditing) {
      setProfileData({
        name: profile.name || '',
        default_reduction_strategy: profile.default_reduction_strategy || 'fixed_percentage',
        default_reduction_percentage: profile.default_reduction_percentage || 5,
        default_reduction_interval: profile.default_reduction_interval || 7
      })
    }
  }, [profile, isEditing])

  useEffect(() => {
    if (profile && !isEditingPreferences) {
      setPreferencesData({
        email_notifications: profile.email_notifications ?? true,
        price_reduction_alerts: profile.price_reduction_alerts ?? true
      })
    }
  }, [profile, isEditingPreferences])

  // Handle tab query parameter
  useEffect(() => {
    const tab = searchParams.get('tab')
    if (tab && ['profile', 'preferences', 'security', 'billing', 'integrations'].includes(tab)) {
      setActiveTab(tab)
    }
  }, [searchParams])

  const updateProfileMutation = useMutation(
    (updates) => userAPI.updateProfile(updates),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['profile'])
        setIsEditing(false)
        alert('Profile updated successfully!')
      },
      onError: (error) => {
        alert('Failed to update profile: ' + error.message)
      }
    }
  )

  const updatePreferencesMutation = useMutation(
    (updates) => userAPI.updateProfile(updates),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['profile'])
        setIsEditingPreferences(false)
        alert('Preferences updated successfully!')
      },
      onError: (error) => {
        alert('Failed to update preferences: ' + error.message)
      }
    }
  )

  const saveEbayCredentialsMutation = useMutation(
    (credentials) => userAPI.updateProfile({
      ebay_user_token: credentials.refresh_token,
      ebay_credentials_valid: true // Will be validated by backend
    }),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['profile'])
        alert('eBay credentials saved successfully!')
        setEbayCredentials({
          app_id: '',
          dev_id: '',
          cert_id: '',
          refresh_token: ''
        })
      },
      onError: (error) => {
        alert('Failed to save eBay credentials: ' + error.message)
      }
    }
  )

  const handleProfileSave = () => {
    updateProfileMutation.mutate(profileData)
  }

  const handlePreferencesSave = () => {
    updatePreferencesMutation.mutate(preferencesData)
  }

  const handleSaveEbayCredentials = () => {
    if (!ebayCredentials.refresh_token) {
      alert('Please enter a refresh token')
      return
    }
    saveEbayCredentialsMutation.mutate(ebayCredentials)
  }

  const handleTestEbayConnection = async () => {
    if (!profile?.ebay_user_token) {
      alert('Please save eBay credentials first')
      return
    }
    // For now, just show a success message. In real implementation,
    // this would test the actual eBay API connection
    alert('eBay connection test would be performed here')
  }

  const handlePasswordChange = async () => {
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      alert('New passwords do not match')
      return
    }

    if (passwordData.newPassword.length < 6) {
      alert('Password must be at least 6 characters long')
      return
    }

    try {
      const { error } = await authAPI.updatePassword(passwordData.newPassword)

      if (error) {
        throw error
      }

      alert('Password updated successfully!')
      setPasswordData({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      })
    } catch (error) {
      alert('Failed to update password: ' + error.message)
    }
  }

  const handleDeleteAccount = async () => {
    if (window.confirm('Are you sure you want to delete your account? This action cannot be undone.')) {
      if (window.confirm('This will permanently delete all your listings and data. Are you absolutely sure?')) {
        alert('Account deletion would be processed. In demo mode, this is simulated.')
      }
    }
  }

  const handleExportData = () => {
    // Simulate data export
    const exportData = {
      profile: profile,
      exportDate: new Date().toISOString(),
      listings: 3, // From our mock data
      priceHistory: 'Available'
    }

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'ebay-price-reducer-data.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  if (isLoading) {
    return <div className="text-center py-8">Loading...</div>
  }

  const tabs = [
    { id: 'profile', name: 'Profile', icon: '👤' },
    { id: 'preferences', name: 'Preferences', icon: '⚙️' },
    { id: 'security', name: 'Security', icon: '🔒' },
    { id: 'billing', name: 'Billing', icon: '💳' },
    { id: 'integrations', name: 'Integrations', icon: '🔗' }
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Account Settings</h1>
        <p className="text-gray-600 mt-2">Manage your account settings and preferences</p>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        {/* Mobile Tab Selector */}
        <div className="sm:hidden">
          <select
            value={activeTab}
            onChange={(e) => setActiveTab(e.target.value)}
            className="w-full px-4 py-3 text-base border-b border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {tabs.map((tab) => (
              <option key={tab.id} value={tab.id}>
                {tab.icon} {tab.name}
              </option>
            ))}
          </select>
        </div>

        {/* Desktop Tab Navigation */}
        <div className="hidden sm:block border-b border-gray-200">
          <nav className="flex flex-wrap" aria-label="Tabs">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600 bg-blue-50'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                } whitespace-nowrap py-4 px-4 sm:px-6 border-b-2 font-medium text-sm flex items-center space-x-2 transition-colors`}
              >
                <span className="text-lg">{tab.icon}</span>
                <span className="hidden md:inline">{tab.name}</span>
              </button>
            ))}
          </nav>
        </div>

        {/* Tab Content */}
        <div className="p-4 sm:p-6">
          {activeTab === 'profile' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-medium text-gray-900">Profile Information</h3>
                <p className="text-sm text-gray-600">Update your account profile information.</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                  {isEditing ? (
                    <input
                      type="text"
                      value={profileData.name || profile?.name || ''}
                      onChange={(e) => setProfileData(prev => ({ ...prev, name: e.target.value }))}
                      className="w-full border border-gray-300 rounded-md px-3 py-2"
                    />
                  ) : (
                    <div className="text-gray-900">{profile?.name || 'Not set'}</div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <div className="text-gray-900">{profile?.email || 'Not available'}</div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Default Reduction Strategy</label>
                  {isEditing ? (
                    <select
                      value={profileData.default_reduction_strategy || profile?.default_reduction_strategy || ''}
                      onChange={(e) => setProfileData(prev => ({ ...prev, default_reduction_strategy: e.target.value }))}
                      className="w-full border border-gray-300 rounded-md px-3 py-2"
                    >
                      <option value="fixed_percentage">Fixed Percentage</option>
                      <option value="market_based">Market Based</option>
                      <option value="time_based">Time Based</option>
                    </select>
                  ) : (
                    <div className="text-gray-900 capitalize">
                      {profile?.default_reduction_strategy?.replace('_', ' ') || 'Fixed Percentage'}
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Default Reduction Percentage</label>
                  {isEditing ? (
                    <input
                      type="number"
                      min="1"
                      max="50"
                      value={profileData.default_reduction_percentage || profile?.default_reduction_percentage || ''}
                      onChange={(e) => setProfileData(prev => ({ ...prev, default_reduction_percentage: parseInt(e.target.value) }))}
                      className="w-full border border-gray-300 rounded-md px-3 py-2"
                    />
                  ) : (
                    <div className="text-gray-900">{profile?.default_reduction_percentage || 5}%</div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Default Reduction Interval (Days)</label>
                  {isEditing ? (
                    <input
                      type="number"
                      min="1"
                      max="30"
                      value={profileData.default_reduction_interval || profile?.default_reduction_interval || ''}
                      onChange={(e) => setProfileData(prev => ({ ...prev, default_reduction_interval: parseInt(e.target.value) }))}
                      className="w-full border border-gray-300 rounded-md px-3 py-2"
                    />
                  ) : (
                    <div className="text-gray-900">{profile?.default_reduction_interval || 7} days</div>
                  )}
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                {isEditing ? (
                  <>
                    <button
                      onClick={handleProfileSave}
                      disabled={updateProfileMutation.isLoading}
                      className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
                    >
                      Save Changes
                    </button>
                    <button
                      onClick={() => setIsEditing(false)}
                      className="bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => setIsEditing(true)}
                    className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
                  >
                    Edit Profile
                  </button>
                )}
              </div>
            </div>
          )}

          {activeTab === 'preferences' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-medium text-gray-900">Preferences</h3>
                <p className="text-sm text-gray-600">Customize your application preferences.</p>
              </div>

              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-2 border-b sm:border-0">
                  <div>
                    <label className="text-sm font-medium text-gray-900">Email Notifications</label>
                    <p className="text-sm text-gray-600">Receive general email notifications</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={isEditingPreferences ? (preferencesData.email_notifications ?? profile?.email_notifications ?? true) : (profile?.email_notifications ?? true)}
                    onChange={(e) => {
                      if (isEditingPreferences) {
                        setPreferencesData(prev => ({ ...prev, email_notifications: e.target.checked }))
                      }
                    }}
                    disabled={!isEditingPreferences}
                    className="h-4 w-4 text-blue-600"
                  />
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-2 border-b sm:border-0">
                  <div>
                    <label className="text-sm font-medium text-gray-900">Price Reduction Alerts</label>
                    <p className="text-sm text-gray-600">Receive alerts when prices are automatically reduced</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={isEditingPreferences ? (preferencesData.price_reduction_alerts ?? profile?.price_reduction_alerts ?? true) : (profile?.price_reduction_alerts ?? true)}
                    onChange={(e) => {
                      if (isEditingPreferences) {
                        setPreferencesData(prev => ({ ...prev, price_reduction_alerts: e.target.checked }))
                      }
                    }}
                    disabled={!isEditingPreferences}
                    className="h-4 w-4 text-blue-600"
                  />
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                {isEditingPreferences ? (
                  <>
                    <button
                      onClick={handlePreferencesSave}
                      disabled={updatePreferencesMutation.isLoading}
                      className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
                    >
                      Save Changes
                    </button>
                    <button
                      onClick={() => setIsEditingPreferences(false)}
                      className="bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => setIsEditingPreferences(true)}
                    className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
                  >
                    Edit Preferences
                  </button>
                )}
              </div>
            </div>
          )}

          {activeTab === 'security' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-medium text-gray-900">Security Settings</h3>
                <p className="text-sm text-gray-600">Manage your account security and password.</p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Current Password</label>
                  <input
                    type="password"
                    value={passwordData.currentPassword}
                    onChange={(e) => setPasswordData(prev => ({ ...prev, currentPassword: e.target.value }))}
                    className="w-full border border-gray-300 rounded-md px-3 py-2"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
                  <input
                    type="password"
                    value={passwordData.newPassword}
                    onChange={(e) => setPasswordData(prev => ({ ...prev, newPassword: e.target.value }))}
                    className="w-full border border-gray-300 rounded-md px-3 py-2"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Confirm New Password</label>
                  <input
                    type="password"
                    value={passwordData.confirmPassword}
                    onChange={(e) => setPasswordData(prev => ({ ...prev, confirmPassword: e.target.value }))}
                    className="w-full border border-gray-300 rounded-md px-3 py-2"
                  />
                </div>

                <button
                  onClick={handlePasswordChange}
                  className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
                >
                  Update Password
                </button>
              </div>
            </div>
          )}

          {activeTab === 'billing' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-medium text-gray-900">Billing & Subscription</h3>
                <p className="text-sm text-gray-600">Manage your subscription and billing information.</p>
              </div>

              <div className="bg-green-50 border border-green-200 rounded-md p-4">
                <div className="flex">
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-green-800">
                      {profile?.subscription_plan ? profile.subscription_plan.charAt(0).toUpperCase() + profile.subscription_plan.slice(1) : 'Free'} Plan
                    </h3>
                    <div className="mt-2 text-sm text-green-700">
                      <p>You're currently on the {profile?.subscription_plan || 'free'} plan with up to {profile?.listing_limit || 10} listings.</p>
                      {profile?.subscription_active === false && (
                        <p className="text-red-600 mt-1">⚠️ Subscription inactive</p>
                      )}
                      {profile?.subscription_expires_at && (
                        <p className="mt-1">Expires: {new Date(profile.subscription_expires_at).toLocaleDateString()}</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="border border-gray-200 rounded-lg p-4">
                  <h4 className="font-medium text-gray-900">Starter</h4>
                  <div className="text-2xl font-bold text-gray-900 mt-2">$9/mo</div>
                  <ul className="text-sm text-gray-600 mt-4 space-y-2">
                    <li>• Up to 50 listings</li>
                    <li>• Basic strategies</li>
                    <li>• Email support</li>
                  </ul>
                </div>

                <div className="border border-blue-500 rounded-lg p-4 relative">
                  <div className="absolute -top-2 left-1/2 transform -translate-x-1/2">
                    <span className="bg-blue-500 text-white px-2 py-1 text-xs rounded">Popular</span>
                  </div>
                  <h4 className="font-medium text-gray-900">Professional</h4>
                  <div className="text-2xl font-bold text-gray-900 mt-2">$29/mo</div>
                  <ul className="text-sm text-gray-600 mt-4 space-y-2">
                    <li>• Up to 500 listings</li>
                    <li>• Advanced strategies</li>
                    <li>• Market analysis</li>
                    <li>• Priority support</li>
                  </ul>
                </div>

                <div className="border border-gray-200 rounded-lg p-4">
                  <h4 className="font-medium text-gray-900">Enterprise</h4>
                  <div className="text-2xl font-bold text-gray-900 mt-2">$99/mo</div>
                  <ul className="text-sm text-gray-600 mt-4 space-y-2">
                    <li>• Unlimited listings</li>
                    <li>• Custom strategies</li>
                    <li>• API access</li>
                    <li>• Dedicated support</li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'integrations' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-medium text-gray-900">eBay Developer Integration</h3>
                <p className="text-sm text-gray-600">Set up eBay API access to enable automatic price updates for your listings.</p>
              </div>

              {/* eBay Developer Setup Section */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
                <div className="flex items-start space-x-3">
                  <div className="w-10 h-10 bg-blue-600 rounded flex items-center justify-center text-white font-bold text-sm">
                    eB
                  </div>
                  <div className="flex-1">
                    <h4 className="font-medium text-gray-900 text-lg">eBay API Developer Setup</h4>
                    <p className="text-sm text-gray-600 mt-1">
                      To enable automatic price updates, you need to create an eBay developer application and configure API credentials.
                    </p>
                  </div>
                </div>
              </div>

              {/* Step 1: Create Developer Account */}
              <div className="bg-white border border-gray-200 rounded-lg p-4 sm:p-6">
                <h5 className="font-medium text-gray-900 text-base mb-3">Step 1: Create eBay Developer Account</h5>
                <div className="space-y-3 text-sm text-gray-700">
                  <p>1. Visit the <a href="https://developer.ebay.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">eBay Developers Program</a></p>
                  <p>2. Click "Join the Developer Program" and sign in with your eBay account</p>
                  <p>3. Accept the developer agreement and complete the registration process</p>
                  <p>4. Verify your email address when prompted</p>
                </div>
              </div>

              {/* Step 2: Create Application */}
              <div className="bg-white border border-gray-200 rounded-lg p-4 sm:p-6">
                <h5 className="font-medium text-gray-900 text-base mb-3">Step 2: Create Your Application</h5>
                <div className="space-y-3 text-sm text-gray-700">
                  <p>1. Go to "My Account" → "Application Keys" in the developer portal</p>
                  <p>2. Click "Create a Keyset" for production use</p>
                  <p>3. Fill out the application form:</p>
                  <div className="ml-4 space-y-1">
                    <p>• <strong>Application Name:</strong> "eBay Price Reducer App"</p>
                    <p>• <strong>Application Type:</strong> "Personal Use" or "Commercial"</p>
                    <p>• <strong>Platform:</strong> "Web Application"</p>
                    <p>• <strong>Application URL:</strong> Your app's URL (if hosted) or "localhost" for development</p>
                  </div>
                  <p>4. Submit the application for review (may take 1-3 business days)</p>
                </div>
              </div>

              {/* Step 3: API Credentials */}
              <div className="bg-white border border-gray-200 rounded-lg p-4 sm:p-6">
                <h5 className="font-medium text-gray-900 text-base mb-3">Step 3: Obtain API Credentials</h5>
                <div className="space-y-3 text-sm text-gray-700">
                  <p>Once approved, you'll receive these credentials:</p>
                  <div className="bg-gray-50 p-4 rounded border space-y-2">
                    <p><strong>App ID (Client ID):</strong> Your unique application identifier</p>
                    <p><strong>Dev ID:</strong> Your developer identifier</p>
                    <p><strong>Cert ID (Client Secret):</strong> Your application secret</p>
                  </div>
                  <div className="bg-yellow-50 border border-yellow-200 rounded p-3">
                    <p className="text-yellow-800 text-sm">
                      <strong>⚠️ Important:</strong> Keep these credentials secure and never share them publicly.
                    </p>
                  </div>
                </div>
              </div>

              {/* Step 4: OAuth Setup */}
              <div className="bg-white border border-gray-200 rounded-lg p-4 sm:p-6">
                <h5 className="font-medium text-gray-900 text-base mb-3">Step 4: Set Up OAuth 2.0 for Refresh Tokens</h5>
                <div className="space-y-3 text-sm text-gray-700">
                  <p><strong>Why OAuth 2.0?</strong> Refresh tokens allow continuous API access without requiring users to re-authenticate frequently.</p>

                  <div className="space-y-2">
                    <p><strong>Configure OAuth Settings:</strong></p>
                    <div className="ml-4 space-y-1">
                      <p>• <strong>Grant Types:</strong> Select "Authorization Code"</p>
                      <p>• <strong>Redirect URI:</strong> <code className="bg-gray-100 px-2 py-1 rounded text-xs">https://yourapp.com/auth/ebay/callback</code></p>
                      <p>• <strong>Scopes Required:</strong></p>
                      <div className="ml-4 space-y-1 text-xs">
                        <p>- <code className="bg-gray-100 px-1 rounded">https://api.ebay.com/oauth/api_scope/sell.inventory</code></p>
                        <p>- <code className="bg-gray-100 px-1 rounded">https://api.ebay.com/oauth/api_scope/sell.marketing</code></p>
                        <p>- <code className="bg-gray-100 px-1 rounded">https://api.ebay.com/oauth/api_scope/sell.account</code></p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Step 5: Generate Refresh Token */}
              <div className="bg-white border border-gray-200 rounded-lg p-4 sm:p-6">
                <h5 className="font-medium text-gray-900 text-base mb-3">Step 5: Generate User Refresh Token</h5>
                <div className="space-y-3 text-sm text-gray-700">
                  <p>To get a refresh token that doesn't expire:</p>
                  <div className="space-y-2">
                    <p>1. <strong>Authorization URL:</strong> Direct users to eBay's OAuth consent page</p>
                    <div className="bg-gray-50 p-3 rounded border overflow-x-auto">
                      <code className="text-xs block whitespace-pre-wrap break-all">
                        https://auth.ebay.com/oauth2/authorize?client_id=YOUR_APP_ID&response_type=code&redirect_uri=YOUR_REDIRECT_URI&scope=https://api.ebay.com/oauth/api_scope/sell.inventory%20https://api.ebay.com/oauth/api_scope/sell.marketing
                      </code>
                    </div>
                    <p>2. <strong>Exchange Authorization Code:</strong> After user consent, exchange the authorization code for access and refresh tokens</p>
                    <p>3. <strong>Store Refresh Token:</strong> Save the refresh token securely - it's valid for 18 months and can be renewed</p>
                  </div>
                </div>
              </div>

              {/* Step 6: Enter Credentials */}
              <div className="bg-white border border-gray-200 rounded-lg p-4 sm:p-6"}
                <h5 className="font-medium text-gray-900 text-base mb-4">Step 6: Enter Your API Credentials</h5>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">App ID (Client ID)</label>
                    <input
                      type="text"
                      placeholder="Enter your eBay App ID"
                      value={ebayCredentials.app_id}
                      onChange={(e) => setEbayCredentials(prev => ({ ...prev, app_id: e.target.value }))}
                      className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Dev ID</label>
                    <input
                      type="text"
                      placeholder="Enter your eBay Dev ID"
                      value={ebayCredentials.dev_id}
                      onChange={(e) => setEbayCredentials(prev => ({ ...prev, dev_id: e.target.value }))}
                      className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Cert ID (Client Secret)</label>
                    <input
                      type="password"
                      placeholder="Enter your eBay Cert ID"
                      value={ebayCredentials.cert_id}
                      onChange={(e) => setEbayCredentials(prev => ({ ...prev, cert_id: e.target.value }))}
                      className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Refresh Token</label>
                    <input
                      type="password"
                      placeholder="Enter your eBay Refresh Token"
                      value={ebayCredentials.refresh_token}
                      onChange={(e) => setEbayCredentials(prev => ({ ...prev, refresh_token: e.target.value }))}
                      className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                    />
                  </div>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <button
                      onClick={handleSaveEbayCredentials}
                      disabled={saveEbayCredentialsMutation.isLoading}
                      className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700 disabled:opacity-50"
                    >
                      Save Credentials
                    </button>
                    <button
                      onClick={handleTestEbayConnection}
                      className="bg-green-600 text-white px-4 py-2 rounded text-sm hover:bg-green-700"
                    >
                      Test Connection
                    </button>
                  </div>
                </div>
              </div>

              {/* Connection Status */}
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className={`w-3 h-3 rounded-full ${profile?.ebay_credentials_valid ? 'bg-green-500' : 'bg-red-500'}`}></div>
                    <span className="text-sm font-medium text-gray-900">
                      eBay API Status: {profile?.ebay_credentials_valid ? 'Connected' : 'Not Connected'}
                    </span>
                  </div>
                  <span className="text-xs text-gray-500">
                    {profile?.ebay_user_token ? 'Token saved' : 'No token'}
                  </span>
                </div>
                {profile?.ebay_user_id && (
                  <div className="mt-2 text-xs text-gray-600">
                    eBay User ID: {profile.ebay_user_id}
                  </div>
                )}
                {profile?.ebay_token_expires_at && (
                  <div className="mt-1 text-xs text-gray-600">
                    Token expires: {new Date(profile.ebay_token_expires_at).toLocaleDateString()}
                  </div>
                )}
              </div>

              {/* Additional Resources */}
              <div className="bg-white border border-gray-200 rounded-lg p-4 sm:p-6">
                <h5 className="font-medium text-gray-900 text-base mb-3">Additional Resources</h5>
                <div className="space-y-2 text-sm">
                  <p>• <a href="https://developer.ebay.com/api-docs/static/oauth-tokens.html" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">eBay OAuth 2.0 Documentation</a></p>
                  <p>• <a href="https://developer.ebay.com/api-docs/sell/inventory/overview.html" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Inventory API Documentation</a></p>
                  <p>• <a href="https://developer.ebay.com/DevZone/guides/features-guide/default.html#development/Listing-AnItem.html" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">eBay Listing Management Guide</a></p>
                  <p>• <a href="https://developer.ebay.com/support" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Developer Support</a></p>
                </div>
              </div>

              {/* Other Integrations */}
              <div className="pt-6 border-t border-gray-200">
                <h4 className="font-medium text-gray-900 text-lg mb-4">Other Integrations</h4>
                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-4 border border-gray-200 rounded-lg">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 bg-red-600 rounded flex items-center justify-center text-white font-bold">
                        📧
                      </div>
                      <div>
                        <h5 className="font-medium text-gray-900">Email Notifications</h5>
                        <p className="text-sm text-gray-600">Receive alerts and reports via email</p>
                      </div>
                    </div>
                    <button className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">
                      Configure
                    </button>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-4 border border-gray-200 rounded-lg">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 bg-purple-600 rounded flex items-center justify-center text-white font-bold">
                        📊
                      </div>
                      <div>
                        <h5 className="font-medium text-gray-900">Analytics Export</h5>
                        <p className="text-sm text-gray-600">Export data to Google Sheets or CSV</p>
                      </div>
                    </div>
                    <button className="bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700">
                      Setup
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Data & Privacy Section */}
      <div className="bg-white rounded-lg shadow p-4 sm:p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Data & Privacy</h3>
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={handleExportData}
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
          >
            Export My Data
          </button>
          <button
            onClick={handleDeleteAccount}
            className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700"
          >
            Delete Account
          </button>
        </div>
      </div>
    </div>
  )
}
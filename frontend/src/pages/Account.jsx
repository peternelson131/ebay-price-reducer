import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { userAPI, authAPI } from '../lib/supabase'

export default function Account() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [activeTab, setActiveTab] = useState('profile')
  const [isEditing, setIsEditing] = useState(false)
  const [profileData, setProfileData] = useState({})
  const [isEditingPreferences, setIsEditingPreferences] = useState(false)
  const [preferencesData, setPreferencesData] = useState({})
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
    if (tab && ['profile', 'preferences', 'security'].includes(tab)) {
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


  const handleProfileSave = () => {
    updateProfileMutation.mutate(profileData)
  }

  const handlePreferencesSave = () => {
    updatePreferencesMutation.mutate(preferencesData)
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
    { id: 'security', name: 'Security', icon: '🔒' }
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-text-primary">Account Settings</h1>
        <p className="text-text-secondary mt-2">Manage your account settings and preferences</p>
      </div>

      <div className="bg-dark-surface rounded-lg border border-dark-border overflow-hidden">
        {/* Mobile Tab Selector */}
        <div className="sm:hidden">
          <select
            value={activeTab}
            onChange={(e) => setActiveTab(e.target.value)}
            className="w-full px-4 py-3 text-base border-b border-dark-border focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {tabs.map((tab) => (
              <option key={tab.id} value={tab.id}>
                {tab.icon} {tab.name}
              </option>
            ))}
          </select>
        </div>

        {/* Desktop Tab Navigation */}
        <div className="hidden sm:block border-b border-dark-border">
          <nav className="flex flex-wrap" aria-label="Tabs">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`${
                  activeTab === tab.id
                    ? 'border-blue-500 text-accent bg-accent/10'
                    : 'border-transparent text-text-tertiary hover:text-text-secondary hover:border-dark-border'
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
                <h3 className="text-lg font-medium text-text-primary">Profile Information</h3>
                <p className="text-sm text-text-secondary">Update your account profile information.</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">Full Name</label>
                  {isEditing ? (
                    <input
                      type="text"
                      value={profileData.name || profile?.name || ''}
                      onChange={(e) => setProfileData(prev => ({ ...prev, name: e.target.value }))}
                      className="w-full border border-dark-border rounded-lg px-3 py-2"
                    />
                  ) : (
                    <div className="text-text-primary">{profile?.name || 'Not set'}</div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">Email</label>
                  <div className="text-text-primary">{profile?.email || 'Not available'}</div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">Default Reduction Strategy</label>
                  {isEditing ? (
                    <select
                      value={profileData.default_reduction_strategy || profile?.default_reduction_strategy || ''}
                      onChange={(e) => setProfileData(prev => ({ ...prev, default_reduction_strategy: e.target.value }))}
                      className="w-full border border-dark-border rounded-lg px-3 py-2"
                    >
                      <option value="fixed_percentage">Fixed Percentage</option>
                      <option value="market_based">Market Based</option>
                      <option value="time_based">Time Based</option>
                    </select>
                  ) : (
                    <div className="text-text-primary capitalize">
                      {profile?.default_reduction_strategy?.replace('_', ' ') || 'Fixed Percentage'}
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">Default Reduction Percentage</label>
                  {isEditing ? (
                    <input
                      type="number"
                      min="1"
                      max="50"
                      value={profileData.default_reduction_percentage || profile?.default_reduction_percentage || ''}
                      onChange={(e) => setProfileData(prev => ({ ...prev, default_reduction_percentage: parseInt(e.target.value) }))}
                      className="w-full border border-dark-border rounded-lg px-3 py-2"
                    />
                  ) : (
                    <div className="text-text-primary">{profile?.default_reduction_percentage || 5}%</div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">Default Reduction Interval (Days)</label>
                  {isEditing ? (
                    <input
                      type="number"
                      min="1"
                      max="30"
                      value={profileData.default_reduction_interval || profile?.default_reduction_interval || ''}
                      onChange={(e) => setProfileData(prev => ({ ...prev, default_reduction_interval: parseInt(e.target.value) }))}
                      className="w-full border border-dark-border rounded-lg px-3 py-2"
                    />
                  ) : (
                    <div className="text-text-primary">{profile?.default_reduction_interval || 7} days</div>
                  )}
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                {isEditing ? (
                  <>
                    <button
                      onClick={handleProfileSave}
                      disabled={updateProfileMutation.isLoading}
                      className="bg-accent text-white px-4 py-2 rounded hover:bg-accent-hover disabled:opacity-50"
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
                    className="bg-accent text-white px-4 py-2 rounded hover:bg-accent-hover"
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
                <h3 className="text-lg font-medium text-text-primary">Preferences</h3>
                <p className="text-sm text-text-secondary">Customize your application preferences.</p>
              </div>

              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-2 border-b sm:border-0">
                  <div>
                    <label className="text-sm font-medium text-text-primary">Email Notifications</label>
                    <p className="text-sm text-text-secondary">Receive general email notifications</p>
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
                    className="h-4 w-4 text-accent"
                  />
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-2 border-b sm:border-0">
                  <div>
                    <label className="text-sm font-medium text-text-primary">Price Reduction Alerts</label>
                    <p className="text-sm text-text-secondary">Receive alerts when prices are automatically reduced</p>
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
                    className="h-4 w-4 text-accent"
                  />
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                {isEditingPreferences ? (
                  <>
                    <button
                      onClick={handlePreferencesSave}
                      disabled={updatePreferencesMutation.isLoading}
                      className="bg-accent text-white px-4 py-2 rounded hover:bg-accent-hover disabled:opacity-50"
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
                    className="bg-accent text-white px-4 py-2 rounded hover:bg-accent-hover"
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
                <h3 className="text-lg font-medium text-text-primary">Security Settings</h3>
                <p className="text-sm text-text-secondary">Manage your account security and password.</p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">Current Password</label>
                  <input
                    type="password"
                    value={passwordData.currentPassword}
                    onChange={(e) => setPasswordData(prev => ({ ...prev, currentPassword: e.target.value }))}
                    className="w-full border border-dark-border rounded-lg px-3 py-2"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">New Password</label>
                  <input
                    type="password"
                    value={passwordData.newPassword}
                    onChange={(e) => setPasswordData(prev => ({ ...prev, newPassword: e.target.value }))}
                    className="w-full border border-dark-border rounded-lg px-3 py-2"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">Confirm New Password</label>
                  <input
                    type="password"
                    value={passwordData.confirmPassword}
                    onChange={(e) => setPasswordData(prev => ({ ...prev, confirmPassword: e.target.value }))}
                    className="w-full border border-dark-border rounded-lg px-3 py-2"
                  />
                </div>

                <button
                  onClick={handlePasswordChange}
                  className="bg-accent text-white px-4 py-2 rounded hover:bg-accent-hover"
                >
                  Update Password
                </button>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* Data & Privacy Section */}
      <div className="bg-dark-surface rounded-lg border border-dark-border p-4 sm:p-6">
        <h3 className="text-lg font-medium text-text-primary mb-4">Data & Privacy</h3>
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={handleExportData}
            className="bg-accent text-white px-4 py-2 rounded hover:bg-accent-hover"
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
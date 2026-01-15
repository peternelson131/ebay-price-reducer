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

  // Handle URL parameter for tab selection
  useEffect(() => {
    const tab = searchParams.get('tab')
    if (tab && ['profile', 'preferences', 'security'].includes(tab)) {
      setActiveTab(tab)
    }
  }, [searchParams])

  const updateProfileMutation = useMutation({
    mutationFn: (data) => userAPI.updateProfile(data),
    onSuccess: () => {
      queryClient.invalidateQueries(['profile'])
      setIsEditing(false)
    }
  })

  const handleProfileSave = async () => {
    updateProfileMutation.mutate(profileData)
  }

  const handlePreferencesSave = async () => {
    try {
      await userAPI.updateProfile(preferencesData)
      queryClient.invalidateQueries(['profile'])
      setIsEditingPreferences(false)
    } catch (error) {
      console.error('Failed to update preferences:', error)
      alert('Failed to update preferences. Please try again.')
    }
  }

  const handlePasswordChange = async (e) => {
    e.preventDefault()
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      alert('New passwords do not match')
      return
    }
    if (passwordData.newPassword.length < 8) {
      alert('Password must be at least 8 characters')
      return
    }

    try {
      await authAPI.updatePassword(passwordData.newPassword)
      alert('Password updated successfully!')
      setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' })
    } catch (error) {
      console.error('Password update failed:', error)
      alert('Failed to update password. Please try again.')
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
    const exportData = {
      profile: profile,
      exportDate: new Date().toISOString(),
      listings: 'Available',
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
        <h1 className="text-3xl font-bold text-theme-primary">Account Settings</h1>
        <p className="text-theme-secondary mt-2">Manage your account settings and preferences</p>
      </div>

      <div className="bg-theme-surface rounded-lg border border-theme overflow-hidden">
        {/* Mobile Tab Selector */}
        <div className="sm:hidden">
          <select
            value={activeTab}
            onChange={(e) => setActiveTab(e.target.value)}
            className="w-full px-4 py-3 text-base border-b border-theme focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {tabs.map((tab) => (
              <option key={tab.id} value={tab.id}>
                {tab.icon} {tab.name}
              </option>
            ))}
          </select>
        </div>

        {/* Desktop Tab Navigation */}
        <div className="hidden sm:block border-b border-theme">
          <nav className="flex flex-wrap" aria-label="Tabs">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`${
                  activeTab === tab.id
                    ? 'border-blue-500 text-accent bg-accent/10'
                    : 'border-transparent text-theme-tertiary hover:text-theme-secondary hover:border-theme'
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
                <h3 className="text-lg font-medium text-theme-primary">Profile Information</h3>
                <p className="text-sm text-theme-secondary">Update your account profile information.</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                <div>
                  <label className="block text-sm font-medium text-theme-secondary mb-1">Full Name</label>
                  {isEditing ? (
                    <input
                      type="text"
                      value={profileData.name || profile?.name || ''}
                      onChange={(e) => setProfileData(prev => ({ ...prev, name: e.target.value }))}
                      className="w-full border border-theme rounded-lg px-3 py-2"
                    />
                  ) : (
                    <div className="text-theme-primary">{profile?.name || 'Not set'}</div>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-theme-secondary mb-1">Email</label>
                  <div className="text-theme-primary">{profile?.email || 'Not set'}</div>
                </div>
              </div>

              <div className="border-t border-theme pt-4">
                <h4 className="text-md font-medium text-theme-primary mb-3">Default Reduction Settings</h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-theme-secondary mb-1">Strategy</label>
                    {isEditing ? (
                      <select
                        value={profileData.default_reduction_strategy || 'fixed_percentage'}
                        onChange={(e) => setProfileData(prev => ({ ...prev, default_reduction_strategy: e.target.value }))}
                        className="w-full border border-theme rounded-lg px-3 py-2"
                      >
                        <option value="fixed_percentage">Fixed Percentage</option>
                        <option value="fixed_amount">Fixed Amount</option>
                      </select>
                    ) : (
                      <div className="text-theme-primary capitalize">
                        {(profile?.default_reduction_strategy || 'fixed_percentage').replace('_', ' ')}
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-theme-secondary mb-1">Reduction %</label>
                    {isEditing ? (
                      <input
                        type="number"
                        value={profileData.default_reduction_percentage || 5}
                        onChange={(e) => setProfileData(prev => ({ ...prev, default_reduction_percentage: parseFloat(e.target.value) }))}
                        className="w-full border border-theme rounded-lg px-3 py-2"
                        min="0"
                        max="100"
                        step="0.5"
                      />
                    ) : (
                      <div className="text-theme-primary">{profile?.default_reduction_percentage || 5}%</div>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-theme-secondary mb-1">Interval (days)</label>
                    {isEditing ? (
                      <input
                        type="number"
                        value={profileData.default_reduction_interval || 7}
                        onChange={(e) => setProfileData(prev => ({ ...prev, default_reduction_interval: parseInt(e.target.value) }))}
                        className="w-full border border-theme rounded-lg px-3 py-2"
                        min="1"
                        max="365"
                      />
                    ) : (
                      <div className="text-theme-primary">{profile?.default_reduction_interval || 7} days</div>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                {isEditing ? (
                  <>
                    <button
                      onClick={handleProfileSave}
                      disabled={updateProfileMutation.isLoading}
                      className="bg-accent text-white px-4 py-2 rounded hover:bg-accent-hover disabled:opacity-50"
                    >
                      {updateProfileMutation.isLoading ? 'Saving...' : 'Save Changes'}
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
                <h3 className="text-lg font-medium text-theme-primary">Notification Preferences</h3>
                <p className="text-sm text-theme-secondary">Manage how you receive notifications.</p>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-sm font-medium text-theme-primary">Email Notifications</label>
                    <p className="text-sm text-theme-secondary">Receive email updates about your account</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={isEditingPreferences ? preferencesData.email_notifications : (profile?.email_notifications ?? true)}
                    onChange={(e) => setPreferencesData(prev => ({ ...prev, email_notifications: e.target.checked }))}
                    disabled={!isEditingPreferences}
                    className="h-4 w-4 text-accent focus:ring-accent border-theme rounded"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-sm font-medium text-theme-primary">Price Reduction Alerts</label>
                    <p className="text-sm text-theme-secondary">Get notified when prices are automatically reduced</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={isEditingPreferences ? preferencesData.price_reduction_alerts : (profile?.price_reduction_alerts ?? true)}
                    onChange={(e) => setPreferencesData(prev => ({ ...prev, price_reduction_alerts: e.target.checked }))}
                    disabled={!isEditingPreferences}
                    className="h-4 w-4 text-accent focus:ring-accent border-theme rounded"
                  />
                </div>
              </div>

              <div className="flex gap-3">
                {isEditingPreferences ? (
                  <>
                    <button
                      onClick={handlePreferencesSave}
                      className="bg-accent text-white px-4 py-2 rounded hover:bg-accent-hover"
                    >
                      Save Preferences
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
                <h3 className="text-lg font-medium text-theme-primary">Security Settings</h3>
                <p className="text-sm text-theme-secondary">Manage your password and security options.</p>
              </div>

              <form onSubmit={handlePasswordChange} className="space-y-4 max-w-md">
                <div>
                  <label className="block text-sm font-medium text-theme-secondary mb-1">Current Password</label>
                  <input
                    type="password"
                    value={passwordData.currentPassword}
                    onChange={(e) => setPasswordData(prev => ({ ...prev, currentPassword: e.target.value }))}
                    className="w-full border border-theme rounded-lg px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-theme-secondary mb-1">New Password</label>
                  <input
                    type="password"
                    value={passwordData.newPassword}
                    onChange={(e) => setPasswordData(prev => ({ ...prev, newPassword: e.target.value }))}
                    className="w-full border border-theme rounded-lg px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-theme-secondary mb-1">Confirm New Password</label>
                  <input
                    type="password"
                    value={passwordData.confirmPassword}
                    onChange={(e) => setPasswordData(prev => ({ ...prev, confirmPassword: e.target.value }))}
                    className="w-full border border-theme rounded-lg px-3 py-2"
                  />
                </div>
                <button
                  type="submit"
                  className="bg-accent text-white px-4 py-2 rounded hover:bg-accent-hover"
                >
                  Update Password
                </button>
              </form>

              <div className="border-t border-theme pt-6 space-y-4">
                <div>
                  <h4 className="text-md font-medium text-theme-primary">Data Management</h4>
                  <p className="text-sm text-theme-secondary">Export or delete your account data.</p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={handleExportData}
                    className="bg-theme-hover text-theme-primary border border-theme px-4 py-2 rounded hover:bg-gray-200 dark:bg-gray-700"
                  >
                    Export Data
                  </button>
                  <button
                    onClick={handleDeleteAccount}
                    className="bg-error/10 text-error border border-error/30 px-4 py-2 rounded hover:bg-error/20"
                  >
                    Delete Account
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

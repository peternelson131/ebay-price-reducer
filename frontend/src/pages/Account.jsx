import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { userAPI, authAPI, supabase } from '../lib/supabase'
import { Shield, MessageSquare, Zap, Settings, User, Loader, Image, Trash2 } from 'lucide-react'

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
  const [feedbackData, setFeedbackData] = useState({
    category: '',
    description: '',
    screenshot: null
  })
  const [feedbackStatus, setFeedbackStatus] = useState({ type: '', message: '' })
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false)
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
    if (tab && ['profile', 'preferences', 'security', 'feedback'].includes(tab)) {
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

  const handleFeedbackSubmit = async (e) => {
    e.preventDefault()
    setFeedbackStatus({ type: '', message: '' })

    // Validate required fields
    if (!feedbackData.category) {
      setFeedbackStatus({ type: 'error', message: 'Please select a category.' })
      return
    }
    if (!feedbackData.description.trim()) {
      setFeedbackStatus({ type: 'error', message: 'Please provide a description.' })
      return
    }
    // Screenshot required for Bug reports
    if (feedbackData.category === 'bug' && !feedbackData.screenshot) {
      setFeedbackStatus({ type: 'error', message: 'Screenshot is required for bug reports.' })
      return
    }

    setIsSubmittingFeedback(true)

    try {
      // Get auth token
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        throw new Error('Not authenticated')
      }

      const formData = new FormData()
      formData.append('category', feedbackData.category)
      formData.append('description', feedbackData.description)
      if (feedbackData.screenshot) {
        formData.append('screenshot', feedbackData.screenshot)
      }

      const response = await fetch('/.netlify/functions/submit-feedback', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        },
        body: formData
      })

      if (!response.ok) {
        throw new Error('Failed to submit feedback')
      }

      setFeedbackStatus({ type: 'success', message: 'Thank you! Your feedback has been submitted successfully.' })
      setFeedbackData({ category: '', description: '', screenshot: null })
      // Reset file input
      const fileInput = document.getElementById('screenshot-input')
      if (fileInput) fileInput.value = ''
    } catch (error) {
      console.error('Feedback submission failed:', error)
      setFeedbackStatus({ type: 'error', message: 'Failed to submit feedback. Please try again.' })
    } finally {
      setIsSubmittingFeedback(false)
    }
  }

  if (isLoading) {
    return <div className="text-center py-8">Loading...</div>
  }

  const tabs = [
    { id: 'profile', name: 'Profile', icon: '👤' },
    { id: 'preferences', name: 'Preferences', icon: '⚙️' },
    { id: 'security', name: 'Security', icon: '🔒' },
    { id: 'feedback', name: 'Feedback', icon: '💬' }
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
            
            {/* Admin Tab - only show if user is admin */}
            {profile?.is_admin && (
              <button
                onClick={() => {
                  setActiveTab('admin')
                  setIsEditingPreferences(false)
                }}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === 'admin'
                    ? 'bg-accent text-white'
                    : 'text-theme-secondary hover:text-theme-primary hover:bg-theme-hover'
                }`}
              >
                <Shield className="w-5 h-5" />
                <span className="hidden md:inline">Admin</span>
              </button>
            )}
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

          {activeTab === 'feedback' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-medium text-theme-primary">Submit Feedback</h3>
                <p className="text-sm text-theme-secondary">Help us improve by sharing your feedback, reporting bugs, or requesting new features.</p>
              </div>

              {feedbackStatus.message && (
                <div className={`p-4 rounded-lg ${
                  feedbackStatus.type === 'success' 
                    ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200 border border-green-200 dark:border-green-800' 
                    : 'bg-error/10 text-error border border-error/30'
                }`}>
                  {feedbackStatus.message}
                </div>
              )}

              <form onSubmit={handleFeedbackSubmit} className="space-y-4 max-w-lg">
                <div>
                  <label className="block text-sm font-medium text-theme-secondary mb-1">
                    Category <span className="text-error">*</span>
                  </label>
                  <select
                    value={feedbackData.category}
                    onChange={(e) => setFeedbackData(prev => ({ ...prev, category: e.target.value }))}
                    className="w-full border border-theme rounded-lg px-3 py-2 bg-theme-surface text-theme-primary"
                    required
                  >
                    <option value="">Select a category...</option>
                    <option value="feature_request">New Feature Request</option>
                    <option value="bug">Bug</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-theme-secondary mb-1">
                    Description <span className="text-error">*</span>
                  </label>
                  <textarea
                    value={feedbackData.description}
                    onChange={(e) => setFeedbackData(prev => ({ ...prev, description: e.target.value }))}
                    className="w-full border border-theme rounded-lg px-3 py-2 bg-theme-surface text-theme-primary min-h-[120px] resize-y"
                    placeholder="Please describe your feedback in detail..."
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-theme-secondary mb-1">
                    Screenshot {feedbackData.category === 'bug' && <span className="text-error">* (required for bugs)</span>}
                  </label>
                  <input
                    id="screenshot-input"
                    type="file"
                    accept="image/*"
                    onChange={(e) => setFeedbackData(prev => ({ ...prev, screenshot: e.target.files?.[0] || null }))}
                    className="w-full border border-theme rounded-lg px-3 py-2 bg-theme-surface text-theme-primary file:mr-4 file:py-1 file:px-3 file:rounded file:border-0 file:text-sm file:bg-accent file:text-white hover:file:bg-accent-hover"
                  />
                  {feedbackData.screenshot && (
                    <p className="mt-1 text-sm text-theme-tertiary">
                      Selected: {feedbackData.screenshot.name}
                    </p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={isSubmittingFeedback}
                  className="bg-accent text-white px-6 py-2 rounded hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmittingFeedback ? 'Submitting...' : 'Submit Feedback'}
                </button>
              </form>
            </div>
          )}

          {/* Admin Panel - Only visible to admin users */}
          {activeTab === 'admin' && (
            <div className="space-y-6">
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-blue-900 dark:text-blue-100 mb-2 flex items-center gap-2">
                  <Shield className="w-5 h-5" />
                  Admin Feedback Review
                </h3>
                <p className="text-sm text-blue-700 dark:text-blue-300">
                  View and manage all feedback submitted by users.
                </p>
              </div>

              {/* Feedback Table */}
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
                {isLoadingFeedback ? (
                  <div className="p-8 text-center text-gray-500">
                    <Loader className="w-8 h-8 animate-spin mx-auto mb-2" />
                    Loading feedback...
                  </div>
                ) : allFeedback.length === 0 ? (
                  <div className="p-8 text-center text-gray-500">
                    No feedback submissions yet.
                  </div>
                ) : (
                  <table className="w-full">
                    <thead className="bg-gray-100 dark:bg-gray-700">
                      <tr>
                        <th className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider py-3 px-4">
                          Category
                        </th>
                        <th className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider py-3 px-4">
                          Description
                        </th>
                        <th className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider py-3 px-4">
                          User
                        </th>
                        <th className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider py-3 px-4">
                          Date
                        </th>
                        <th className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider py-3 px-4">
                          Screenshot
                        </th>
                        <th className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider py-3 px-4 w-20">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                      {allFeedback.map(item => (
                        <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                          <td className="py-3 px-4">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              item.category === 'bug' 
                                ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                                : item.category === 'feature_request'
                                ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                                : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                            }`}>
                              {item.category === 'feature_request' ? 'Feature' : item.category}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-sm text-gray-900 dark:text-gray-100 max-w-xs truncate">
                            {item.description}
                          </td>
                          <td className="py-3 px-4 text-sm text-gray-900 dark:text-gray-100">
                            {item.user_email || 'Unknown'}
                          </td>
                          <td className="py-3 px-4 text-sm text-gray-500 dark:text-gray-400">
                            {new Date(item.created_at).toLocaleDateString()}
                          </td>
                          <td className="py-3 px-4">
                            {item.screenshot_url ? (
                              <button
                                onClick={() => window.open(item.screenshot_url, '_blank')}
                                className="text-blue-600 hover:text-blue-800 dark:text-blue-400"
                              >
                                <Image className="w-5 h-5" />
                              </button>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <button
                              onClick={() => handleDeleteFeedback(item.id)}
                              className="text-red-600 hover:text-red-800 dark:text-red-400"
                              title="Delete feedback"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

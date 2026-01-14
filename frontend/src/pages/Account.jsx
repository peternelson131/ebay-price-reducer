import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { userAPI, authAPI } from '../lib/supabase'

// Default AI matching prompt - this is the base template that always runs
// Custom criteria learned from user feedback are injected into the {custom_criteria} section
const DEFAULT_MATCHING_PROMPT = `PRIMARY PRODUCT:
Title: {primary_title}
Brand: {primary_brand}

CANDIDATE PRODUCT:
ASIN: {candidate_asin}
Title: {candidate_title}
Brand: {candidate_brand}

Question: Should the CANDIDATE be shown as a similar product to the PRIMARY?

=== MATCHING CRITERIA ===

Answer YES if:
- Same or highly similar product type/category
- Same brand family or compatible brands
- Would reasonably substitute for or complement the primary product
- Customer searching for primary would likely want to see this

Answer NO if:
- Different product category entirely
- Accessory when primary is main product (or vice versa)
- Competing brand that user doesn't sell
- Quality tier mismatch (premium vs budget)

{custom_criteria}

Answer with ONLY: YES or NO`

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
  // AI Matching state
  const [aiMatchingData, setAiMatchingData] = useState({
    custom_matching_enabled: false,
    custom_matching_prompt: ''
  })
  const [isEditingAiMatching, setIsEditingAiMatching] = useState(false)
  const [generatingPrompt, setGeneratingPrompt] = useState(false)
  const [feedbackStats, setFeedbackStats] = useState(null)
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

  // Load AI matching data from profile
  useEffect(() => {
    if (profile && !isEditingAiMatching) {
      setAiMatchingData({
        custom_matching_enabled: profile.custom_matching_enabled ?? false,
        custom_matching_prompt: profile.custom_matching_prompt ?? ''
      })
    }
  }, [profile, isEditingAiMatching])

  // Fetch feedback stats when AI Matching tab is active
  useEffect(() => {
    if (activeTab === 'ai_matching') {
      fetchFeedbackStats()
    }
  }, [activeTab])

  const fetchFeedbackStats = async () => {
    try {
      const token = await userAPI.getAuthToken()
      const response = await fetch('/.netlify/functions/correlation-feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ action: 'stats' })
      })
      const data = await response.json()
      if (data.success) {
        setFeedbackStats(data.stats)
      }
    } catch (err) {
      console.error('Failed to fetch feedback stats:', err)
    }
  }

  // Handle tab query parameter
  useEffect(() => {
    const tab = searchParams.get('tab')
    if (tab && ['profile', 'preferences', 'ai_matching', 'security'].includes(tab)) {
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
    { id: 'ai_matching', name: 'AI Matching', icon: '🤖' },
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

          {activeTab === 'ai_matching' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-medium text-text-primary">AI Product Matching</h3>
                <p className="text-sm text-text-secondary">Train the AI to match products based on your preferences.</p>
              </div>

              {/* Feedback Stats */}
              <div className="bg-dark-hover rounded-lg p-4">
                <h4 className="text-sm font-medium text-text-primary mb-3">Your Feedback History</h4>
                {feedbackStats ? (
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <div className="text-2xl font-bold text-text-primary">{feedbackStats.total}</div>
                      <div className="text-xs text-text-secondary">Total Decisions</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-success">{feedbackStats.accepted}</div>
                      <div className="text-xs text-text-secondary">Accepted</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-error">{feedbackStats.declined}</div>
                      <div className="text-xs text-text-secondary">Declined</div>
                    </div>
                  </div>
                ) : (
                  <div className="text-text-secondary text-sm">Loading stats...</div>
                )}
              </div>

              {/* Locked state message */}
              {feedbackStats && feedbackStats.total < 5 && (
                <div className="bg-warning/10 border border-warning/30 rounded-lg p-4">
                  <p className="text-sm text-warning">
                    ⚠️ You need at least <strong>5 product decisions</strong> to customize AI matching. 
                    You have {feedbackStats.total} so far. Go to <a href="/asin-lookup" className="underline">Influencer Central</a> to rate more product matches!
                  </p>
                </div>
              )}

              {/* Content - disabled until 5+ decisions */}
              <div className={feedbackStats && feedbackStats.total < 5 ? 'opacity-50 pointer-events-none' : ''}>
                {/* Custom Matching Toggle */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-4 border-b border-dark-border">
                  <div>
                    <label className="text-sm font-medium text-text-primary">Custom Matching Based on My Preferences</label>
                    <p className="text-sm text-text-secondary">Use your feedback to customize how products are matched</p>
                  </div>
                  {/* Toggle Switch */}
                  <button
                    type="button"
                    onClick={() => {
                      const newValue = !(isEditingAiMatching ? aiMatchingData.custom_matching_enabled : (profile?.custom_matching_enabled ?? false))
                      setAiMatchingData(prev => ({ ...prev, custom_matching_enabled: newValue }))
                      // Auto-save toggle changes
                      userAPI.updateProfile({ custom_matching_enabled: newValue })
                        .then(() => queryClient.invalidateQueries(['profile']))
                        .catch(err => console.error('Failed to save toggle:', err))
                    }}
                    disabled={!aiMatchingData.custom_matching_prompt && !profile?.custom_matching_prompt}
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${
                      (isEditingAiMatching ? aiMatchingData.custom_matching_enabled : (profile?.custom_matching_enabled ?? false))
                        ? 'bg-accent'
                        : 'bg-gray-600'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        (isEditingAiMatching ? aiMatchingData.custom_matching_enabled : (profile?.custom_matching_enabled ?? false))
                          ? 'translate-x-5'
                          : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {/* Default Prompt Display */}
                <div className="mt-4">
                  <label className="block text-sm font-medium text-text-primary mb-2">
                    Default Matching Prompt
                    <span className="ml-2 text-xs font-normal text-text-tertiary">(always active)</span>
                  </label>
                  <p className="text-sm text-text-secondary mb-2">
                    This is the base AI prompt used to evaluate product matches. Product information is automatically injected.
                  </p>
                  <div className="bg-dark-hover rounded-lg p-3 text-sm text-text-secondary whitespace-pre-wrap font-mono text-xs max-h-[200px] overflow-y-auto border border-dark-border">
                    {DEFAULT_MATCHING_PROMPT}
                  </div>
                </div>

                {/* Custom Criteria Section */}
                <div className="mt-4">
                  <label className="block text-sm font-medium text-text-primary mb-2">
                    Your Custom Criteria
                    <span className="ml-2 text-xs font-normal text-text-tertiary">(injected into {'{custom_criteria}'} above)</span>
                  </label>
                  <p className="text-sm text-text-secondary mb-2">
                    These additional rules are learned from your Accept/Decline feedback and personalize how products are matched for you.
                  </p>
                  {isEditingAiMatching ? (
                    <textarea
                      value={aiMatchingData.custom_matching_prompt || ''}
                      onChange={(e) => setAiMatchingData(prev => ({ ...prev, custom_matching_prompt: e.target.value }))}
                      rows={6}
                      className="w-full border border-dark-border rounded-lg px-3 py-2 text-sm font-mono"
                      placeholder="Answer YES if:
- [your custom criteria will appear here]

Answer NO if:
- [your custom criteria will appear here]"
                    />
                  ) : (
                    <div className="bg-dark-hover rounded-lg p-3 text-sm whitespace-pre-wrap min-h-[100px] border border-dark-border">
                      {profile?.custom_matching_prompt ? (
                        <span className="text-text-primary font-mono text-xs">{profile.custom_matching_prompt}</span>
                      ) : (
                        <span className="text-text-tertiary italic">
                          No custom criteria yet. Your personalized rules will appear here after you:
                          {'\n'}1. Rate 5+ product matches in Influencer Central
                          {'\n'}2. Click "Generate from Feedback" below
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="flex flex-col sm:flex-row gap-3 mt-4">
                  {isEditingAiMatching ? (
                    <>
                      <button
                        onClick={async () => {
                          try {
                            await userAPI.updateProfile(aiMatchingData)
                            queryClient.invalidateQueries(['profile'])
                            setIsEditingAiMatching(false)
                            alert('AI Matching settings saved!')
                          } catch (err) {
                            alert('Failed to save: ' + err.message)
                          }
                        }}
                        className="bg-accent text-white px-4 py-2 rounded hover:bg-accent-hover"
                      >
                        Save Changes
                      </button>
                      <button
                        onClick={() => setIsEditingAiMatching(false)}
                        className="bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => setIsEditingAiMatching(true)}
                        className="bg-accent text-white px-4 py-2 rounded hover:bg-accent-hover"
                      >
                        Edit Settings
                      </button>
                      <button
                        onClick={async () => {
                          setGeneratingPrompt(true)
                          try {
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
                              queryClient.invalidateQueries(['profile'])
                              alert('Custom matching criteria generated!')
                            } else {
                              throw new Error(data.error || 'Failed to generate')
                            }
                          } catch (err) {
                            alert('Failed to generate: ' + err.message)
                          } finally {
                            setGeneratingPrompt(false)
                          }
                        }}
                        disabled={generatingPrompt}
                        className="bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {generatingPrompt ? 'Generating...' : '🤖 Generate from Feedback'}
                      </button>
                      <button
                        onClick={async () => {
                          if (!confirm('This will clear your custom prompt and use the default AI matching. Continue?')) return
                          try {
                            await userAPI.updateProfile({
                              custom_matching_enabled: false,
                              custom_matching_prompt: null
                            })
                            queryClient.invalidateQueries(['profile'])
                            setAiMatchingData({ custom_matching_enabled: false, custom_matching_prompt: '' })
                            alert('Restored to default AI matching!')
                          } catch (err) {
                            alert('Failed to restore: ' + err.message)
                          }
                        }}
                        className="bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700"
                      >
                        ↩ Restore Default
                      </button>
                    </>
                  )}
                </div>
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
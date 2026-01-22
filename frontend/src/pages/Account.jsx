import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { userAPI, authAPI, supabase } from '../lib/supabase'
import { Shield, MessageSquare, Zap, Settings, User, Loader, Image, Trash2, X, Check, CheckCircle, Undo2, ImagePlus, Edit, Plus, Youtube, ExternalLink, Clock } from 'lucide-react'
import ThumbnailTemplateModal from '../components/ThumbnailTemplateModal'
import FolderPicker from '../components/onedrive/FolderPicker'

export default function Account() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [activeTab, setActiveTab] = useState('profile')
  const [isEditing, setIsEditing] = useState(false)
  const [profileData, setProfileData] = useState({})
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
  const [selectedFeedback, setSelectedFeedback] = useState(null)
  
  // Thumbnail Templates state
  const [showTemplateModal, setShowTemplateModal] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState(null)
  const [deletingTemplateId, setDeletingTemplateId] = useState(null)
  const [thumbnailFolderPath, setThumbnailFolderPath] = useState('')
  const [thumbnailFolderId, setThumbnailFolderId] = useState('')
  const [showThumbnailFolderPicker, setShowThumbnailFolderPicker] = useState(false)
  
  const queryClient = useQueryClient()

  const { data: profile, isLoading } = useQuery(
    ['profile'],
    () => userAPI.getProfile(),
    {
      refetchOnWindowFocus: false
    }
  )

  // YouTube connection status
  const [youtubeSchedule, setYoutubeSchedule] = useState({ post_time: '09:00', timezone: 'America/Chicago', is_active: false })
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

  // Handle YouTube OAuth callback from URL params
  useEffect(() => {
    const youtubeParam = searchParams.get('youtube')
    if (youtubeParam === 'connected') {
      setActiveTab('social')
      refetchYoutube()
      // Clear the URL params
      searchParams.delete('youtube')
      searchParams.delete('channel')
      setSearchParams(searchParams)
    } else if (youtubeParam === 'error') {
      setActiveTab('social')
      // Show error toast/message
      console.error('YouTube connection error:', searchParams.get('message'))
      searchParams.delete('youtube')
      searchParams.delete('message')
      setSearchParams(searchParams)
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
    } catch (error) {
      console.error('Failed to disconnect YouTube:', error)
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
    } catch (error) {
      console.error('Failed to save schedule:', error)
    } finally {
      setIsSavingYoutubeSchedule(false)
    }
  }

  // Admin feedback query - only fetch if user is admin
  const { data: allFeedback, isLoading: isLoadingFeedback, error: feedbackError, refetch: refetchFeedback } = useQuery(
    ['allFeedback'],
    async () => {
      const { data, error } = await supabase
        .from('feedback')
        .select('id, category, description, screenshot_url, user_id, created_at, status, processed')
        .order('created_at', { ascending: false })
      if (error) throw error
      
      // Get unique user IDs
      const userIds = [...new Set(data.map(f => f.user_id).filter(Boolean))]
      
      // Fetch user emails
      let userMap = {}
      if (userIds.length > 0) {
        const { data: users } = await supabase
          .from('users')
          .select('id, email')
          .in('id', userIds)
        
        userMap = Object.fromEntries((users || []).map(u => [u.id, u.email]))
      }
      
      // Process feedback with signed URLs
      const feedbackWithSignedUrls = await Promise.all(data.map(async (f) => {
        let signedUrl = null
        if (f.screenshot_url) {
          try {
            // The screenshot_url already contains the path like "userId/filename.jpg"
            // Just pass it directly to createSignedUrl
            const { data: signedData } = await supabase
              .storage
              .from('feedback-screenshots')
              .createSignedUrl(f.screenshot_url, 3600)
            signedUrl = signedData?.signedUrl || null
          } catch (e) {
            console.error('Error creating signed URL for', f.id, e)
          }
        }
        
        return {
          ...f,
          user_email: userMap[f.user_id] || 'Unknown',
          screenshot_url: signedUrl
        }
      }))
      
      return feedbackWithSignedUrls
    },
    {
      enabled: profile?.is_admin === true,
      refetchOnWindowFocus: false,
      retry: 1
    }
  )

  // CRM Owners query (for thumbnail template dropdown)
  const { data: crmOwners = [] } = useQuery(
    ['crmOwners'],
    async () => {
      const { data, error } = await supabase
        .from('crm_owners')
        .select('id, name')
        .order('name')
      if (error) throw error
      return data || []
    },
    {
      refetchOnWindowFocus: false
    }
  )

  // Thumbnail Templates query
  const { data: thumbnailTemplates = [], isLoading: isLoadingTemplates, refetch: refetchTemplates } = useQuery(
    ['thumbnailTemplates'],
    async () => {
      const token = (await supabase.auth.getSession()).data.session?.access_token
      const response = await fetch('/.netlify/functions/thumbnail-templates', {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (!response.ok) throw new Error('Failed to fetch templates')
      const data = await response.json()
      return data.templates || []
    },
    {
      refetchOnWindowFocus: false
    }
  )

  // Merge owners with template info (to show which have templates)
  const ownersWithTemplateInfo = crmOwners.map(owner => ({
    ...owner,
    hasTemplate: thumbnailTemplates.some(t => t.owner_id === owner.id)
  }))

  // Delete template mutation
  const deleteTemplateMutation = useMutation({
    mutationFn: async (templateId) => {
      const token = (await supabase.auth.getSession()).data.session?.access_token
      const response = await fetch(`/.netlify/functions/thumbnail-templates?id=${templateId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      })
      if (!response.ok) throw new Error('Failed to delete template')
      return response.json()
    },
    onSuccess: () => {
      refetchTemplates()
      setDeletingTemplateId(null)
    }
  })

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

  // Load thumbnail folder setting
  useEffect(() => {
    const loadThumbnailFolder = async () => {
      try {
        const token = (await supabase.auth.getSession()).data.session?.access_token
        if (!token) return
        
        const response = await fetch('/.netlify/functions/thumbnail-folder', {
          headers: { Authorization: `Bearer ${token}` }
        })
        if (response.ok) {
          const data = await response.json()
          if (data.folder_path) setThumbnailFolderPath(data.folder_path)
          if (data.folder_id) setThumbnailFolderId(data.folder_id)
        }
      } catch (err) {
        console.error('Failed to load thumbnail folder:', err)
      }
    }
    loadThumbnailFolder()
  }, [])

  // Handle URL parameter for tab selection
  useEffect(() => {
    const tab = searchParams.get('tab')
    if (tab && ['profile', 'social', 'security', 'feedback', 'thumbnail-templates'].includes(tab)) {
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

  const handleDeleteFeedback = async (feedbackId) => {
    if (!window.confirm('Are you sure you want to delete this feedback?')) return
    try {
      const { error } = await supabase.from('feedback').delete().eq('id', feedbackId)
      if (error) throw error
      queryClient.invalidateQueries(['allFeedback'])
    } catch (error) {
      console.error('Failed to delete feedback:', error)
      alert('Failed to delete feedback. Please try again.')
    }
  }

  const handleApproveFeedback = async (feedbackId) => {
    console.log('🟢 handleApproveFeedback called with:', feedbackId)
    try {
      const { data, error } = await supabase
        .from('feedback')
        .update({ status: 'approved', processed: false })
        .eq('id', feedbackId)
        .select()
      console.log('🟢 Approve result:', { data, error })
      if (error) throw error
      await refetchFeedback()
    } catch (error) {
      console.error('Failed to approve feedback:', error)
      alert('Failed to approve feedback: ' + error.message)
    }
  }

  const handleDeclineFeedback = async (feedbackId) => {
    console.log('🔴 handleDeclineFeedback called with:', feedbackId)
    try {
      const { data, error } = await supabase
        .from('feedback')
        .update({ status: 'declined', processed: false })
        .eq('id', feedbackId)
        .select()
      console.log('🔴 Decline result:', { data, error })
      if (error) throw error
      await refetchFeedback()
    } catch (error) {
      console.error('Failed to decline feedback:', error)
      alert('Failed to decline feedback: ' + error.message)
    }
  }

  const handleMarkProcessed = async (feedbackId) => {
    console.log('🔵 handleMarkProcessed called with:', feedbackId)
    try {
      const { data, error } = await supabase
        .from('feedback')
        .update({ processed: true, status: 'processed' })
        .eq('id', feedbackId)
        .select()
      console.log('🔵 Mark processed result:', { data, error })
      if (error) throw error
      await refetchFeedback()
    } catch (error) {
      console.error('Failed to mark as processed:', error)
      alert('Failed to mark as processed: ' + error.message)
    }
  }

  const handleUndoStatus = async (feedbackId, currentStatus) => {
    console.log('⏪ handleUndoStatus called with:', feedbackId, 'from status:', currentStatus)
    // Determine the previous status to revert to
    let previousStatus = 'pending'
    if (currentStatus === 'processed') {
      previousStatus = 'approved'
    }
    try {
      const { data, error } = await supabase
        .from('feedback')
        .update({ status: previousStatus, processed: false })
        .eq('id', feedbackId)
        .select()
      console.log('⏪ Undo result:', { data, error })
      if (error) throw error
      await refetchFeedback()
    } catch (error) {
      console.error('Failed to undo status:', error)
      alert('Failed to undo status: ' + error.message)
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
    { id: 'profile', name: 'Account', icon: '👤' },
    { id: 'social', name: 'Social', icon: '📺' },
    { id: 'security', name: 'Security', icon: '🔒' },
    { id: 'feedback', name: 'Feedback', icon: '💬' },
    { id: 'thumbnail-templates', name: 'Thumbnails', icon: '🖼️' }
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

          {activeTab === 'social' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-medium text-theme-primary">Social Media Connections</h3>
                <p className="text-sm text-theme-secondary">Connect your social accounts for automated video posting.</p>
              </div>

              {/* YouTube Connection */}
              <div className="border border-theme rounded-lg p-4">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-red-600 rounded-lg flex items-center justify-center">
                    <Youtube className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-medium text-theme-primary">YouTube</h4>
                    <p className="text-sm text-theme-secondary">Post videos as YouTube Shorts</p>
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
                    <div className="flex items-center gap-3 p-3 bg-theme-surface-alt rounded-lg">
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

                    {/* Recent Posts */}
                    {youtubeStatus.recentPosts?.length > 0 && (
                      <div className="border-t border-theme pt-4">
                        <h5 className="font-medium text-theme-primary mb-3">Recent Posts</h5>
                        <div className="space-y-2">
                          {youtubeStatus.recentPosts.slice(0, 5).map(post => (
                            <div key={post.id} className="flex items-center gap-3 p-2 bg-theme-surface-alt rounded">
                              <span className={`w-2 h-2 rounded-full ${
                                post.status === 'posted' ? 'bg-green-500' :
                                post.status === 'failed' ? 'bg-red-500' :
                                'bg-yellow-500'
                              }`} />
                              <span className="flex-1 text-sm text-theme-primary truncate">{post.title}</span>
                              {post.platform_url && (
                                <a 
                                  href={post.platform_url} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="text-accent hover:text-accent-hover"
                                >
                                  <ExternalLink className="w-4 h-4" />
                                </a>
                              )}
                              <span className="text-xs text-theme-secondary">
                                {new Date(post.scheduled_for).toLocaleDateString()}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
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

              {/* Placeholder for future platforms */}
              <div className="border border-dashed border-theme rounded-lg p-4 opacity-50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg flex items-center justify-center">
                    <span className="text-white font-bold">IG</span>
                  </div>
                  <div className="flex-1">
                    <h4 className="font-medium text-theme-primary">Instagram</h4>
                    <p className="text-sm text-theme-secondary">Coming soon...</p>
                  </div>
                </div>
              </div>

              <div className="border border-dashed border-theme rounded-lg p-4 opacity-50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-black rounded-lg flex items-center justify-center">
                    <span className="text-white font-bold text-xs">TT</span>
                  </div>
                  <div className="flex-1">
                    <h4 className="font-medium text-theme-primary">TikTok</h4>
                    <p className="text-sm text-theme-secondary">Coming soon...</p>
                  </div>
                </div>
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
                          Status
                        </th>
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
                        <th className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider py-3 px-4 w-32">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                      {allFeedback.map(item => (
                        <tr 
                          key={item.id} 
                          className={`hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer transition-colors ${
                            item.status === 'approved' ? 'bg-green-50/50 dark:bg-green-900/10' : ''
                          }`}
                          onClick={() => setSelectedFeedback(item)}
                        >
                          <td className="py-3 px-4">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              item.status === 'approved' 
                                ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                                : item.status === 'declined'
                                ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                                : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
                            }`}>
                              {item.status || 'Pending'}
                            </span>
                          </td>
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
                          <td className="py-3 px-4" onClick={e => e.stopPropagation()}>
                            {(!item.status || item.status === 'pending') && (
                              <div className="flex gap-1">
                                <button
                                  onClick={() => handleApproveFeedback(item.id)}
                                  className="p-1.5 bg-green-100 text-green-700 rounded hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400"
                                  title="Approve"
                                >
                                  <Check className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleDeclineFeedback(item.id)}
                                  className="p-1.5 bg-red-100 text-red-700 rounded hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400"
                                  title="Decline"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                            )}
                            {item.status === 'approved' && (
                              <div className="flex gap-1">
                                <button
                                  onClick={() => handleMarkProcessed(item.id)}
                                  className="p-1.5 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-400"
                                  title="Mark as Processed"
                                >
                                  <CheckCircle className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleUndoStatus(item.id, item.status)}
                                  className="p-1.5 bg-yellow-100 text-yellow-700 rounded hover:bg-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400"
                                  title="Undo (back to pending)"
                                >
                                  <Undo2 className="w-4 h-4" />
                                </button>
                              </div>
                            )}
                            {item.status === 'declined' && (
                              <div className="flex gap-1">
                                <button
                                  onClick={() => handleDeleteFeedback(item.id)}
                                  className="p-1.5 bg-gray-100 text-gray-500 rounded hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-400"
                                  title="Delete"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleUndoStatus(item.id, item.status)}
                                  className="p-1.5 bg-yellow-100 text-yellow-700 rounded hover:bg-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400"
                                  title="Undo (back to pending)"
                                >
                                  <Undo2 className="w-4 h-4" />
                                </button>
                              </div>
                            )}
                            {item.status === 'processed' && (
                              <button
                                onClick={() => handleUndoStatus(item.id, item.status)}
                                className="p-1.5 bg-yellow-100 text-yellow-700 rounded hover:bg-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400"
                                title="Undo (back to approved)"
                              >
                                <Undo2 className="w-4 h-4" />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {/* Feedback Detail Side Panel */}
          {selectedFeedback && (
            <div className="fixed inset-y-0 right-0 w-full max-w-md bg-white dark:bg-gray-800 shadow-xl z-50 flex flex-col">
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Feedback Details
                </h3>
                <button
                  onClick={() => setSelectedFeedback(null)}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {/* Category */}
                <div>
                  <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Category</label>
                  <div className="mt-1">
                    <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                      selectedFeedback.category === 'bug' 
                        ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                        : selectedFeedback.category === 'feature_request'
                        ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                        : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                    }`}>
                      {selectedFeedback.category === 'feature_request' ? 'Feature Request' : selectedFeedback.category}
                    </span>
                  </div>
                </div>

                {/* User */}
                <div>
                  <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Submitted By</label>
                  <p className="mt-1 text-sm text-gray-900 dark:text-white">
                    {selectedFeedback.user_email || 'Unknown User'}
                  </p>
                </div>

                {/* Date */}
                <div>
                  <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Date Submitted</label>
                  <p className="mt-1 text-sm text-gray-900 dark:text-white">
                    {new Date(selectedFeedback.created_at).toLocaleString()}
                  </p>
                </div>

                {/* Description */}
                <div>
                  <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Description</label>
                  <p className="mt-1 text-sm text-gray-900 dark:text-white whitespace-pre-wrap">
                    {selectedFeedback.description}
                  </p>
                </div>

                {/* Screenshot */}
                {selectedFeedback.screenshot_url && (
                  <div>
                    <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Screenshot</label>
                    <div className="mt-2">
                      <img
                        src={selectedFeedback.screenshot_url}
                        alt="Feedback screenshot"
                        className="w-full rounded-lg border border-gray-200 dark:border-gray-700"
                      />
                      <a
                        href={selectedFeedback.screenshot_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400"
                      >
                        <Image className="w-4 h-4" />
                        Open full size
                      </a>
                    </div>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex gap-3">
                <button
                  onClick={() => {
                    handleDeleteFeedback(selectedFeedback.id)
                    setSelectedFeedback(null)
                  }}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                >
                  Delete
                </button>
                <button
                  onClick={() => setSelectedFeedback(null)}
                  className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  Close
                </button>
              </div>
            </div>
          )}

          {/* Thumbnail Templates Tab */}
          {activeTab === 'thumbnail-templates' && (
            <div className="p-6 space-y-6">
              {/* Header */}
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-theme-primary">Thumbnail Templates</h3>
                  <p className="text-sm text-theme-secondary mt-1">
                    Create base templates for auto-generating video thumbnails. Define where the product image should appear.
                  </p>
                </div>
                <button
                  onClick={() => {
                    setEditingTemplate(null)
                    setShowTemplateModal(true)
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Add Template
                </button>
              </div>

              {/* OneDrive Folder Setting */}
              <div className="bg-theme-primary rounded-lg border border-theme p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <label className="text-sm font-medium text-theme-primary">OneDrive Thumbnail Folder</label>
                    <p className="text-xs text-theme-tertiary mt-1">
                      Generated thumbnails will be saved to this folder in your OneDrive.
                    </p>
                    <div className="flex items-center gap-3 mt-3">
                      <div className="flex-1 px-3 py-2 bg-theme-surface border border-theme rounded-lg text-sm">
                        {thumbnailFolderPath || <span className="text-theme-tertiary">No folder selected</span>}
                      </div>
                      <button
                        onClick={() => setShowThumbnailFolderPicker(true)}
                        className="px-4 py-2 text-sm bg-accent text-white rounded-lg hover:bg-accent-hover"
                      >
                        Browse OneDrive
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Folder Picker Modal */}
              {showThumbnailFolderPicker && (
                <FolderPicker
                  onClose={() => setShowThumbnailFolderPicker(false)}
                  skipSave={true}
                  onSelect={async (selectedFolder) => {
                    console.log('Folder selected:', selectedFolder)
                    const folderId = selectedFolder.id
                    const folderPath = selectedFolder.path
                    
                    setThumbnailFolderId(folderId)
                    setThumbnailFolderPath(folderPath)
                    setShowThumbnailFolderPicker(false)
                    
                    // Save to user profile
                    try {
                      const token = (await supabase.auth.getSession()).data.session?.access_token
                      const response = await fetch('/.netlify/functions/thumbnail-folder', {
                        method: 'POST',
                        headers: {
                          'Authorization': `Bearer ${token}`,
                          'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ 
                          folder_id: folderId,
                          folder_path: folderPath 
                        })
                      })
                      const result = await response.json()
                      console.log('Save result:', result)
                    } catch (err) {
                      console.error('Failed to save folder:', err)
                    }
                  }}
                />
              )}

              {/* Templates Grid */}
              {isLoadingTemplates ? (
                <div className="flex items-center justify-center py-12">
                  <Loader className="w-8 h-8 animate-spin text-accent" />
                </div>
              ) : thumbnailTemplates.length === 0 ? (
                <div className="text-center py-12 bg-theme-surface rounded-lg border border-theme">
                  <ImagePlus className="w-12 h-12 mx-auto text-theme-tertiary mb-4" />
                  <h4 className="text-lg font-medium text-theme-primary mb-2">No templates yet</h4>
                  <p className="text-theme-secondary mb-4">
                    Create your first thumbnail template to auto-generate thumbnails for your videos.
                  </p>
                  <button
                    onClick={() => {
                      setEditingTemplate(null)
                      setShowTemplateModal(true)
                    }}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent-hover"
                  >
                    <Plus className="w-4 h-4" />
                    Create Template
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {thumbnailTemplates.map((template) => (
                    <div
                      key={template.id}
                      className="bg-theme-surface rounded-lg border border-theme overflow-hidden group"
                    >
                      {/* Template Preview */}
                      <div className="relative aspect-video bg-theme-hover">
                        {template.template_url ? (
                          <img
                            src={template.template_url}
                            alt={template.owner_name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <ImagePlus className="w-8 h-8 text-theme-tertiary" />
                          </div>
                        )}
                        {/* Zone Overlay */}
                        {template.placement_zone && (
                          <div
                            className="absolute border-2 border-accent border-dashed bg-accent/20"
                            style={{
                              left: `${template.placement_zone.x}%`,
                              top: `${template.placement_zone.y}%`,
                              width: `${template.placement_zone.width}%`,
                              height: `${template.placement_zone.height}%`
                            }}
                          />
                        )}
                      </div>

                      {/* Template Info */}
                      <div className="p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="font-medium text-theme-primary">
                              {template.owner_name || crmOwners.find(o => o.id === template.owner_id)?.name || 'Unknown Owner'}
                            </h4>
                            <p className="text-xs text-theme-tertiary mt-1">
                              Zone: {template.placement_zone ? 
                                `${Math.round(template.placement_zone.width)}% × ${Math.round(template.placement_zone.height)}%` : 
                                'Not set'}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => {
                                setEditingTemplate(template)
                                setShowTemplateModal(true)
                              }}
                              className="p-2 text-theme-secondary hover:text-accent hover:bg-accent/10 rounded-lg transition-colors"
                              title="Edit template"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setDeletingTemplateId(template.id)}
                              className="p-2 text-theme-secondary hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                              title="Delete template"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Delete Confirmation */}
                      {deletingTemplateId === template.id && (
                        <div className="px-4 pb-4">
                          <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                            <span className="text-sm text-red-500 flex-1">Delete this template?</span>
                            <button
                              onClick={() => deleteTemplateMutation.mutate(template.id)}
                              className="px-3 py-1 bg-red-500 text-white text-sm rounded hover:bg-red-600"
                            >
                              Yes
                            </button>
                            <button
                              onClick={() => setDeletingTemplateId(null)}
                              className="px-3 py-1 bg-theme-hover text-theme-secondary text-sm rounded hover:bg-theme-border"
                            >
                              No
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Thumbnail Template Modal */}
      {showTemplateModal && (
        <ThumbnailTemplateModal
          existingTemplate={editingTemplate}
          crmOwners={ownersWithTemplateInfo}
          onClose={() => {
            setShowTemplateModal(false)
            setEditingTemplate(null)
          }}
          onSave={async (templateData) => {
            try {
              const token = (await supabase.auth.getSession()).data.session?.access_token
              const method = templateData.id ? 'PUT' : 'POST'
              const url = templateData.id 
                ? `/.netlify/functions/thumbnail-templates?id=${templateData.id}`
                : '/.netlify/functions/thumbnail-templates'
              
              const response = await fetch(url, {
                method,
                headers: { 
                  Authorization: `Bearer ${token}`,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify(templateData)
              })
              
              if (!response.ok) throw new Error('Failed to save template')
              
              refetchTemplates()
              setShowTemplateModal(false)
              setEditingTemplate(null)
            } catch (error) {
              console.error('Save template error:', error)
            }
          }}
        />
      )}
    </div>
  )
}

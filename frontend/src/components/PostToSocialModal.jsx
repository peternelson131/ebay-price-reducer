import { useState, useEffect, useRef } from 'react';
import { X, Youtube, Instagram, Facebook, XCircle, Loader, Clock, Zap, Calendar } from 'lucide-react';
import { toast } from 'react-toastify';
import { userAPI } from '../lib/supabase';

/**
 * PostToSocialModal Component
 * Modal for creating and scheduling social media posts
 * Supports Instagram Reels and YouTube Shorts
 */
export default function PostToSocialModal({ video, onClose, onSuccess }) {
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const isSubmittingRef = useRef(false); // Prevent double submission
  const [connectedAccounts, setConnectedAccounts] = useState([]);
  const [selectedPlatforms, setSelectedPlatforms] = useState([]);
  const [caption, setCaption] = useState('');
  const [postNow, setPostNow] = useState(true);
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [error, setError] = useState(null);

  // Character limits per platform
  const CHARACTER_LIMITS = {
    instagram: 2200,
    youtube: 5000,
    facebook: 63206
  };

  useEffect(() => {
    fetchConnectedAccounts();
    // Set default scheduled time to 1 hour from now
    const now = new Date();
    now.setHours(now.getHours() + 1);
    setScheduledDate(now.toISOString().split('T')[0]);
    setScheduledTime(now.toTimeString().slice(0, 5));
  }, []);

  const fetchConnectedAccounts = async () => {
    try {
      setLoading(true);
      const token = await userAPI.getAuthToken();

      // Use only the new social-accounts-list API
      const response = await fetch('/.netlify/functions/social-accounts-list', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch social accounts');
      }

      const data = await response.json();
      let accounts = (data.accounts || []).filter(acc => 
        (acc.platform === 'instagram' || acc.platform === 'youtube') && acc.isActive
      );
      
      // If Instagram is connected, also add Facebook as available (same Meta OAuth)
      const instagramAccount = accounts.find(acc => acc.platform === 'instagram');
      if (instagramAccount) {
        accounts.push({
          ...instagramAccount,
          id: `${instagramAccount.id}-facebook`,
          platform: 'facebook',
          username: `${instagramAccount.username} (Page)`
        });
      }
      
      setConnectedAccounts(accounts);
      
      // Auto-select all connected platforms
      setSelectedPlatforms(accounts.map(acc => acc.platform));
      
    } catch (error) {
      console.error('Error fetching connected accounts:', error);
      toast.error('Failed to load connected accounts');
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleTogglePlatform = (platform) => {
    setSelectedPlatforms(prev => {
      if (prev.includes(platform)) {
        return prev.filter(p => p !== platform);
      } else {
        return [...prev, platform];
      }
    });
  };

  const getMaxCharacterLimit = () => {
    if (selectedPlatforms.length === 0) return 0;
    
    // Return the minimum limit among selected platforms
    const limits = selectedPlatforms.map(p => CHARACTER_LIMITS[p] || 0);
    return Math.min(...limits);
  };

  const validateForm = () => {
    // Check if at least one platform is selected
    if (selectedPlatforms.length === 0) {
      setError('Please select at least one platform');
      return false;
    }

    // Check caption length
    const maxLimit = getMaxCharacterLimit();
    if (caption.length > maxLimit) {
      setError(`Caption exceeds maximum length of ${maxLimit} characters`);
      return false;
    }

    // Check scheduling if not posting now
    if (!postNow) {
      if (!scheduledDate || !scheduledTime) {
        setError('Please select a date and time for scheduling');
        return false;
      }

      const scheduledDateTime = new Date(`${scheduledDate}T${scheduledTime}`);
      if (scheduledDateTime <= new Date()) {
        setError('Scheduled time must be in the future');
        return false;
      }
    }

    return true;
  };

  const handleSubmit = async () => {
    // Prevent double submission
    if (isSubmittingRef.current || posting) {
      console.log('Submission already in progress, ignoring');
      return;
    }
    isSubmittingRef.current = true;
    
    setError(null);

    if (!validateForm()) {
      isSubmittingRef.current = false;
      return;
    }

    setPosting(true);

    try {
      const token = await userAPI.getAuthToken();
      
      // Prepare request body
      const requestBody = {
        videoId: video.id,
        caption: caption.trim(),
        platforms: selectedPlatforms
      };

      // Add scheduled time if not posting now
      if (!postNow) {
        requestBody.scheduledAt = new Date(`${scheduledDate}T${scheduledTime}`).toISOString();
      }

      // Create the post
      const createResponse = await fetch('/.netlify/functions/social-posts-create', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      if (!createResponse.ok) {
        const errorData = await createResponse.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to create post');
      }

      const createData = await createResponse.json();
      const postId = createData.post?.id;

      // If posting now, trigger immediate publishing
      if (postNow && postId) {
        const publishResponse = await fetch(`/.netlify/functions/social-posts-publish-now?id=${postId}`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        if (!publishResponse.ok) {
          const errorData = await publishResponse.json().catch(() => ({}));
          throw new Error(errorData.error || 'Failed to publish post');
        }

        toast.success('Post queued for immediate publishing! Processing in background.');
      } else {
        const scheduledDateTime = new Date(`${scheduledDate}T${scheduledTime}`);
        toast.success(`Post scheduled for ${scheduledDateTime.toLocaleString()}!`);
      }

      // Notify parent to refresh
      if (onSuccess) {
        onSuccess();
      }

      // Close modal after brief delay
      setTimeout(() => {
        onClose();
      }, 500);

    } catch (error) {
      console.error('Error creating post:', error);
      setError(error.message);
      toast.error(`Failed to create post: ${error.message}`);
    } finally {
      setPosting(false);
      isSubmittingRef.current = false;
    }
  };

  const getPlatformIcon = (platform) => {
    switch (platform) {
      case 'youtube': return Youtube;
      case 'instagram': return Instagram;
      case 'facebook': return Facebook;
      default: return null;
    }
  };

  const getPlatformColor = (platform) => {
    switch (platform) {
      case 'youtube': return 'text-red-600 dark:text-red-400';
      case 'instagram': return 'text-pink-600 dark:text-pink-400';
      case 'facebook': return 'text-[#1877F2] dark:text-[#1877F2]';
      default: return 'text-gray-600 dark:text-gray-400';
    }
  };

  const currentCharLimit = getMaxCharacterLimit();
  const charsRemaining = currentCharLimit - caption.length;
  const isOverLimit = charsRemaining < 0;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-theme-primary rounded-lg max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h3 className="text-lg font-semibold text-theme-primary">
              Post to Social Media
            </h3>
            <p className="text-sm text-theme-secondary mt-1">
              {video.filename || video.title || 'Video'}
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={posting}
            className="text-theme-tertiary hover:text-theme-primary transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Loading State */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader className="w-6 h-6 animate-spin text-accent" />
          </div>
        ) : (
          <>
            {/* No Connected Accounts */}
            {connectedAccounts.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-4xl mb-4">🔗</div>
                <h4 className="text-lg font-medium text-theme-primary mb-2">
                  No Connected Accounts
                </h4>
                <p className="text-sm text-theme-secondary mb-4">
                  Connect your Instagram or YouTube account to start posting
                </p>
                <button
                  onClick={onClose}
                  className="text-sm text-accent hover:underline"
                >
                  Go to Settings to connect accounts
                </button>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Platform Selection */}
                <div>
                  <label className="block text-sm font-medium text-theme-primary mb-3">
                    Select Platforms
                  </label>
                  <div className="space-y-2">
                    {connectedAccounts.map((account) => {
                      const Icon = getPlatformIcon(account.platform);
                      const colorClass = getPlatformColor(account.platform);
                      const isSelected = selectedPlatforms.includes(account.platform);

                      return (
                        <label
                          key={account.id}
                          className={`flex items-center gap-3 p-3 rounded-lg border transition-colors cursor-pointer ${
                            isSelected
                              ? 'border-accent bg-accent/10'
                              : 'border-theme hover:border-accent/50'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            disabled={posting}
                            onChange={() => handleTogglePlatform(account.platform)}
                            className="w-4 h-4 rounded accent-accent disabled:opacity-50"
                          />
                          <Icon className={`w-5 h-5 ${colorClass}`} />
                          <div className="flex-1">
                            <span className="text-theme-primary font-medium capitalize">
                              {account.platform}
                            </span>
                            <span className="ml-2 text-xs text-theme-tertiary">
                              ({account.username})
                            </span>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* Caption */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-theme-primary">
                      Caption
                    </label>
                    {selectedPlatforms.length > 0 && (
                      <span className={`text-xs ${
                        isOverLimit ? 'text-red-500 font-medium' : 'text-theme-tertiary'
                      }`}>
                        {charsRemaining} characters remaining
                      </span>
                    )}
                  </div>
                  <textarea
                    value={caption}
                    onChange={(e) => setCaption(e.target.value)}
                    disabled={posting}
                    placeholder="Write a caption for your post..."
                    rows={4}
                    className={`w-full px-3 py-2 border rounded-lg bg-theme-primary text-theme-primary placeholder-theme-tertiary focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50 ${
                      isOverLimit ? 'border-red-500' : 'border-theme'
                    }`}
                  />
                  {selectedPlatforms.length > 0 && (
                    <p className="text-xs text-theme-tertiary mt-1">
                      Character limit: {currentCharLimit}
                      {selectedPlatforms.length > 1 && ' (minimum among selected platforms)'}
                    </p>
                  )}
                </div>

                {/* Post Now vs Schedule Toggle */}
                <div>
                  <label className="block text-sm font-medium text-theme-primary mb-3">
                    Publishing Options
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setPostNow(true)}
                      disabled={posting}
                      className={`flex items-center justify-center gap-2 p-3 rounded-lg border transition-colors ${
                        postNow
                          ? 'border-accent bg-accent/10 text-accent'
                          : 'border-theme text-theme-secondary hover:border-accent/50'
                      }`}
                    >
                      <Zap className="w-4 h-4" />
                      <span className="font-medium">Post Now</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setPostNow(false)}
                      disabled={posting}
                      className={`flex items-center justify-center gap-2 p-3 rounded-lg border transition-colors ${
                        !postNow
                          ? 'border-accent bg-accent/10 text-accent'
                          : 'border-theme text-theme-secondary hover:border-accent/50'
                      }`}
                    >
                      <Clock className="w-4 h-4" />
                      <span className="font-medium">Schedule</span>
                    </button>
                  </div>
                </div>

                {/* Date/Time Picker (shown when scheduling) */}
                {!postNow && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-theme-primary mb-2">
                        Date
                      </label>
                      <div className="relative">
                        <input
                          type="date"
                          value={scheduledDate}
                          onChange={(e) => setScheduledDate(e.target.value)}
                          disabled={posting}
                          min={new Date().toISOString().split('T')[0]}
                          className="w-full px-3 py-2 border border-theme rounded-lg bg-theme-primary text-theme-primary focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50"
                        />
                        <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-theme-tertiary pointer-events-none" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-theme-primary mb-2">
                        Time
                      </label>
                      <div className="relative">
                        <input
                          type="time"
                          value={scheduledTime}
                          onChange={(e) => setScheduledTime(e.target.value)}
                          disabled={posting}
                          className="w-full px-3 py-2 border border-theme rounded-lg bg-theme-primary text-theme-primary focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50"
                        />
                        <Clock className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-theme-tertiary pointer-events-none" />
                      </div>
                    </div>
                  </div>
                )}

                {/* Error Display */}
                {error && (
                  <div className="p-4 rounded-lg border border-red-500/30 bg-red-500/10">
                    <div className="flex items-center gap-3">
                      <XCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-theme-primary">
                          Error
                        </p>
                        <p className="text-xs text-red-500 mt-1">
                          {error}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex justify-end gap-3 pt-4 border-t border-theme">
                  <button
                    onClick={onClose}
                    disabled={posting}
                    className="px-4 py-2 text-sm text-theme-secondary hover:text-theme-primary transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSubmit}
                    disabled={posting || selectedPlatforms.length === 0 || isOverLimit}
                    className="px-6 py-2 text-sm bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {posting ? (
                      <>
                        <Loader className="w-4 h-4 animate-spin" />
                        {postNow ? 'Publishing...' : 'Scheduling...'}
                      </>
                    ) : (
                      <>
                        {postNow ? (
                          <>
                            <Zap className="w-4 h-4" />
                            Post Now
                          </>
                        ) : (
                          <>
                            <Clock className="w-4 h-4" />
                            Schedule Post
                          </>
                        )}
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

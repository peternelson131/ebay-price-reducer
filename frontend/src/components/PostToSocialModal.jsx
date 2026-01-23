import { useState, useEffect } from 'react';
import { X, Youtube, Facebook, Instagram, XCircle, Loader } from 'lucide-react';
import { toast } from 'react-toastify';
import { userAPI } from '../lib/supabase';

/**
 * PostToSocialModal Component
 * Modal for manually posting videos to social media platforms
 * Uses optimistic UI - closes immediately after job creation
 */
export default function PostToSocialModal({ video, onClose, onSuccess }) {
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [platformStatuses, setPlatformStatuses] = useState({
    youtube: { connected: false, checked: false },
    facebook: { connected: false, checked: false },
    instagram: { connected: false, checked: false }
  });
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchConnectionStatuses();
  }, []);

  const fetchConnectionStatuses = async () => {
    try {
      setLoading(true);
      const token = await userAPI.getAuthToken();

      // Fetch YouTube status
      const youtubeResponse = await fetch('/.netlify/functions/youtube-status', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const youtubeData = await youtubeResponse.json();

      // Fetch Meta (Facebook/Instagram) status
      const metaResponse = await fetch('/.netlify/functions/meta-status', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const metaData = await metaResponse.json();

      setPlatformStatuses({
        youtube: {
          connected: youtubeData.connected || false,
          checked: youtubeData.connected || false
        },
        facebook: {
          connected: metaData.connected && metaData.connection?.pageName ? true : false,
          checked: metaData.connected && metaData.connection?.pageName ? true : false
        },
        instagram: {
          connected: metaData.connected && metaData.connection?.instagramUsername ? true : false,
          checked: metaData.connected && metaData.connection?.instagramUsername ? true : false
        }
      });
    } catch (error) {
      console.error('Error fetching connection statuses:', error);
      toast.error('Failed to load platform connection statuses');
    } finally {
      setLoading(false);
    }
  };

  const handleTogglePlatform = (platform) => {
    if (!platformStatuses[platform].connected) return; // Can't toggle disconnected platforms
    
    setPlatformStatuses(prev => ({
      ...prev,
      [platform]: {
        ...prev[platform],
        checked: !prev[platform].checked
      }
    }));
  };

  const handlePost = async () => {
    const selectedPlatforms = Object.entries(platformStatuses)
      .filter(([_, status]) => status.checked)
      .map(([platform]) => platform);

    if (selectedPlatforms.length === 0) {
      toast.error('Please select at least one platform to post to');
      return;
    }

    setPosting(true);
    setError(null);

    try {
      const token = await userAPI.getAuthToken();
      
      const response = await fetch('/.netlify/functions/social-post', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          videoId: video.id,
          platforms: selectedPlatforms
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to create post job');
      }

      // OPTIMISTIC UI: Close modal immediately after job creation
      // Background function handles the actual posting
      toast.success('Post queued! Processing in background.');
      
      // Notify parent to refresh video list
      if (onSuccess) {
        onSuccess();
      }
      
      // Close modal after brief delay to show success message
      setTimeout(() => {
        onClose();
      }, 500);
      
    } catch (error) {
      console.error('Error posting to social media:', error);
      setError(error.message);
      toast.error(`Failed to queue post: ${error.message}`);
      setPosting(false);
    }
  };

  const getPlatformIcon = (platform) => {
    switch (platform) {
      case 'youtube': return Youtube;
      case 'facebook': return Facebook;
      case 'instagram': return Instagram;
      default: return null;
    }
  };

  const getPlatformColor = (platform) => {
    switch (platform) {
      case 'youtube': return 'text-red-600 dark:text-red-400';
      case 'facebook': return 'text-blue-600 dark:text-blue-400';
      case 'instagram': return 'text-pink-600 dark:text-pink-400';
      default: return 'text-gray-600 dark:text-gray-400';
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-theme-primary rounded-lg max-w-lg w-full p-6">
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h3 className="text-lg font-semibold text-theme-primary">
              Post to Social Media
            </h3>
            <p className="text-sm text-theme-secondary mt-1">
              {video.filename}
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

        {/* Platform Selection */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader className="w-6 h-6 animate-spin text-accent" />
          </div>
        ) : (
          <>
            <div className="space-y-3 mb-6">
              {Object.entries(platformStatuses).map(([platform, status]) => {
                const Icon = getPlatformIcon(platform);
                const colorClass = getPlatformColor(platform);
                
                return (
                  <label
                    key={platform}
                    className={`flex items-center gap-3 p-3 rounded-lg border transition-colors cursor-pointer ${
                      status.connected
                        ? status.checked
                          ? 'border-accent bg-accent/10'
                          : 'border-theme hover:border-accent/50'
                        : 'border-theme bg-theme-surface opacity-50 cursor-not-allowed'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={status.checked}
                      disabled={!status.connected || posting}
                      onChange={() => handleTogglePlatform(platform)}
                      className="w-4 h-4 rounded accent-accent disabled:opacity-50"
                    />
                    <Icon className={`w-5 h-5 ${colorClass}`} />
                    <div className="flex-1">
                      <span className="text-theme-primary font-medium capitalize">
                        {platform}
                      </span>
                      {!status.connected && (
                        <span className="ml-2 text-xs text-theme-tertiary">
                          (Not connected)
                        </span>
                      )}
                    </div>
                  </label>
                );
              })}
            </div>

            {/* Error Display */}
            {error && (
              <div className="mb-6 p-4 rounded-lg border border-red-500/30 bg-red-500/10">
                <div className="flex items-center gap-3">
                  <XCircle className="w-5 h-5 text-red-500" />
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
            <div className="flex justify-end gap-3">
              <button
                onClick={onClose}
                disabled={posting}
                className="px-4 py-2 text-sm text-theme-secondary hover:text-theme-primary transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handlePost}
                disabled={posting || Object.values(platformStatuses).every(s => !s.checked)}
                className="px-4 py-2 text-sm bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {posting ? (
                  <>
                    <Loader className="w-4 h-4 animate-spin" />
                    Posting...
                  </>
                ) : (
                  'Post Now'
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

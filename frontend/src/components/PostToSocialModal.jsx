import { useState, useEffect } from 'react';
import { X, Youtube, Facebook, Instagram, CheckCircle, XCircle, Loader, ExternalLink } from 'lucide-react';
import { toast } from 'react-toastify';
import { userAPI } from '../lib/supabase';

/**
 * PostToSocialModal Component
 * Modal for manually posting videos to social media platforms
 */
export default function PostToSocialModal({ video, onClose, onSuccess }) {
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [platformStatuses, setPlatformStatuses] = useState({
    youtube: { connected: false, checked: false },
    facebook: { connected: false, checked: false },
    instagram: { connected: false, checked: false }
  });
  const [results, setResults] = useState(null);
  
  // Async job polling state
  const [jobId, setJobId] = useState(null);
  const [jobStatus, setJobStatus] = useState(null); // pending, processing, completed, failed
  const [polling, setPolling] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchConnectionStatuses();
  }, []);

  // Polling effect for async job status
  useEffect(() => {
    if (!polling || !jobId) return;

    const pollInterval = setInterval(async () => {
      try {
        const token = await userAPI.getAuthToken();
        const res = await fetch(`/.netlify/functions/social-post-status?jobId=${jobId}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!res.ok) {
          throw new Error('Failed to fetch job status');
        }

        const job = await res.json();
        setJobStatus(job.status);

        if (job.status === 'completed') {
          handleJobCompletion(job);
        } else if (job.status === 'failed') {
          setError(job.error || 'Job failed');
          setPosting(false);
          setPolling(false);
          toast.error(job.error || 'Failed to post to social media');
        }
      } catch (err) {
        console.error('Error polling job status:', err);
        setError(err.message);
        setPosting(false);
        setPolling(false);
        toast.error(`Failed to check job status: ${err.message}`);
      }
    }, 3000); // Poll every 3 seconds

    return () => clearInterval(pollInterval);
  }, [polling, jobId]);

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
    setResults(null);
    setError(null);
    setJobStatus('starting');

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
        throw new Error('Failed to start social media post');
      }

      const data = await response.json();
      
      // If backend returns a jobId, start polling
      if (data.jobId) {
        setJobId(data.jobId);
        setJobStatus('pending');
        setPolling(true);
        toast.info('Job queued - processing in background...');
      } else if (data.results) {
        // Legacy synchronous response - handle immediately
        handleJobCompletion(data);
      }
    } catch (error) {
      console.error('Error posting to social media:', error);
      toast.error(`Failed to post: ${error.message}`);
      setPosting(false);
      setJobStatus(null);
    }
  };

  const handleJobCompletion = (data) => {
    // Convert results object to array if needed
    let resultsArray = data.results;
    if (data.results && !Array.isArray(data.results)) {
      resultsArray = Object.entries(data.results).map(([platform, result]) => ({
        platform,
        ...result
      }));
    }
    
    setResults(resultsArray);
    setPosting(false);
    setPolling(false);
    setJobStatus('completed');

    // Check if any posts succeeded
    const hasSuccess = resultsArray && resultsArray.some(r => r.success);
    const hasFailure = resultsArray && resultsArray.some(r => !r.success);

    if (hasSuccess && !hasFailure) {
      toast.success('Posted to all selected platforms successfully!');
      if (onSuccess) onSuccess();
    } else if (hasSuccess && hasFailure) {
      toast.warning('Posted to some platforms, but some failed');
    } else {
      toast.error('Failed to post to all platforms');
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

  const getProgressMessage = (status) => {
    switch (status) {
      case 'starting': return 'Starting...';
      case 'pending': return 'Queued - waiting to process...';
      case 'processing': return 'Processing video...';
      case 'downloading': return 'Downloading video from OneDrive...';
      case 'transcoding': return 'Transcoding video for Instagram...';
      case 'uploading': return 'Uploading to platforms...';
      case 'completed': return 'Complete!';
      case 'failed': return 'Failed';
      default: return 'Processing...';
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
            className="text-theme-tertiary hover:text-theme-primary transition-colors"
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
                      disabled={!status.connected}
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

            {/* Progress Indicator */}
            {posting && jobStatus && jobStatus !== 'completed' && !results && (
              <div className="mb-6 p-4 rounded-lg border border-accent bg-accent/10">
                <div className="flex items-center gap-3">
                  <Loader className="w-5 h-5 animate-spin text-accent" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-theme-primary">
                      {getProgressMessage(jobStatus)}
                    </p>
                    {jobId && (
                      <p className="text-xs text-theme-tertiary mt-1">
                        Job ID: {jobId}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Error Display */}
            {error && !results && (
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

            {/* Results Display */}
            {results && (
              <div className="mb-6 space-y-2">
                <h4 className="text-sm font-medium text-theme-primary">Results:</h4>
                {results.map((result, index) => {
                  const Icon = getPlatformIcon(result.platform);
                  const StatusIcon = result.success ? CheckCircle : XCircle;
                  
                  return (
                    <div
                      key={index}
                      className={`flex items-center gap-3 p-3 rounded-lg border ${
                        result.success
                          ? 'border-green-500/30 bg-green-500/10'
                          : 'border-red-500/30 bg-red-500/10'
                      }`}
                    >
                      <Icon className={`w-5 h-5 ${getPlatformColor(result.platform)}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <StatusIcon className={`w-4 h-4 ${
                            result.success ? 'text-green-500' : 'text-red-500'
                          }`} />
                          <span className="text-sm font-medium capitalize text-theme-primary">
                            {result.platform}
                          </span>
                        </div>
                        {result.success && result.url && (
                          <a
                            href={result.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-accent hover:text-accent-hover flex items-center gap-1 mt-1"
                          >
                            View post <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                        {!result.success && result.error && (
                          <p className="text-xs text-red-500 mt-1">
                            {result.error}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-3">
              <button
                onClick={onClose}
                disabled={posting}
                className="px-4 py-2 text-sm text-theme-secondary hover:text-theme-primary transition-colors disabled:opacity-50"
              >
                {results ? 'Close' : 'Cancel'}
              </button>
              {!results && (
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
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

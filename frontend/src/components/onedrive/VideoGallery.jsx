import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { userAPI } from '../../lib/supabase';
import { Film, Play, Trash2, X, RefreshCw, ExternalLink, Download } from 'lucide-react';

/**
 * VideoGallery Component
 * Displays a grid of product videos with preview and delete functionality
 */
export default function VideoGallery({ productId, onVideoDeleted }) {
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedVideo, setSelectedVideo] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletingVideoId, setDeletingVideoId] = useState(null);

  useEffect(() => {
    if (productId) {
      fetchVideos();
    }
  }, [productId]);

  const fetchVideos = async () => {
    try {
      setLoading(true);
      const token = await userAPI.getAuthToken();
      
      const response = await fetch(`/.netlify/functions/videos?productId=${productId}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch videos');
      }

      const data = await response.json();
      setVideos(data.videos || []);
    } catch (error) {
      console.error('Error fetching videos:', error);
      toast.error('Failed to load videos');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (videoId) => {
    setDeletingVideoId(videoId);

    try {
      const token = await userAPI.getAuthToken();
      
      const response = await fetch(`/.netlify/functions/videos?videoId=${videoId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to delete video');
      }

      toast.success('Video deleted successfully');
      
      // Remove from local state
      setVideos(prev => prev.filter(v => v.id !== videoId));
      
      // Notify parent
      if (onVideoDeleted) {
        onVideoDeleted();
      }
      
      setShowDeleteModal(false);
      setSelectedVideo(null);
    } catch (error) {
      console.error('Error deleting video:', error);
      toast.error(`Failed to delete video: ${error.message}`);
    } finally {
      setDeletingVideoId(null);
    }
  };

  const handleOpenVideo = async (video) => {
    try {
      const token = await userAPI.getAuthToken();
      
      // Get streaming URL from backend
      const response = await fetch(`/.netlify/functions/videos?videoId=${video.id}&action=stream`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to get video URL');
      }

      const data = await response.json();
      
      setSelectedVideo({
        ...video,
        streamUrl: data.streamUrl
      });
    } catch (error) {
      console.error('Error opening video:', error);
      toast.error('Failed to load video');
    }
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return 'Unknown size';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Unknown date';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="w-6 h-6 animate-spin text-ebay-blue" />
      </div>
    );
  }

  if (videos.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="flex justify-center mb-4">
          <div className="p-4 bg-gray-100 dark:bg-gray-800 rounded-full">
            <Film className="w-8 h-8 text-gray-400" />
          </div>
        </div>
        <h3 className="text-lg font-medium text-theme-primary mb-2">
          No videos yet
        </h3>
        <p className="text-sm text-theme-secondary">
          Upload a video to get started
        </p>
      </div>
    );
  }

  return (
    <>
      {/* Video Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {videos.map((video) => (
          <div
            key={video.id}
            className="border border-theme rounded-lg overflow-hidden hover:shadow-lg transition-shadow"
          >
            {/* Thumbnail */}
            <div
              onClick={() => handleOpenVideo(video)}
              className="relative bg-gray-900 aspect-video flex items-center justify-center cursor-pointer group"
            >
              {/* Placeholder - could be replaced with actual video thumbnail */}
              <div className="absolute inset-0 bg-gradient-to-br from-gray-800 to-gray-900 flex items-center justify-center">
                <Film className="w-12 h-12 text-gray-600" />
              </div>
              
              {/* Play Button Overlay */}
              <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-30 transition-all flex items-center justify-center">
                <div className="bg-white bg-opacity-90 rounded-full p-3 transform scale-0 group-hover:scale-100 transition-transform">
                  <Play className="w-6 h-6 text-gray-900" />
                </div>
              </div>
            </div>

            {/* Video Info */}
            <div className="p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-theme-primary truncate" title={video.file_name}>
                    {video.file_name}
                  </p>
                  <div className="flex items-center gap-2 mt-1 text-xs text-theme-tertiary">
                    <span>{formatFileSize(video.file_size)}</span>
                    <span>•</span>
                    <span>{formatDate(video.created_at)}</span>
                  </div>
                </div>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedVideo(video);
                    setShowDeleteModal(true);
                  }}
                  className="text-theme-tertiary hover:text-red-600 dark:hover:text-red-400 transition-colors"
                  title="Delete video"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Video Preview Modal */}
      {selectedVideo && !showDeleteModal && (
        <div className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50 p-4">
          <div className="relative max-w-5xl w-full">
            {/* Close Button */}
            <button
              onClick={() => setSelectedVideo(null)}
              className="absolute -top-12 right-0 text-white hover:text-gray-300 transition-colors"
            >
              <X className="w-8 h-8" />
            </button>

            {/* Video Player */}
            <div className="bg-black rounded-lg overflow-hidden">
              {selectedVideo.streamUrl ? (
                <video
                  controls
                  autoPlay
                  className="w-full max-h-[80vh]"
                  src={selectedVideo.streamUrl}
                >
                  Your browser does not support the video tag.
                </video>
              ) : (
                <div className="aspect-video flex items-center justify-center">
                  <RefreshCw className="w-8 h-8 animate-spin text-white" />
                </div>
              )}
            </div>

            {/* Video Info */}
            <div className="mt-4 text-white">
              <h3 className="text-lg font-medium">{selectedVideo.file_name}</h3>
              <div className="flex items-center gap-4 mt-2 text-sm text-gray-300">
                <span>{formatFileSize(selectedVideo.file_size)}</span>
                <span>•</span>
                <span>Uploaded {formatDate(selectedVideo.created_at)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && selectedVideo && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-theme-primary mb-4">
              Delete Video?
            </h3>
            <p className="text-sm text-theme-secondary mb-2">
              Are you sure you want to delete this video?
            </p>
            <p className="text-sm font-medium text-theme-primary mb-6 break-words">
              {selectedVideo.file_name}
            </p>
            <p className="text-xs text-orange-600 dark:text-orange-400 mb-6">
              This will remove the video from OneDrive and cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setSelectedVideo(null);
                }}
                disabled={deletingVideoId}
                className="px-4 py-2 text-sm text-theme-secondary hover:text-theme-primary transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(selectedVideo.id)}
                disabled={deletingVideoId}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {deletingVideoId ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    Delete
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

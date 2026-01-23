import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { userAPI } from '../lib/supabase';
import PostToSocialModal from '../components/PostToSocialModal';
import { 
  Youtube, 
  Instagram, 
  Loader, 
  Trash2, 
  Edit, 
  Zap, 
  Clock, 
  CheckCircle, 
  XCircle,
  Calendar,
  RefreshCw,
  Plus,
  Filter
} from 'lucide-react';

/**
 * SocialPosts Page
 * View and manage all social media posts
 */
export default function SocialPosts() {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all');
  const [editingPost, setEditingPost] = useState(null);
  const [deletingPostId, setDeletingPostId] = useState(null);
  const [publishingPostId, setPublishingPostId] = useState(null);

  const tabs = [
    { id: 'all', label: 'All Posts', icon: Filter },
    { id: 'scheduled', label: 'Scheduled', icon: Clock },
    { id: 'posted', label: 'Posted', icon: CheckCircle },
    { id: 'draft', label: 'Drafts', icon: Edit },
    { id: 'failed', label: 'Failed', icon: XCircle }
  ];

  useEffect(() => {
    fetchPosts();
  }, [activeTab]);

  const fetchPosts = async () => {
    try {
      setLoading(true);
      const token = await userAPI.getAuthToken();
      
      const statusParam = activeTab === 'all' ? '' : `?status=${activeTab}`;
      const response = await fetch(
        `/.netlify/functions/social-posts-list${statusParam}`,
        {
          headers: { 'Authorization': `Bearer ${token}` }
        }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch posts');
      }

      const data = await response.json();
      setPosts(data.posts || []);
    } catch (error) {
      console.error('Error fetching posts:', error);
      toast.error('Failed to load posts');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (postId) => {
    if (!confirm('Are you sure you want to delete this post? This cannot be undone.')) {
      return;
    }

    setDeletingPostId(postId);

    try {
      const token = await userAPI.getAuthToken();
      
      const response = await fetch(
        `/.netlify/functions/social-posts-delete?id=${postId}`,
        {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` }
        }
      );

      if (!response.ok) {
        throw new Error('Failed to delete post');
      }

      toast.success('Post deleted successfully');
      fetchPosts(); // Refresh list
    } catch (error) {
      console.error('Error deleting post:', error);
      toast.error(`Failed to delete post: ${error.message}`);
    } finally {
      setDeletingPostId(null);
    }
  };

  const handlePublishNow = async (postId) => {
    if (!confirm('Publish this post immediately?')) {
      return;
    }

    setPublishingPostId(postId);

    try {
      const token = await userAPI.getAuthToken();
      
      const response = await fetch(
        `/.netlify/functions/social-posts-publish-now?id=${postId}`,
        {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` }
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to publish post');
      }

      toast.success('Post queued for publishing! Processing in background.');
      fetchPosts(); // Refresh list
    } catch (error) {
      console.error('Error publishing post:', error);
      toast.error(`Failed to publish post: ${error.message}`);
    } finally {
      setPublishingPostId(null);
    }
  };

  const getPlatformIcon = (platform) => {
    switch (platform) {
      case 'youtube': return Youtube;
      case 'instagram': return Instagram;
      default: return null;
    }
  };

  const getStatusBadge = (status) => {
    const badges = {
      draft: { color: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-100', label: 'Draft' },
      scheduled: { color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100', label: 'Scheduled' },
      processing: { color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100', label: 'Processing' },
      posted: { color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100', label: 'Posted' },
      failed: { color: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100', label: 'Failed' }
    };

    const badge = badges[status] || badges.draft;
    return (
      <span className={`px-2 py-1 text-xs font-medium rounded ${badge.color}`}>
        {badge.label}
      </span>
    );
  };

  const truncateCaption = (caption, maxLength = 100) => {
    if (!caption) return '';
    if (caption.length <= maxLength) return caption;
    return caption.slice(0, maxLength) + '...';
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  const EmptyState = () => (
    <div className="text-center py-16">
      <div className="text-6xl mb-4">📱</div>
      <h3 className="text-lg font-medium text-theme-primary mb-2">
        {activeTab === 'all' ? 'No posts yet' : `No ${activeTab} posts`}
      </h3>
      <p className="text-sm text-theme-secondary mb-6">
        {activeTab === 'all' 
          ? 'Create your first social media post to get started'
          : `You don't have any ${activeTab} posts right now`
        }
      </p>
      {activeTab === 'all' && (
        <button
          onClick={() => window.location.href = '/product-crm'}
          className="inline-flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors"
        >
          <Plus className="w-4 h-4" />
          Go to Product CRM
        </button>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-theme-primary">Social Media Posts</h1>
          <p className="mt-1 text-sm text-theme-tertiary">
            View and manage your scheduled and posted content
          </p>
        </div>
        <button
          onClick={fetchPosts}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 border border-theme rounded-lg text-theme-secondary hover:text-theme-primary hover:border-accent transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className="border-b border-theme">
        <nav className="-mb-px flex space-x-6">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const count = activeTab === 'all' 
              ? posts.length 
              : posts.filter(p => p.status === tab.id).length;

            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 py-3 px-1 border-b-2 font-medium text-sm whitespace-nowrap transition-colors ${
                  activeTab === tab.id
                    ? 'border-accent text-accent'
                    : 'border-transparent text-theme-tertiary hover:text-theme-secondary hover:border-theme'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
                {count > 0 && activeTab !== 'all' && (
                  <span className="ml-1 px-2 py-0.5 text-xs bg-theme-surface rounded-full">
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Posts Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader className="w-8 h-8 animate-spin text-accent" />
        </div>
      ) : posts.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {posts.map((post) => {
            const isDeleting = deletingPostId === post.id;
            const isPublishing = publishingPostId === post.id;
            const canEdit = post.status === 'draft' || post.status === 'scheduled';
            const canPublish = post.status === 'draft' || post.status === 'scheduled';

            return (
              <div
                key={post.id}
                className="bg-theme-primary border border-theme rounded-lg overflow-hidden hover:border-accent transition-colors"
              >
                {/* Video Thumbnail */}
                {post.video?.thumbnailUrl ? (
                  <div className="aspect-video bg-theme-surface relative">
                    <img
                      src={post.video.thumbnailUrl}
                      alt={post.video.title || 'Video thumbnail'}
                      className="w-full h-full object-cover"
                    />
                    {/* Status Badge Overlay */}
                    <div className="absolute top-2 right-2">
                      {getStatusBadge(post.status)}
                    </div>
                  </div>
                ) : (
                  <div className="aspect-video bg-theme-surface flex items-center justify-center relative">
                    <div className="text-4xl">🎬</div>
                    <div className="absolute top-2 right-2">
                      {getStatusBadge(post.status)}
                    </div>
                  </div>
                )}

                {/* Content */}
                <div className="p-4 space-y-3">
                  {/* Video Title */}
                  {post.video?.title && (
                    <h3 className="font-medium text-theme-primary truncate">
                      {post.video.title}
                    </h3>
                  )}

                  {/* Caption Preview */}
                  {post.caption && (
                    <p className="text-sm text-theme-secondary line-clamp-2">
                      {truncateCaption(post.caption)}
                    </p>
                  )}

                  {/* Platforms */}
                  <div className="flex items-center gap-2">
                    {post.platforms?.map((platform) => {
                      const Icon = getPlatformIcon(platform);
                      const colorClass = platform === 'youtube' 
                        ? 'text-red-600' 
                        : 'text-pink-600';
                      
                      return Icon ? (
                        <div
                          key={platform}
                          className={`flex items-center gap-1 text-xs ${colorClass}`}
                        >
                          <Icon className="w-4 h-4" />
                          <span className="capitalize">{platform}</span>
                        </div>
                      ) : null;
                    })}
                  </div>

                  {/* Scheduled Time */}
                  {post.scheduledAt && post.status !== 'posted' && (
                    <div className="flex items-center gap-2 text-xs text-theme-tertiary">
                      <Calendar className="w-3 h-3" />
                      <span>{formatDate(post.scheduledAt)}</span>
                    </div>
                  )}

                  {/* Posted Time */}
                  {post.status === 'posted' && post.results?.length > 0 && (
                    <div className="flex items-center gap-2 text-xs text-green-600">
                      <CheckCircle className="w-3 h-3" />
                      <span>Posted {formatDate(post.results[0].postedAt)}</span>
                    </div>
                  )}

                  {/* Results */}
                  {post.results && post.results.length > 0 && (
                    <div className="space-y-1">
                      {post.results.map((result, idx) => (
                        <div
                          key={idx}
                          className={`text-xs flex items-center gap-2 ${
                            result.success ? 'text-green-600' : 'text-red-600'
                          }`}
                        >
                          {result.success ? (
                            <CheckCircle className="w-3 h-3" />
                          ) : (
                            <XCircle className="w-3 h-3" />
                          )}
                          <span className="capitalize">{result.platform}: </span>
                          {result.success ? (
                            result.platformPostUrl ? (
                              <a
                                href={result.platformPostUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="underline hover:no-underline"
                              >
                                View
                              </a>
                            ) : (
                              'Posted'
                            )
                          ) : (
                            <span className="text-xs">{result.error || 'Failed'}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex items-center gap-2 pt-2 border-t border-theme">
                    {canPublish && (
                      <button
                        onClick={() => handlePublishNow(post.id)}
                        disabled={isPublishing}
                        className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 text-xs bg-accent text-white rounded hover:bg-accent-hover transition-colors disabled:opacity-50"
                      >
                        {isPublishing ? (
                          <Loader className="w-3 h-3 animate-spin" />
                        ) : (
                          <Zap className="w-3 h-3" />
                        )}
                        Post Now
                      </button>
                    )}
                    
                    <button
                      onClick={() => handleDelete(post.id)}
                      disabled={isDeleting}
                      className="flex items-center justify-center gap-1 px-3 py-1.5 text-xs border border-red-500 text-red-500 rounded hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50"
                    >
                      {isDeleting ? (
                        <Loader className="w-3 h-3 animate-spin" />
                      ) : (
                        <Trash2 className="w-3 h-3" />
                      )}
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Edit Modal */}
      {editingPost && (
        <PostToSocialModal
          video={editingPost.video}
          initialData={{
            caption: editingPost.caption,
            platforms: editingPost.platforms,
            scheduledAt: editingPost.scheduledAt
          }}
          postId={editingPost.id}
          onClose={() => setEditingPost(null)}
          onSuccess={() => {
            setEditingPost(null);
            fetchPosts();
          }}
        />
      )}
    </div>
  );
}

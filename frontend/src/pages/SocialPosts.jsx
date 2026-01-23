import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { userAPI } from '../lib/supabase';
import PostToSocialModal from '../components/PostToSocialModal';
import ConfirmDialog from '../components/ConfirmDialog';
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
  
  // Confirm dialog state
  const [confirmDialog, setConfirmDialog] = useState({
    isOpen: false,
    type: null, // 'delete' or 'publish'
    postId: null
  });

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

  const handleDeleteClick = (postId) => {
    setConfirmDialog({
      isOpen: true,
      type: 'delete',
      postId
    });
  };

  const handleDelete = async () => {
    const postId = confirmDialog.postId;
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

  const handlePublishClick = (postId) => {
    setConfirmDialog({
      isOpen: true,
      type: 'publish',
      postId
    });
  };

  const handlePublishNow = async () => {
    const postId = confirmDialog.postId;
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

      {/* Posts List */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader className="w-8 h-8 animate-spin text-accent" />
        </div>
      ) : posts.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="bg-theme-primary border border-theme rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-theme-surface border-b border-theme">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-theme-tertiary uppercase tracking-wider">Video</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-theme-tertiary uppercase tracking-wider">Caption</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-theme-tertiary uppercase tracking-wider">Platforms</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-theme-tertiary uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-theme-tertiary uppercase tracking-wider">Date</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-theme-tertiary uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-theme">
              {posts.map((post) => {
                const isDeleting = deletingPostId === post.id;
                const isPublishing = publishingPostId === post.id;
                const canPublish = post.status === 'draft' || post.status === 'scheduled';

                return (
                  <tr key={post.id} className="hover:bg-theme-surface/50 transition-colors">
                    {/* Video */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {post.video?.thumbnailUrl ? (
                          <img
                            src={post.video.thumbnailUrl}
                            alt=""
                            className="w-16 h-10 object-cover rounded"
                          />
                        ) : (
                          <div className="w-16 h-10 bg-theme-surface rounded flex items-center justify-center text-lg">
                            🎬
                          </div>
                        )}
                        <span className="text-sm text-theme-primary font-medium truncate max-w-[150px]">
                          {post.video?.title || 'Untitled'}
                        </span>
                      </div>
                    </td>

                    {/* Caption */}
                    <td className="px-4 py-3">
                      <span className="text-sm text-theme-secondary truncate block max-w-[200px]">
                        {truncateCaption(post.caption, 50) || '-'}
                      </span>
                    </td>

                    {/* Platforms */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {post.platforms?.map((platform) => {
                          const Icon = getPlatformIcon(platform);
                          const colorClass = platform === 'youtube' ? 'text-red-600' : 'text-pink-600';
                          return Icon ? (
                            <Icon key={platform} className={`w-4 h-4 ${colorClass}`} title={platform} />
                          ) : null;
                        })}
                      </div>
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3">
                      {getStatusBadge(post.status)}
                    </td>

                    {/* Date */}
                    <td className="px-4 py-3">
                      <span className="text-xs text-theme-tertiary">
                        {post.status === 'posted' && post.results?.[0]?.postedAt
                          ? formatDate(post.results[0].postedAt)
                          : post.scheduledAt
                            ? formatDate(post.scheduledAt)
                            : formatDate(post.createdAt)
                        }
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {canPublish && (
                          <button
                            onClick={() => handlePublishClick(post.id)}
                            disabled={isPublishing}
                            className="flex items-center gap-1 px-2 py-1 text-xs bg-accent text-white rounded hover:bg-accent-hover transition-colors disabled:opacity-50"
                          >
                            {isPublishing ? (
                              <Loader className="w-3 h-3 animate-spin" />
                            ) : (
                              <Zap className="w-3 h-3" />
                            )}
                            Post
                          </button>
                        )}
                        <button
                          onClick={() => handleDeleteClick(post.id)}
                          disabled={isDeleting}
                          className="flex items-center gap-1 px-2 py-1 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors disabled:opacity-50"
                        >
                          {isDeleting ? (
                            <Loader className="w-3 h-3 animate-spin" />
                          ) : (
                            <Trash2 className="w-3 h-3" />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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

      {/* Confirm Dialog */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        onClose={() => setConfirmDialog({ isOpen: false, type: null, postId: null })}
        onConfirm={confirmDialog.type === 'delete' ? handleDelete : handlePublishNow}
        title={confirmDialog.type === 'delete' ? 'Delete Post' : 'Publish Post'}
        message={
          confirmDialog.type === 'delete'
            ? 'Are you sure you want to delete this post? This action cannot be undone.'
            : 'Are you sure you want to publish this post immediately?'
        }
        confirmText={confirmDialog.type === 'delete' ? 'Delete' : 'Publish'}
        cancelText="Cancel"
        variant={confirmDialog.type === 'delete' ? 'danger' : 'primary'}
      />
    </div>
  );
}

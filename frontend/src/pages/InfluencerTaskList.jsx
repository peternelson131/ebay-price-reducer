/**
 * InfluencerTaskList Component
 * 
 * Displays and manages Amazon Influencer video upload tasks
 */

import { useState, useEffect } from 'react';
import { userAPI } from '../lib/supabase';
import { 
  AlertCircle, 
  CheckCircle, 
  ExternalLink, 
  Loader, 
  RefreshCw,
  Trash2,
  RotateCcw,
  Upload
} from 'lucide-react';

// Marketplace flags and info
const MARKETPLACES = {
  US: { 
    name: 'United States', 
    flag: '🇺🇸', 
    domain: 'amazon.com',
    uploadUrl: 'https://www.amazon.com/creatorhub/video/upload'
  },
  CA: { 
    name: 'Canada', 
    flag: '🇨🇦', 
    domain: 'amazon.ca',
    uploadUrl: 'https://www.amazon.ca/creatorhub/video/upload'
  },
  UK: { 
    name: 'United Kingdom', 
    flag: '🇬🇧', 
    domain: 'amazon.co.uk',
    uploadUrl: 'https://www.amazon.co.uk/creatorhub/video/upload'
  },
  DE: { 
    name: 'Germany', 
    flag: '🇩🇪', 
    domain: 'amazon.de',
    uploadUrl: 'https://www.amazon.de/creatorhub/video/upload'
  }
};

export default function InfluencerTaskList() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [filter, setFilter] = useState('pending'); // 'all', 'pending', 'completed'

  useEffect(() => {
    loadTasks();
  }, []);

  const loadTasks = async () => {
    setLoading(true);
    try {
      const token = await userAPI.getAuthToken();
      const response = await fetch('/.netlify/functions/influencer-tasks', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      if (data.success) {
        setTasks(data.tasks || []);
        setPendingCount(data.pendingCount || 0);
      }
    } catch (err) {
      console.error('Failed to load tasks:', err);
    } finally {
      setLoading(false);
    }
  };

  const updateTask = async (taskId, action) => {
    try {
      const token = await userAPI.getAuthToken();
      await fetch('/.netlify/functions/influencer-tasks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ taskId, action })
      });
      loadTasks();
    } catch (err) {
      console.error(`Failed to ${action} task:`, err);
    }
  };

  const filteredTasks = tasks.filter(t => {
    if (filter === 'all') return true;
    return t.status === filter;
  });

  // Group tasks by ASIN
  const groupedTasks = filteredTasks.reduce((acc, task) => {
    if (!acc[task.asin]) {
      acc[task.asin] = [];
    }
    acc[task.asin].push(task);
    return acc;
  }, {});

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-theme-primary flex items-center gap-3">
            📋 Upload Tasks
            {pendingCount > 0 && (
              <span className="px-3 py-1 bg-error text-white text-sm font-bold rounded-full animate-pulse">
                {pendingCount} pending
              </span>
            )}
          </h1>
          <p className="text-theme-secondary mt-1">
            Videos to upload for accepted ASIN correlations
          </p>
        </div>
        <button
          onClick={loadTasks}
          disabled={loading}
          className="p-2 text-theme-secondary hover:text-accent transition-colors"
          title="Refresh"
        >
          <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 mb-6">
        {[
          { key: 'pending', label: 'Pending', icon: AlertCircle, color: 'error' },
          { key: 'completed', label: 'Completed', icon: CheckCircle, color: 'success' },
          { key: 'all', label: 'All', icon: null, color: 'accent' }
        ].map(({ key, label, icon: Icon, color }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
              filter === key
                ? `bg-${color} text-white`
                : 'bg-theme-surface text-theme-secondary hover:text-theme-primary border border-theme'
            }`}
            style={filter === key ? { backgroundColor: `var(--color-${color})` } : {}}
          >
            {Icon && <Icon className="w-4 h-4" />}
            {label}
            {key === 'pending' && pendingCount > 0 && (
              <span className="ml-1">({pendingCount})</span>
            )}
          </button>
        ))}
      </div>

      {/* Loading State */}
      {loading && tasks.length === 0 ? (
        <div className="text-center py-12">
          <Loader className="w-8 h-8 animate-spin mx-auto mb-3 text-accent" />
          <p className="text-theme-secondary">Loading tasks...</p>
        </div>
      ) : filteredTasks.length === 0 ? (
        <div className="text-center py-12 bg-theme-surface rounded-lg border border-theme">
          <div className="w-16 h-16 bg-theme-primary rounded-full flex items-center justify-center mx-auto mb-4">
            {filter === 'pending' ? (
              <CheckCircle className="w-8 h-8 text-success" />
            ) : (
              <AlertCircle className="w-8 h-8 text-theme-tertiary" />
            )}
          </div>
          <h3 className="text-lg font-medium text-theme-primary mb-1">
            {filter === 'pending' ? 'All caught up!' : 'No tasks yet'}
          </h3>
          <p className="text-theme-secondary">
            {filter === 'pending' 
              ? 'You have no pending upload tasks'
              : 'Accept ASIN correlations to create upload tasks'}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedTasks).map(([asin, asinTasks]) => {
            // Get product info from first task
            const firstTask = asinTasks[0];
            const imageUrl = firstTask?.image_url;
            const productTitle = firstTask?.product_title;
            const searchAsin = firstTask?.search_asin;
            
            return (
            <div key={asin} className="bg-theme-surface rounded-lg border border-theme overflow-hidden">
              {/* Product Header with Image */}
              <div className="p-4 bg-theme-primary border-b border-theme">
                <div className="flex gap-4">
                  {/* Keepa/Product Image */}
                  {imageUrl ? (
                    <img 
                      src={imageUrl} 
                      alt={productTitle || asin}
                      className="w-20 h-20 object-contain bg-white rounded-lg flex-shrink-0"
                    />
                  ) : (
                    <div className="w-20 h-20 bg-theme-surface rounded-lg flex items-center justify-center flex-shrink-0">
                      <span className="text-3xl">📦</span>
                    </div>
                  )}
                  
                  {/* Product Info */}
                  <div className="flex-1 min-w-0">
                    {/* Title */}
                    <h3 className="font-medium text-theme-primary line-clamp-2 mb-2">
                      {productTitle || 'Product Title Not Available'}
                    </h3>
                    
                    {/* ASINs */}
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                      {searchAsin && (
                        <div className="flex items-center gap-1">
                          <span className="text-theme-tertiary">Search:</span>
                          <span className="font-mono text-theme-secondary">{searchAsin}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-1">
                        <span className="text-theme-tertiary">Variation:</span>
                        <span className="font-mono text-accent font-semibold">{asin}</span>
                      </div>
                    </div>
                    
                    {/* Progress */}
                    <div className="mt-2 flex items-center gap-2">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        asinTasks.filter(t => t.status === 'pending').length === 0
                          ? 'bg-success/20 text-success'
                          : 'bg-error/20 text-error'
                      }`}>
                        {asinTasks.filter(t => t.status === 'pending').length} of {asinTasks.length} remaining
                      </span>
                      <a
                        href={`https://www.amazon.com/dp/${asin}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-accent hover:text-accent-hover flex items-center gap-1"
                      >
                        View on Amazon <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  </div>
                </div>
              </div>

              {/* Marketplace Tasks */}
              <div className="divide-y divide-theme">
                {asinTasks.map(task => (
                  <div
                    key={task.id}
                    className={`flex items-center justify-between p-4 ${
                      task.status === 'completed' ? 'opacity-60 bg-success/5' : ''
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <span className="text-2xl">{MARKETPLACES[task.marketplace]?.flag}</span>
                      <div>
                        <p className={`font-medium text-theme-primary ${task.status === 'completed' ? 'line-through' : ''}`}>
                          {MARKETPLACES[task.marketplace]?.name}
                        </p>
                        <p className="text-sm text-theme-tertiary">
                          {task.status === 'completed' 
                            ? `Completed ${new Date(task.completed_at).toLocaleDateString()}`
                            : `Created ${new Date(task.created_at).toLocaleDateString()}`
                          }
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {task.status === 'pending' ? (
                        <>
                          <a
                            href={task.amazon_upload_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors flex items-center gap-1"
                            title="View product on Amazon"
                          >
                            Product <ExternalLink className="w-3 h-3" />
                          </a>
                          <a
                            href={MARKETPLACES[task.marketplace]?.uploadUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-4 py-2 text-sm rounded-lg transition-colors flex items-center gap-2 font-medium"
                            style={{ backgroundColor: '#FF9900', color: '#111' }}
                            onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#E88B00'}
                            onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#FF9900'}
                            title="Go to Amazon Influencer upload page"
                          >
                            Upload <ExternalLink className="w-4 h-4" />
                          </a>
                          <button
                            onClick={() => updateTask(task.id, 'complete')}
                            className="px-4 py-2 bg-success text-white text-sm rounded-lg hover:bg-success/80 transition-colors flex items-center gap-2"
                          >
                            <CheckCircle className="w-4 h-4" /> Done
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => updateTask(task.id, 'reopen')}
                            className="px-3 py-2 text-theme-secondary hover:text-theme-primary text-sm transition-colors flex items-center gap-1"
                            title="Reopen task"
                          >
                            <RotateCcw className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => updateTask(task.id, 'delete')}
                            className="px-3 py-2 text-error/60 hover:text-error text-sm transition-colors flex items-center gap-1"
                            title="Delete task"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
          })}
        </div>
      )}
    </div>
  );
}

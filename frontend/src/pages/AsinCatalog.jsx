/**
 * AsinCatalog Component
 * 
 * Displays completed influencer tasks as a searchable catalog
 */

import { useState, useEffect, useMemo } from 'react';
import { userAPI } from '../lib/supabase';
import { 
  Search,
  Filter,
  Loader,
  RefreshCw,
  ExternalLink,
  CheckCircle,
  X,
  Package
} from 'lucide-react';

// Marketplace flags and info
const MARKETPLACES = {
  US: { name: 'United States', flag: '🇺🇸', domain: 'amazon.com' },
  CA: { name: 'Canada', flag: '🇨🇦', domain: 'amazon.ca' },
  UK: { name: 'United Kingdom', flag: '🇬🇧', domain: 'amazon.co.uk' },
  DE: { name: 'Germany', flag: '🇩🇪', domain: 'amazon.de' }
};

export default function AsinCatalog() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [marketplaceFilter, setMarketplaceFilter] = useState('all');

  useEffect(() => {
    loadCompletedTasks();
  }, []);

  const loadCompletedTasks = async () => {
    setLoading(true);
    try {
      const token = await userAPI.getAuthToken();
      const response = await fetch('/.netlify/functions/influencer-tasks?status=completed', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      if (data.success) {
        setTasks(data.tasks || []);
      }
    } catch (err) {
      console.error('Failed to load completed tasks:', err);
    } finally {
      setLoading(false);
    }
  };

  // Filter and search tasks
  const filteredTasks = useMemo(() => {
    return tasks.filter(task => {
      // Marketplace filter
      if (marketplaceFilter !== 'all' && task.marketplace !== marketplaceFilter) {
        return false;
      }
      // Search filter (ASIN or title)
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesAsin = task.asin?.toLowerCase().includes(query) || 
                           task.search_asin?.toLowerCase().includes(query);
        const matchesTitle = task.product_title?.toLowerCase().includes(query);
        if (!matchesAsin && !matchesTitle) {
          return false;
        }
      }
      return true;
    });
  }, [tasks, marketplaceFilter, searchQuery]);

  // Group by ASIN for cleaner display
  const groupedByAsin = useMemo(() => {
    const groups = {};
    filteredTasks.forEach(task => {
      if (!groups[task.asin]) {
        groups[task.asin] = {
          asin: task.asin,
          search_asin: task.search_asin,
          product_title: task.product_title,
          image_url: task.image_url,
          marketplaces: []
        };
      }
      groups[task.asin].marketplaces.push({
        marketplace: task.marketplace,
        completed_at: task.completed_at
      });
    });
    return Object.values(groups);
  }, [filteredTasks]);

  // Count by marketplace for filter badges
  const marketplaceCounts = useMemo(() => {
    const counts = { all: tasks.length, US: 0, CA: 0, UK: 0, DE: 0 };
    tasks.forEach(task => {
      if (counts[task.marketplace] !== undefined) {
        counts[task.marketplace]++;
      }
    });
    return counts;
  }, [tasks]);

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-theme-primary flex items-center gap-3">
            📚 ASIN Catalog
          </h1>
          <p className="text-theme-secondary mt-1">
            {groupedByAsin.length} products completed across {tasks.length} marketplace uploads
          </p>
        </div>
        <button
          onClick={loadCompletedTasks}
          disabled={loading}
          className="p-2 text-theme-secondary hover:text-accent transition-colors"
          title="Refresh"
        >
          <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Search and Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-theme-tertiary" />
          <input
            type="text"
            placeholder="Search by ASIN or title..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-10 py-2 bg-theme-surface border border-theme rounded-lg text-theme-primary placeholder-theme-tertiary focus:outline-none focus:border-accent"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-theme-tertiary hover:text-theme-primary"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Marketplace Filter */}
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setMarketplaceFilter('all')}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1 ${
              marketplaceFilter === 'all'
                ? 'bg-accent text-white'
                : 'bg-theme-surface border border-theme text-theme-secondary hover:text-theme-primary'
            }`}
          >
            All ({marketplaceCounts.all})
          </button>
          {Object.entries(MARKETPLACES).map(([code, { flag }]) => (
            <button
              key={code}
              onClick={() => setMarketplaceFilter(code)}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1 ${
                marketplaceFilter === code
                  ? 'bg-accent text-white'
                  : 'bg-theme-surface border border-theme text-theme-secondary hover:text-theme-primary'
              }`}
            >
              {flag} ({marketplaceCounts[code]})
            </button>
          ))}
        </div>
      </div>

      {/* Loading State */}
      {loading && tasks.length === 0 ? (
        <div className="text-center py-12">
          <Loader className="w-8 h-8 animate-spin mx-auto mb-3 text-accent" />
          <p className="text-theme-secondary">Loading catalog...</p>
        </div>
      ) : groupedByAsin.length === 0 ? (
        <div className="text-center py-12 bg-theme-surface rounded-lg border border-theme">
          <div className="w-16 h-16 bg-theme-primary rounded-full flex items-center justify-center mx-auto mb-4">
            <Search className="w-8 h-8 text-theme-tertiary" />
          </div>
          <h3 className="text-lg font-medium text-theme-primary mb-1">
            {searchQuery || marketplaceFilter !== 'all' ? 'No matches found' : 'No completed uploads yet'}
          </h3>
          <p className="text-theme-secondary">
            {searchQuery || marketplaceFilter !== 'all' 
              ? 'Try adjusting your search or filters'
              : 'Complete upload tasks to build your catalog'}
          </p>
        </div>
      ) : (
        /* Catalog List */
        <div className="bg-theme-surface rounded-lg border border-theme overflow-hidden">
          {/* Header Row */}
          <div className="hidden sm:grid sm:grid-cols-12 gap-4 px-4 py-3 bg-theme-primary border-b border-theme text-sm font-medium text-theme-secondary">
            <div className="col-span-1">Image</div>
            <div className="col-span-4">Title</div>
            <div className="col-span-2">ASIN</div>
            <div className="col-span-2">Source</div>
            <div className="col-span-2">Marketplaces</div>
            <div className="col-span-1"></div>
          </div>

          {/* List Items */}
          <div className="divide-y divide-theme">
            {groupedByAsin.map((item) => (
              <div 
                key={item.asin}
                className="grid grid-cols-1 sm:grid-cols-12 gap-4 px-4 py-3 items-center hover:bg-theme-hover transition-colors"
              >
                {/* Image */}
                <div className="col-span-1 flex justify-center sm:justify-start">
                  {item.image_url ? (
                    <img 
                      src={item.image_url} 
                      alt={item.product_title || item.asin}
                      className="w-12 h-12 object-contain bg-white rounded"
                    />
                  ) : (
                    <div className="w-12 h-12 bg-theme-primary rounded flex items-center justify-center">
                      <Package className="w-6 h-6 text-theme-secondary" />
                    </div>
                  )}
                </div>

                {/* Title */}
                <div className="col-span-4">
                  <p className="text-theme-primary line-clamp-2 text-sm">
                    {item.product_title || 'Title Not Available'}
                  </p>
                </div>

                {/* ASIN */}
                <div className="col-span-2">
                  <span className="font-mono text-sm text-accent">{item.asin}</span>
                </div>

                {/* Source ASIN */}
                <div className="col-span-2">
                  {item.search_asin && item.search_asin !== item.asin ? (
                    <span className="font-mono text-sm text-theme-secondary">{item.search_asin}</span>
                  ) : (
                    <span className="text-theme-tertiary text-sm">—</span>
                  )}
                </div>

                {/* Marketplaces */}
                <div className="col-span-2 flex flex-wrap gap-1">
                  {item.marketplaces.map(({ marketplace }) => (
                    <span 
                      key={marketplace}
                      className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-success/10 text-success text-xs rounded"
                      title={MARKETPLACES[marketplace]?.name}
                    >
                      <CheckCircle className="w-3 h-3" />
                      {MARKETPLACES[marketplace]?.flag}
                    </span>
                  ))}
                </div>

                {/* Actions */}
                <div className="col-span-1 flex justify-end">
                  <a
                    href={`https://www.amazon.com/dp/${item.asin}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent hover:text-accent-hover"
                    title="View on Amazon"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

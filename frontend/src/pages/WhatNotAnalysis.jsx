/**
 * WhatNot Manifest Analysis Page
 * 
 * Analyze WhatNot liquidation manifests to identify profitable purchase opportunities.
 * Features:
 *   - CSV/Excel file upload
 *   - Keepa enrichment for pricing and sales data
 *   - ROI calculations and color coding
 *   - Export enriched data
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import * as XLSX from 'xlsx';
import { userAPI } from '../lib/supabase';
import { 
  Upload,
  FileSpreadsheet,
  Loader,
  RefreshCw,
  ExternalLink,
  CheckCircle,
  Clock,
  AlertCircle,
  X,
  Trash2,
  Search,
  Download,
  Zap,
  TrendingUp,
  TrendingDown,
  Package,
  DollarSign,
  BarChart3,
  Filter
} from 'lucide-react';

// Status configuration
const STATUS_CONFIG = {
  imported: { 
    icon: FileSpreadsheet, 
    label: 'Imported', 
    bgClass: 'bg-gray-100 dark:bg-gray-800', 
    textClass: 'text-gray-600 dark:text-gray-400'
  },
  enriching: { 
    icon: Loader, 
    label: 'Enriching', 
    bgClass: 'bg-blue-50 dark:bg-blue-900/30', 
    textClass: 'text-blue-600 dark:text-blue-400',
    animated: true
  },
  enriched: { 
    icon: CheckCircle, 
    label: 'Enriched', 
    bgClass: 'bg-green-50 dark:bg-green-900/30', 
    textClass: 'text-green-600 dark:text-green-400'
  },
  error: { 
    icon: AlertCircle, 
    label: 'Error', 
    bgClass: 'bg-red-50 dark:bg-red-900/30', 
    textClass: 'text-red-600 dark:text-red-400'
  }
};

// ROI color coding
const getROIColor = (roi) => {
  if (roi == null) return 'text-theme-secondary';
  if (roi >= 30) return 'text-green-600 dark:text-green-400';
  if (roi >= 10) return 'text-yellow-600 dark:text-yellow-400';
  return 'text-red-600 dark:text-red-400';
};

const getROIBg = (roi) => {
  if (roi == null) return '';
  if (roi >= 30) return 'bg-green-50 dark:bg-green-900/20';
  if (roi >= 10) return 'bg-yellow-50 dark:bg-yellow-900/20';
  return 'bg-red-50 dark:bg-red-900/20';
};

// Validate ASIN format
const isValidAsin = (value) => {
  if (!value || typeof value !== 'string') return false;
  const trimmed = value.trim().toUpperCase();
  return /^B[0-9A-Z]{9}$/.test(trimmed);
};

export default function WhatNotAnalysis() {
  // State
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [lotFilter, setLotFilter] = useState('all');
  const [lots, setLots] = useState([]);
  const [stats, setStats] = useState(null);
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const pageSize = 50;
  
  // Sort
  const [sortBy, setSortBy] = useState('roi_percent');
  const [sortOrder, setSortOrder] = useState('desc');
  
  // Actions
  const [enriching, setEnriching] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  
  // Upload modal
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [parsedData, setParsedData] = useState(null);
  const [parseError, setParseError] = useState(null);
  const [importing, setImporting] = useState(false);
  
  // Debounce ref
  const searchDebounceRef = useRef(null);

  // Load items
  const loadItems = useCallback(async (page = currentPage) => {
    try {
      const token = await userAPI.getAuthToken();
      const params = new URLSearchParams({
        action: 'list',
        page: page.toString(),
        limit: pageSize.toString(),
        sortBy,
        sortOrder
      });
      
      if (lotFilter !== 'all') params.set('lotId', lotFilter);
      if (statusFilter !== 'all') params.set('status', statusFilter);

      const response = await fetch(`/.netlify/functions/whatnot-analysis?${params}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      const data = await response.json();
      if (data.success) {
        setItems(data.items || []);
        setTotalPages(data.pagination?.pages || 1);
        setTotalCount(data.pagination?.total || 0);
        setCurrentPage(page);
      }
    } catch (err) {
      console.error('Load error:', err);
    } finally {
      setLoading(false);
    }
  }, [currentPage, sortBy, sortOrder, lotFilter, statusFilter]);

  // Load lots
  const loadLots = async () => {
    try {
      const token = await userAPI.getAuthToken();
      const response = await fetch('/.netlify/functions/whatnot-analysis?action=lots', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      if (data.success) {
        setLots(data.lots || []);
      }
    } catch (err) {
      console.error('Load lots error:', err);
    }
  };

  // Load stats
  const loadStats = async () => {
    try {
      const token = await userAPI.getAuthToken();
      const response = await fetch('/.netlify/functions/whatnot-analysis?action=stats', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      if (data.success) {
        setStats(data.stats);
      }
    } catch (err) {
      console.error('Load stats error:', err);
    }
  };

  // Initial load
  useEffect(() => {
    loadItems();
    loadLots();
    loadStats();
  }, []);

  // Reload on filter/sort change
  useEffect(() => {
    loadItems(1);
  }, [sortBy, sortOrder, lotFilter, statusFilter]);

  // File upload handling
  const onDrop = useCallback((acceptedFiles) => {
    const file = acceptedFiles[0];
    if (!file) return;
    
    setParseError(null);
    setParsedData(null);
    
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        
        if (jsonData.length < 2) {
          setParseError('File appears to be empty');
          return;
        }
        
        const headers = jsonData[0].map(h => (h || '').toString().toLowerCase().trim());
        
        // Find column indices
        const findCol = (patterns) => {
          for (const pattern of patterns) {
            const idx = headers.findIndex(h => h.includes(pattern));
            if (idx !== -1) return idx;
          }
          return -1;
        };
        
        const asinIdx = findCol(['asin']);
        const descIdx = findCol(['description', 'title', 'item desc']);
        const qtyIdx = findCol(['qty', 'quantity']);
        const priceIdx = findCol(['unit retail', 'price', 'unit price']);
        const extIdx = findCol(['ext. retail', 'ext retail', 'extended']);
        const brandIdx = findCol(['brand']);
        const upcIdx = findCol(['upc']);
        const conditionIdx = findCol(['condition']);
        const lotIdx = findCol(['lot id', 'lot']);
        
        if (asinIdx === -1) {
          setParseError('ASIN column not found. Please ensure your file has an ASIN column.');
          return;
        }
        
        // Extract items
        const items = [];
        const invalidRows = [];
        
        for (let i = 1; i < jsonData.length; i++) {
          const row = jsonData[i];
          const rawAsin = row[asinIdx]?.toString().trim().toUpperCase();
          
          if (!rawAsin) continue;
          
          if (isValidAsin(rawAsin)) {
            items.push({
              asin: rawAsin,
              description: descIdx !== -1 ? row[descIdx]?.toString() : null,
              quantity: qtyIdx !== -1 ? parseInt(row[qtyIdx]) || 1 : 1,
              unitRetail: priceIdx !== -1 ? parseFloat(row[priceIdx]) : null,
              extRetail: extIdx !== -1 ? parseFloat(row[extIdx]) : null,
              brand: brandIdx !== -1 ? row[brandIdx]?.toString() : null,
              upc: upcIdx !== -1 ? row[upcIdx]?.toString() : null,
              condition: conditionIdx !== -1 ? row[conditionIdx]?.toString() : null,
              lotId: lotIdx !== -1 ? row[lotIdx]?.toString() : null,
              rowNum: i + 1
            });
          } else {
            invalidRows.push({ value: rawAsin, rowNum: i + 1 });
          }
        }
        
        if (items.length === 0) {
          setParseError(`No valid ASINs found. ${invalidRows.length} invalid rows.`);
          return;
        }
        
        // Get unique lot ID
        const uniqueLotIds = [...new Set(items.map(i => i.lotId).filter(Boolean))];
        
        setParsedData({
          fileName: file.name,
          totalRows: jsonData.length - 1,
          validItems: items,
          invalidRows,
          lotIds: uniqueLotIds
        });
        
      } catch (err) {
        console.error('Parse error:', err);
        setParseError('Failed to parse file. Ensure it\'s a valid Excel or CSV file.');
      }
    };
    
    reader.readAsArrayBuffer(file);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
      'text/csv': ['.csv']
    },
    maxFiles: 1
  });

  // Import items
  const handleImport = async () => {
    if (!parsedData?.validItems?.length) return;
    
    setImporting(true);
    try {
      const token = await userAPI.getAuthToken();
      const response = await fetch('/.netlify/functions/whatnot-analysis', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          action: 'import',
          items: parsedData.validItems
        })
      });
      
      const data = await response.json();
      if (data.success) {
        setShowUploadModal(false);
        setParsedData(null);
        await loadItems(1);
        await loadLots();
        await loadStats();
      } else {
        setParseError(data.error || 'Import failed');
      }
    } catch (err) {
      console.error('Import error:', err);
      setParseError('Import failed. Please try again.');
    } finally {
      setImporting(false);
    }
  };

  // Enrich with Keepa
  const handleEnrich = async () => {
    setEnriching(true);
    try {
      const token = await userAPI.getAuthToken();
      const response = await fetch('/.netlify/functions/whatnot-analysis', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          action: 'enrich',
          limit: 50
        })
      });
      
      const data = await response.json();
      if (data.success) {
        alert(`✅ Enriched ${data.enriched} items (${data.tokensUsed} Keepa tokens used)`);
        await loadItems();
        await loadStats();
      } else {
        alert(`❌ ${data.error}`);
      }
    } catch (err) {
      console.error('Enrich error:', err);
      alert('Failed to enrich items');
    } finally {
      setEnriching(false);
    }
  };

  // Export CSV
  const handleExport = async () => {
    setExporting(true);
    try {
      const token = await userAPI.getAuthToken();
      const response = await fetch('/.netlify/functions/whatnot-analysis', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ action: 'export' })
      });
      
      const data = await response.json();
      if (data.success && data.csv) {
        const blob = new Blob([data.csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        const date = new Date().toISOString().split('T')[0];
        link.href = url;
        link.download = `whatnot-analysis-${date}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      } else {
        alert(data.error || 'Export failed');
      }
    } catch (err) {
      console.error('Export error:', err);
      alert('Export failed');
    } finally {
      setExporting(false);
    }
  };

  // Delete item
  const handleDelete = async (id) => {
    if (!confirm('Delete this item?')) return;
    
    try {
      const token = await userAPI.getAuthToken();
      await fetch('/.netlify/functions/whatnot-analysis', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ action: 'delete', ids: [id] })
      });
      
      setItems(prev => prev.filter(i => i.id !== id));
      await loadStats();
    } catch (err) {
      console.error('Delete error:', err);
    }
  };

  // Clear lot
  const handleClearLot = async (lotId) => {
    if (!confirm(`Delete all items in lot ${lotId}?`)) return;
    
    setDeleting(true);
    try {
      const token = await userAPI.getAuthToken();
      await fetch('/.netlify/functions/whatnot-analysis', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ action: 'delete', lotId })
      });
      
      await loadItems(1);
      await loadLots();
      await loadStats();
      setLotFilter('all');
    } catch (err) {
      console.error('Clear lot error:', err);
    } finally {
      setDeleting(false);
    }
  };

  // Filter items by search
  const filteredItems = items.filter(item => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      item.asin?.toLowerCase().includes(q) ||
      item.title?.toLowerCase().includes(q) ||
      item.brand?.toLowerCase().includes(q)
    );
  });

  // Status badge
  const StatusBadge = ({ status }) => {
    const config = STATUS_CONFIG[status] || STATUS_CONFIG.imported;
    const Icon = config.icon;
    
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${config.bgClass} ${config.textClass}`}>
        <Icon className={`w-3 h-3 ${config.animated ? 'animate-spin' : ''}`} />
        {config.label}
      </span>
    );
  };

  // Format currency
  const formatCurrency = (value) => {
    if (value == null) return '-';
    return `$${value.toFixed(2)}`;
  };

  // Format number with commas
  const formatNumber = (value) => {
    if (value == null) return '-';
    return value.toLocaleString();
  };

  return (
    <div className="p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-theme-primary flex items-center gap-2">
            📦 WhatNot Analysis
          </h1>
          <p className="text-theme-secondary mt-1">
            Analyze liquidation manifests for profitable opportunities
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowUploadModal(true)}
            className="px-4 py-2 bg-accent hover:bg-accent-hover text-white font-medium rounded-lg transition-colors flex items-center gap-2"
          >
            <Upload className="w-4 h-4" />
            Import
          </button>
          <button
            onClick={handleEnrich}
            disabled={enriching || !items.some(i => i.status === 'imported' || i.status === 'error')}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-medium rounded-lg transition-colors flex items-center gap-2"
          >
            <Zap className={`w-4 h-4 ${enriching ? 'animate-pulse' : ''}`} />
            {enriching ? 'Enriching...' : 'Enrich'}
          </button>
          <button
            onClick={handleExport}
            disabled={exporting || items.length === 0}
            className="px-4 py-2 bg-theme-hover hover:bg-theme-primary text-theme-primary font-medium rounded-lg transition-colors flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            Export
          </button>
          <button
            onClick={() => { loadItems(); loadStats(); }}
            disabled={loading}
            className="p-2 text-theme-secondary hover:text-accent transition-colors"
            title="Refresh"
          >
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <div className="bg-theme-surface rounded-xl p-4 border border-theme">
            <div className="flex items-center gap-2 text-theme-secondary text-sm mb-1">
              <Package className="w-4 h-4" />
              Total Items
            </div>
            <div className="text-2xl font-bold text-theme-primary">{formatNumber(stats.total)}</div>
            <div className="text-xs text-theme-tertiary mt-1">
              {stats.enriched} enriched, {stats.imported} pending
            </div>
          </div>
          
          <div className="bg-theme-surface rounded-xl p-4 border border-theme">
            <div className="flex items-center gap-2 text-theme-secondary text-sm mb-1">
              <TrendingUp className="w-4 h-4" />
              Avg ROI
            </div>
            <div className={`text-2xl font-bold ${getROIColor(stats.avgRoi)}`}>
              {stats.avgRoi ? `${stats.avgRoi.toFixed(1)}%` : '-'}
            </div>
            <div className="text-xs text-theme-tertiary mt-1">
              Across {stats.enriched} enriched items
            </div>
          </div>
          
          <div className="bg-theme-surface rounded-xl p-4 border border-theme">
            <div className="flex items-center gap-2 text-theme-secondary text-sm mb-1">
              <DollarSign className="w-4 h-4" />
              Total Profit
            </div>
            <div className={`text-2xl font-bold ${stats.totalProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {formatCurrency(stats.totalProfit)}
            </div>
            <div className="text-xs text-theme-tertiary mt-1">
              Est. profit from all items
            </div>
          </div>
          
          <div className="bg-theme-surface rounded-xl p-4 border border-theme">
            <div className="flex items-center gap-2 text-theme-secondary text-sm mb-1">
              <BarChart3 className="w-4 h-4" />
              Total Qty
            </div>
            <div className="text-2xl font-bold text-theme-primary">{formatNumber(stats.totalQty)}</div>
            <div className="text-xs text-theme-tertiary mt-1">
              Units in manifests
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4 mb-4">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-theme-tertiary" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search ASIN, title, brand..."
            className="w-full pl-10 pr-4 py-2 bg-theme-surface border border-theme rounded-lg text-theme-primary placeholder:text-theme-tertiary focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </div>
        
        {/* Lot Filter */}
        <select
          value={lotFilter}
          onChange={(e) => setLotFilter(e.target.value)}
          className="px-3 py-2 bg-theme-surface border border-theme rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-accent"
        >
          <option value="all">All Lots</option>
          {lots.map(lot => (
            <option key={lot} value={lot}>{lot}</option>
          ))}
        </select>
        
        {/* Status Filter */}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 bg-theme-surface border border-theme rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-accent"
        >
          <option value="all">All Status</option>
          <option value="imported">Imported</option>
          <option value="enriched">Enriched</option>
          <option value="error">Error</option>
        </select>
        
        {/* Sort */}
        <select
          value={`${sortBy}:${sortOrder}`}
          onChange={(e) => {
            const [s, o] = e.target.value.split(':');
            setSortBy(s);
            setSortOrder(o);
          }}
          className="px-3 py-2 bg-theme-surface border border-theme rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-accent"
        >
          <option value="roi_percent:desc">ROI (High to Low)</option>
          <option value="roi_percent:asc">ROI (Low to High)</option>
          <option value="estimated_profit:desc">Profit (High to Low)</option>
          <option value="sales_rank:asc">Sales Rank (Best)</option>
          <option value="amazon_price:desc">Price (High to Low)</option>
          <option value="created_at:desc">Date (Newest)</option>
        </select>
        
        {/* Clear Lot Button */}
        {lotFilter !== 'all' && (
          <button
            onClick={() => handleClearLot(lotFilter)}
            disabled={deleting}
            className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg flex items-center gap-2"
          >
            <Trash2 className="w-4 h-4" />
            Clear Lot
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-theme-surface rounded-xl border border-theme overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-theme-primary border-b border-theme">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-theme-secondary uppercase tracking-wider">Product</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-theme-secondary uppercase tracking-wider">Qty</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-theme-secondary uppercase tracking-wider">Manifest $</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-theme-secondary uppercase tracking-wider">Amazon $</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-theme-secondary uppercase tracking-wider">Rank</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-theme-secondary uppercase tracking-wider">Sellers</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-theme-secondary uppercase tracking-wider">Profit</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-theme-secondary uppercase tracking-wider">ROI</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-theme-secondary uppercase tracking-wider">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-theme">
              {loading && items.length === 0 ? (
                <tr>
                  <td colSpan="10" className="px-4 py-12 text-center text-theme-secondary">
                    <Loader className="w-6 h-6 animate-spin mx-auto mb-2" />
                    Loading...
                  </td>
                </tr>
              ) : filteredItems.length === 0 ? (
                <tr>
                  <td colSpan="10" className="px-4 py-12 text-center text-theme-secondary">
                    <Package className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p>No items found</p>
                    <button
                      onClick={() => setShowUploadModal(true)}
                      className="mt-4 text-accent hover:underline"
                    >
                      Import your first manifest
                    </button>
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => (
                  <tr key={item.id} className={`hover:bg-theme-hover ${getROIBg(item.roi_percent)}`}>
                    {/* Product */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {item.image_url ? (
                          <img 
                            src={item.image_url} 
                            alt="" 
                            className="w-10 h-10 object-contain bg-white rounded"
                          />
                        ) : (
                          <div className="w-10 h-10 bg-theme-primary rounded flex items-center justify-center">
                            <Package className="w-5 h-5 text-theme-tertiary" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <a
                            href={`https://www.amazon.com/dp/${item.asin}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm font-medium text-accent hover:underline flex items-center gap-1"
                          >
                            {item.asin}
                            <ExternalLink className="w-3 h-3" />
                          </a>
                          <p className="text-xs text-theme-secondary truncate max-w-xs" title={item.title}>
                            {item.title || item.brand || '-'}
                          </p>
                        </div>
                      </div>
                    </td>
                    
                    {/* Qty */}
                    <td className="px-4 py-3 text-sm text-theme-primary">
                      {item.quantity || 1}
                    </td>
                    
                    {/* Manifest Price */}
                    <td className="px-4 py-3 text-sm text-theme-primary">
                      {formatCurrency(item.manifest_price)}
                    </td>
                    
                    {/* Amazon Price */}
                    <td className="px-4 py-3 text-sm text-theme-primary font-medium">
                      {formatCurrency(item.amazon_price)}
                    </td>
                    
                    {/* Sales Rank */}
                    <td className="px-4 py-3">
                      {item.sales_rank ? (
                        <div>
                          <div className="text-sm text-theme-primary">{formatNumber(item.sales_rank)}</div>
                          {item.sales_rank_90_avg && (
                            <div className="text-xs text-theme-tertiary">
                              90d: {formatNumber(item.sales_rank_90_avg)}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-theme-tertiary">-</span>
                      )}
                    </td>
                    
                    {/* Sellers */}
                    <td className="px-4 py-3">
                      {(item.fba_sellers != null || item.fbm_sellers != null) ? (
                        <div className="text-xs">
                          <span className="text-orange-600">FBA: {item.fba_sellers || 0}</span>
                          <span className="text-theme-tertiary mx-1">|</span>
                          <span className="text-blue-600">FBM: {item.fbm_sellers || 0}</span>
                        </div>
                      ) : (
                        <span className="text-theme-tertiary">-</span>
                      )}
                    </td>
                    
                    {/* Profit */}
                    <td className="px-4 py-3">
                      {item.estimated_profit != null ? (
                        <span className={`text-sm font-medium ${item.estimated_profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {item.estimated_profit >= 0 ? '+' : ''}{formatCurrency(item.estimated_profit)}
                        </span>
                      ) : (
                        <span className="text-theme-tertiary">-</span>
                      )}
                    </td>
                    
                    {/* ROI */}
                    <td className="px-4 py-3">
                      {item.roi_percent != null ? (
                        <span className={`text-sm font-bold ${getROIColor(item.roi_percent)}`}>
                          {item.roi_percent >= 0 ? '+' : ''}{item.roi_percent.toFixed(1)}%
                        </span>
                      ) : (
                        <span className="text-theme-tertiary">-</span>
                      )}
                    </td>
                    
                    {/* Status */}
                    <td className="px-4 py-3">
                      <StatusBadge status={item.status} />
                    </td>
                    
                    {/* Actions */}
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleDelete(item.id)}
                        className="p-1 text-theme-tertiary hover:text-red-600 transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        
        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-theme flex items-center justify-between">
            <div className="text-sm text-theme-secondary">
              Showing {((currentPage - 1) * pageSize) + 1} - {Math.min(currentPage * pageSize, totalCount)} of {totalCount}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => loadItems(currentPage - 1)}
                disabled={currentPage === 1}
                className="px-3 py-1 text-sm bg-theme-hover hover:bg-theme-primary disabled:opacity-50 text-theme-primary rounded"
              >
                Previous
              </button>
              <span className="text-sm text-theme-secondary">
                Page {currentPage} of {totalPages}
              </span>
              <button
                onClick={() => loadItems(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="px-3 py-1 text-sm bg-theme-hover hover:bg-theme-primary disabled:opacity-50 text-theme-primary rounded"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-theme-surface rounded-xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-auto">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-theme">
              <h2 className="text-lg font-semibold text-theme-primary flex items-center gap-2">
                <Upload className="w-5 h-5 text-accent" />
                Import Manifest
              </h2>
              <button
                onClick={() => { setShowUploadModal(false); setParsedData(null); setParseError(null); }}
                className="p-1 rounded-lg text-theme-tertiary hover:text-theme-primary hover:bg-theme-hover"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            {/* Body */}
            <div className="p-4">
              {/* Dropzone */}
              <div
                {...getRootProps()}
                className={`
                  border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all
                  ${isDragActive 
                    ? 'border-accent bg-accent/5' 
                    : 'border-theme hover:border-accent/50 hover:bg-theme-hover'
                  }
                `}
              >
                <input {...getInputProps()} />
                <div className="flex flex-col items-center">
                  <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 ${isDragActive ? 'bg-accent/20' : 'bg-theme-primary'}`}>
                    {isDragActive ? (
                      <FileSpreadsheet className="w-8 h-8 text-accent" />
                    ) : (
                      <Upload className="w-8 h-8 text-theme-tertiary" />
                    )}
                  </div>
                  <p className="text-theme-primary font-medium mb-1">
                    {isDragActive ? 'Drop your file here' : 'Drop manifest file here'}
                  </p>
                  <p className="text-sm text-theme-secondary">
                    or click to browse • CSV or Excel
                  </p>
                </div>
              </div>
              
              {/* Parse Error */}
              {parseError && (
                <div className="mt-3 p-3 bg-error/10 border border-error/30 rounded-lg flex items-center gap-2 text-error text-sm">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  {parseError}
                </div>
              )}
              
              {/* Preview */}
              {parsedData && (
                <div className="mt-4">
                  <div className="bg-theme-primary rounded-lg p-4 mb-4">
                    <h3 className="font-medium text-theme-primary mb-2 flex items-center gap-2">
                      <FileSpreadsheet className="w-4 h-4 text-accent" />
                      {parsedData.fileName}
                    </h3>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="text-theme-secondary">Total rows:</div>
                      <div className="text-theme-primary">{parsedData.totalRows}</div>
                      <div className="text-theme-secondary">Valid ASINs:</div>
                      <div className="text-success font-medium">{parsedData.validItems.length}</div>
                      {parsedData.invalidRows.length > 0 && (
                        <>
                          <div className="text-theme-secondary">Invalid rows:</div>
                          <div className="text-error">{parsedData.invalidRows.length}</div>
                        </>
                      )}
                      {parsedData.lotIds.length > 0 && (
                        <>
                          <div className="text-theme-secondary">Lot IDs:</div>
                          <div className="text-theme-primary">{parsedData.lotIds.join(', ')}</div>
                        </>
                      )}
                    </div>
                  </div>
                  
                  {/* Sample ASINs */}
                  <div className="mb-4">
                    <p className="text-sm text-theme-secondary mb-2">Sample items:</p>
                    <div className="flex flex-wrap gap-1.5">
                      {parsedData.validItems.slice(0, 6).map(item => (
                        <span key={item.asin + item.rowNum} className="px-2 py-1 bg-theme-primary rounded text-xs font-mono text-accent">
                          {item.asin}
                        </span>
                      ))}
                      {parsedData.validItems.length > 6 && (
                        <span className="px-2 py-1 bg-theme-primary rounded text-xs text-theme-secondary">
                          +{parsedData.validItems.length - 6} more
                        </span>
                      )}
                    </div>
                  </div>
                  
                  {/* Import Button */}
                  <button
                    onClick={handleImport}
                    disabled={importing}
                    className="w-full py-3 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
                  >
                    {importing ? (
                      <>
                        <Loader className="w-4 h-4 animate-spin" />
                        Importing...
                      </>
                    ) : (
                      <>
                        <Upload className="w-4 h-4" />
                        Import {parsedData.validItems.length} Items
                      </>
                    )}
                  </button>
                </div>
              )}
              
              {/* Instructions */}
              {!parsedData && (
                <div className="mt-4 p-3 bg-theme-primary rounded-lg text-sm text-theme-secondary">
                  <strong className="text-theme-primary">Expected columns:</strong>
                  <ul className="mt-1 list-disc list-inside">
                    <li>ASIN (required)</li>
                    <li>Item Description / Title</li>
                    <li>Qty, Unit Retail, Brand, UPC</li>
                    <li>Condition, Lot ID</li>
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

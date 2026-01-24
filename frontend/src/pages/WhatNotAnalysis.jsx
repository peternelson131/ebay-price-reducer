/**
 * WhatNotAnalysis Component
 * 
 * Analyze WhatNot lot manifests by importing CSV/Excel data,
 * enriching with Keepa data for demand assessment.
 */

import { useState, useCallback, useEffect } from 'react';
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
  AlertCircle,
  ChevronDown,
  ChevronRight,
  X,
  Download,
  TrendingUp,
  Package,
  DollarSign,
  BarChart3,
  Search,
  Filter,
  ArrowUpDown,
  Sparkles
} from 'lucide-react';

// Sales rank color coding (lower rank = higher demand)
const getRankStyle = (rank, enriched) => {
  if (!enriched || rank == null) {
    return { bg: '', text: 'text-theme-secondary' };
  }
  if (rank < 50000) {
    return { bg: 'bg-green-50 dark:bg-green-900/20', text: 'text-green-600 dark:text-green-400' };
  }
  if (rank < 200000) {
    return { bg: 'bg-yellow-50 dark:bg-yellow-900/20', text: 'text-yellow-600 dark:text-yellow-400' };
  }
  return { bg: '', text: 'text-theme-secondary' };
};

// Format currency
const formatCurrency = (value) => {
  if (value == null || isNaN(value)) return '—';
  return `$${value.toFixed(2)}`;
};

// Format number with commas
const formatNumber = (value) => {
  if (value == null || isNaN(value)) return '—';
  return value.toLocaleString();
};

export default function WhatNotAnalysis() {
  // State
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [enrichProgress, setEnrichProgress] = useState(null);
  const [expandedRows, setExpandedRows] = useState(new Set());
  
  // File upload state
  const [parsedData, setParsedData] = useState(null);
  const [parseError, setParseError] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  const [importing, setImporting] = useState(false);
  
  // Sort state
  const [sortBy, setSortBy] = useState('sales_rank');
  const [sortOrder, setSortOrder] = useState('asc');
  
  // Filter state
  const [lotFilter, setLotFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Get unique lot IDs from items
  const uniqueLots = [...new Set(items.map(item => item.lot_id).filter(Boolean))];

  // Fetch items from database
  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const token = await userAPI.getAuthToken();
      const response = await fetch('/.netlify/functions/whatnot-analysis?action=list&limit=500', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      const data = await response.json();
      
      if (data.success && data.items) {
        // Map DB items to component state format
        setItems(data.items.map(item => ({
          ...item,
          enriched: item.status === 'enriched',
          roi: item.roi_percent,
          profit: item.estimated_profit
        })));
      }
    } catch (err) {
      console.error('Failed to fetch items:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load existing items on mount
  useEffect(() => {
    fetchItems();
  }, [fetchItems]);
  
  // Parse manifest columns
  const parseManifestRow = (row, headers) => {
    const findColumn = (patterns) => {
      const lowerHeaders = headers.map(h => (h || '').toString().toLowerCase().trim());
      for (const pattern of patterns) {
        const index = lowerHeaders.findIndex(h => h.includes(pattern));
        if (index !== -1) return index;
      }
      return -1;
    };
    
    const asinIdx = findColumn(['asin']);
    const descIdx = findColumn(['item description', 'description', 'title', 'name']);
    const qtyIdx = findColumn(['qty', 'quantity']);
    const retailIdx = findColumn(['unit retail', 'retail', 'price', 'msrp']);
    const brandIdx = findColumn(['brand']);
    const conditionIdx = findColumn(['condition']);
    const lotIdx = findColumn(['lot id', 'lot', 'lotid']);
    
    return {
      asin: asinIdx !== -1 ? (row[asinIdx] || '').toString().trim().toUpperCase() : null,
      title: descIdx !== -1 ? (row[descIdx] || '').toString().trim() : null,
      quantity: qtyIdx !== -1 ? parseInt(row[qtyIdx]) || 1 : 1,
      manifest_price: retailIdx !== -1 ? parseFloat(row[retailIdx]) || 0 : 0,
      brand: brandIdx !== -1 ? (row[brandIdx] || '').toString().trim() : null,
      condition: conditionIdx !== -1 ? (row[conditionIdx] || '').toString().trim() : null,
      lot_id: lotIdx !== -1 ? (row[lotIdx] || '').toString().trim() : null
    };
  };
  
  // File drop handler
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
        
        // Get first sheet
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        
        // Convert to JSON
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        
        if (jsonData.length < 2) {
          setParseError('File appears to be empty or has no data rows');
          return;
        }
        
        const headers = jsonData[0];
        
        // Parse all rows
        const parsedItems = [];
        const invalidRows = [];
        
        for (let i = 1; i < jsonData.length; i++) {
          const row = jsonData[i];
          if (!row || row.length === 0) continue;
          
          const parsed = parseManifestRow(row, headers);
          
          // Validate ASIN format
          if (parsed.asin && /^B[0-9A-Z]{9}$/.test(parsed.asin)) {
            parsedItems.push({
              ...parsed,
              rowNum: i + 1
            });
          } else if (parsed.title || parsed.asin) {
            // Has some data but invalid/missing ASIN
            invalidRows.push({
              rowNum: i + 1,
              asin: parsed.asin,
              title: parsed.title
            });
          }
        }
        
        if (parsedItems.length === 0) {
          setParseError(`No valid ASINs found. ${invalidRows.length} rows had invalid or missing ASINs.`);
          return;
        }
        
        setParsedData({
          fileName: file.name,
          totalRows: jsonData.length - 1,
          validItems: parsedItems,
          invalidRows,
          totalManifestCost: parsedItems.reduce((sum, item) => sum + (item.manifest_price * item.quantity), 0)
        });
        setShowPreview(true);
        
      } catch (err) {
        console.error('Parse error:', err);
        setParseError('Failed to parse file. Please ensure it\'s a valid Excel or CSV file.');
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

  // Submit import
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
        // Fetch items from DB to get the actual saved data
        await fetchItems();
        setShowPreview(false);
        setParsedData(null);
      } else {
        setParseError(data.error || 'Import failed');
      }
    } catch (err) {
      console.error('Import error:', err);
      setParseError('Failed to import items. Please try again.');
    } finally {
      setImporting(false);
    }
  };

  // Enrich with Keepa data
  const handleEnrich = async () => {
    if (items.length === 0) return;
    
    setEnriching(true);
    setEnrichProgress({ current: 0, total: items.length, message: 'Starting enrichment...' });
    
    try {
      const token = await userAPI.getAuthToken();
      const asins = [...new Set(items.filter(i => i.asin && !i.enriched).map(i => i.asin))];
      
      setEnrichProgress({ current: 0, total: asins.length, message: `Fetching data for ${asins.length} ASINs...` });
      
      const response = await fetch('/.netlify/functions/whatnot-analysis', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          action: 'enrich',
          asins
        })
      });
      
      const data = await response.json();
      
      if (data.success) {
        // Fetch updated items from DB (they now have enrichment data)
        await fetchItems();
        
        setEnrichProgress({ 
          current: data.enriched || 0, 
          total: asins.length, 
          message: `Enriched ${data.enriched || 0} items!${data.errors ? ` (${data.errors} not found)` : ''}${data.remaining ? ` ${data.remaining} remaining.` : ''}`,
          complete: true
        });
      } else {
        setEnrichProgress({ 
          message: data.error || 'Enrichment failed', 
          error: true 
        });
      }
    } catch (err) {
      console.error('Enrich error:', err);
      setEnrichProgress({ message: 'Failed to enrich items', error: true });
    } finally {
      setEnriching(false);
      // Clear progress after a delay
      setTimeout(() => setEnrichProgress(null), 3000);
    }
  };

  // Export to CSV
  const handleExport = () => {
    if (items.length === 0) return;
    
    const headers = ['ASIN', 'Title', 'Qty', 'Manifest Price', 'Amazon Price', 'Sales Rank', '90-Day Avg Rank', 'FBA Sellers', 'FBM Sellers', 'Category', 'Brand', 'Condition', 'Lot ID'];
    const rows = items.map(item => [
      item.asin,
      item.title || '',
      item.quantity,
      item.manifest_price?.toFixed(2) || '',
      item.amazon_price?.toFixed(2) || '',
      item.sales_rank || '',
      item.sales_rank_90_avg || '',
      item.fba_sellers ?? '',
      item.fbm_sellers ?? '',
      item.category || '',
      item.brand || '',
      item.condition || '',
      item.lot_id || ''
    ]);
    
    const csv = [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const date = new Date().toISOString().split('T')[0];
    link.href = url;
    link.download = `whatnot-analysis-${date}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Toggle row expansion
  const toggleExpanded = (id) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Sort items
  const sortedItems = [...items].sort((a, b) => {
    let aVal = a[sortBy];
    let bVal = b[sortBy];
    
    // Handle nulls
    if (aVal == null && bVal == null) return 0;
    if (aVal == null) return 1;
    if (bVal == null) return -1;
    
    // String comparison for text fields
    if (typeof aVal === 'string') {
      aVal = aVal.toLowerCase();
      bVal = bVal.toLowerCase();
    }
    
    if (sortOrder === 'asc') {
      return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
    } else {
      return aVal > bVal ? -1 : aVal < bVal ? 1 : 0;
    }
  });

  // Filter items
  const filteredItems = sortedItems.filter(item => {
    if (lotFilter !== 'all' && item.lot_id !== lotFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        (item.asin && item.asin.toLowerCase().includes(q)) ||
        (item.title && item.title.toLowerCase().includes(q)) ||
        (item.brand && item.brand.toLowerCase().includes(q))
      );
    }
    return true;
  });

  // Calculate summary stats
  const stats = {
    totalItems: items.length,
    totalQuantity: items.reduce((sum, item) => sum + (item.quantity || 1), 0),
    totalManifestCost: items.reduce((sum, item) => sum + ((item.manifest_price || 0) * (item.quantity || 1)), 0),
    enrichedCount: items.filter(i => i.enriched).length,
    avgRank: (() => {
      const enriched = items.filter(i => i.enriched && i.sales_rank != null);
      if (enriched.length === 0) return null;
      return Math.round(enriched.reduce((sum, i) => sum + i.sales_rank, 0) / enriched.length);
    })()
  };

  // Handle sort
  const handleSort = (column) => {
    if (sortBy === column) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('desc');
    }
  };

  // Sort indicator
  const SortIndicator = ({ column }) => {
    if (sortBy !== column) return null;
    return <span className="ml-1">{sortOrder === 'asc' ? '↑' : '↓'}</span>;
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-theme-primary flex items-center gap-3">
            <TrendingUp className="w-7 h-7 text-purple-500" />
            WhatNot Lot Analysis
          </h1>
          <p className="text-theme-secondary mt-1">
            Import manifests, enrich with Keepa, assess demand
          </p>
        </div>
        <div className="flex items-center gap-2">
          {items.length > 0 && (
            <>
              <button
                onClick={handleEnrich}
                disabled={enriching || items.filter(i => !i.enriched).length === 0}
                className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-medium rounded-lg transition-colors"
              >
                {enriching ? (
                  <Loader className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
                Enrich with Keepa
              </button>
              <button
                onClick={handleExport}
                className="flex items-center gap-2 px-4 py-2 bg-theme-hover hover:bg-theme-primary text-theme-secondary hover:text-theme-primary font-medium rounded-lg transition-colors"
              >
                <Download className="w-4 h-4" />
                Export CSV
              </button>
            </>
          )}
        </div>
      </div>

      {/* Enrichment Progress */}
      {enrichProgress && (
        <div className={`mb-4 p-4 rounded-lg flex items-center gap-3 ${
          enrichProgress.error 
            ? 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400'
            : enrichProgress.complete
            ? 'bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400'
            : 'bg-orange-50 dark:bg-orange-900/30 text-orange-600 dark:text-blue-400'
        }`}>
          {!enrichProgress.complete && !enrichProgress.error && (
            <Loader className="w-5 h-5 animate-spin" />
          )}
          {enrichProgress.complete && <CheckCircle className="w-5 h-5" />}
          {enrichProgress.error && <AlertCircle className="w-5 h-5" />}
          <span>{enrichProgress.message}</span>
          {enrichProgress.total > 0 && !enrichProgress.complete && (
            <span className="ml-auto text-sm">
              {enrichProgress.current} / {enrichProgress.total}
            </span>
          )}
        </div>
      )}

      {/* Summary Stats */}
      {items.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-theme-surface rounded-xl p-4 border border-theme">
            <div className="flex items-center gap-2 text-theme-secondary text-sm mb-1">
              <Package className="w-4 h-4" />
              Total Items
            </div>
            <div className="text-2xl font-bold text-theme-primary">{stats.totalQuantity}</div>
            <div className="text-xs text-theme-tertiary">{stats.totalItems} unique</div>
          </div>
          
          <div className="bg-theme-surface rounded-xl p-4 border border-theme">
            <div className="flex items-center gap-2 text-theme-secondary text-sm mb-1">
              <DollarSign className="w-4 h-4" />
              Manifest Cost
            </div>
            <div className="text-2xl font-bold text-theme-primary">{formatCurrency(stats.totalManifestCost)}</div>
          </div>
          
          <div className="bg-theme-surface rounded-xl p-4 border border-theme">
            <div className="flex items-center gap-2 text-theme-secondary text-sm mb-1">
              <Sparkles className="w-4 h-4" />
              Enriched
            </div>
            <div className="text-2xl font-bold text-theme-primary">{stats.enrichedCount}</div>
            <div className="text-xs text-theme-tertiary">of {stats.totalItems}</div>
          </div>
          
          <div className={`rounded-xl p-4 border ${
            stats.avgRank != null && stats.avgRank < 50000
              ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
              : stats.avgRank != null && stats.avgRank < 200000
              ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800'
              : 'bg-theme-surface border-theme'
          }`}>
            <div className="flex items-center gap-2 text-theme-secondary text-sm mb-1">
              <BarChart3 className="w-4 h-4" />
              Avg Rank
            </div>
            <div className={`text-2xl font-bold ${
              stats.avgRank != null && stats.avgRank < 50000 ? 'text-green-600 dark:text-green-400' :
              stats.avgRank != null && stats.avgRank < 200000 ? 'text-yellow-600 dark:text-yellow-400' :
              'text-theme-primary'
            }`}>
              {stats.avgRank != null ? formatNumber(stats.avgRank) : '—'}
            </div>
          </div>
        </div>
      )}

      {/* Loading indicator */}
      {loading && items.length === 0 && (
        <div className="bg-theme-surface rounded-xl border border-theme p-8 flex flex-col items-center justify-center">
          <Loader className="w-8 h-8 text-purple-500 animate-spin mb-4" />
          <p className="text-theme-secondary">Loading items...</p>
        </div>
      )}

      {/* Upload Zone (show when no items and not loading) */}
      {items.length === 0 && !showPreview && !loading && (
        <div className="bg-theme-surface rounded-xl border border-theme p-8">
          <div
            {...getRootProps()}
            className={`
              border-2 border-dashed rounded-xl p-12 text-center cursor-pointer
              transition-all duration-200
              ${isDragActive 
                ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20 scale-[1.02]' 
                : 'border-theme hover:border-purple-500/50 hover:bg-theme-hover'
              }
            `}
          >
            <input {...getInputProps()} />
            <div className="flex flex-col items-center">
              <div className={`
                w-20 h-20 rounded-full flex items-center justify-center mb-4
                ${isDragActive ? 'bg-purple-500/20' : 'bg-theme-primary'}
              `}>
                {isDragActive ? (
                  <FileSpreadsheet className="w-10 h-10 text-purple-500" />
                ) : (
                  <Upload className="w-10 h-10 text-theme-tertiary" />
                )}
              </div>
              <p className="text-lg text-theme-primary font-medium mb-2">
                {isDragActive ? 'Drop your manifest here' : 'Drop WhatNot manifest here'}
              </p>
              <p className="text-sm text-theme-secondary">
                or click to browse • Supports .xlsx, .xls, .csv
              </p>
              <div className="mt-6 p-4 bg-theme-primary rounded-lg text-left max-w-md">
                <p className="text-sm text-theme-secondary mb-2">
                  <strong className="text-theme-primary">Expected columns:</strong>
                </p>
                <ul className="text-sm text-theme-tertiary space-y-1">
                  <li>• ASIN (required)</li>
                  <li>• Item Description / Title</li>
                  <li>• Qty / Quantity</li>
                  <li>• Unit Retail / Price</li>
                  <li>• Brand, Condition, Lot ID (optional)</li>
                </ul>
              </div>
            </div>
          </div>
          
          {/* Parse Error */}
          {parseError && (
            <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-2 text-red-600 dark:text-red-400 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {parseError}
            </div>
          )}
        </div>
      )}

      {/* Preview Modal */}
      {showPreview && parsedData && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-theme-surface rounded-xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-auto">
            <div className="flex items-center justify-between p-4 border-b border-theme">
              <h2 className="text-lg font-semibold text-theme-primary flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-purple-500" />
                Import Preview
              </h2>
              <button
                onClick={() => {
                  setShowPreview(false);
                  setParsedData(null);
                }}
                className="p-1 rounded-lg text-theme-tertiary hover:text-theme-primary hover:bg-theme-hover transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-4">
              <div className="bg-theme-primary rounded-lg p-4 mb-4">
                <h3 className="font-medium text-theme-primary mb-3 flex items-center gap-2">
                  <FileSpreadsheet className="w-4 h-4 text-purple-500" />
                  {parsedData.fileName}
                </h3>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="text-theme-secondary">Total rows:</div>
                  <div className="text-theme-primary">{parsedData.totalRows}</div>
                  <div className="text-theme-secondary">Valid items:</div>
                  <div className="text-green-600 font-medium">{parsedData.validItems.length}</div>
                  {parsedData.invalidRows.length > 0 && (
                    <>
                      <div className="text-theme-secondary">Invalid rows:</div>
                      <div className="text-yellow-600">{parsedData.invalidRows.length}</div>
                    </>
                  )}
                  <div className="text-theme-secondary">Total manifest cost:</div>
                  <div className="text-theme-primary font-medium">{formatCurrency(parsedData.totalManifestCost)}</div>
                </div>
              </div>
              
              {/* Sample Items */}
              <div className="mb-4">
                <p className="text-sm text-theme-secondary mb-2">Sample items to import:</p>
                <div className="space-y-2 max-h-40 overflow-auto">
                  {parsedData.validItems.slice(0, 5).map((item, idx) => (
                    <div key={idx} className="flex items-center gap-2 p-2 bg-theme-primary rounded text-sm">
                      <span className="font-mono text-purple-500">{item.asin}</span>
                      <span className="text-theme-secondary truncate flex-1">{item.title || 'No title'}</span>
                      <span className="text-theme-tertiary">×{item.quantity}</span>
                      <span className="text-green-600">{formatCurrency(item.manifest_price)}</span>
                    </div>
                  ))}
                  {parsedData.validItems.length > 5 && (
                    <p className="text-xs text-theme-tertiary text-center">
                      +{parsedData.validItems.length - 5} more items
                    </p>
                  )}
                </div>
              </div>
              
              <button
                onClick={handleImport}
                disabled={importing}
                className="w-full py-3 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
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
          </div>
        </div>
      )}

      {/* Items Table */}
      {items.length > 0 && (
        <div className="bg-theme-surface rounded-xl border border-theme overflow-hidden">
          {/* Toolbar */}
          <div className="p-4 border-b border-theme flex flex-col sm:flex-row gap-4">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-theme-tertiary" />
              <input
                type="text"
                placeholder="Search ASIN, title, or brand..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-theme-primary border border-theme rounded-lg text-theme-primary placeholder:text-theme-tertiary focus:outline-none focus:ring-2 focus:ring-purple-500/50"
              />
            </div>
            
            {/* Lot Filter */}
            {uniqueLots.length > 0 && (
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-theme-tertiary" />
                <select
                  value={lotFilter}
                  onChange={(e) => setLotFilter(e.target.value)}
                  className="px-3 py-2 bg-theme-primary border border-theme rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                >
                  <option value="all">All Lots</option>
                  {uniqueLots.map(lot => (
                    <option key={lot} value={lot}>{lot}</option>
                  ))}
                </select>
              </div>
            )}
            
            {/* Refresh Button */}
            <button
              onClick={fetchItems}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-theme-hover hover:bg-theme-primary text-theme-secondary hover:text-theme-primary disabled:opacity-50 font-medium rounded-lg transition-colors"
              title="Refresh items from database"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            
            {/* New Import Button */}
            <button
              onClick={() => {
                setItems([]);
                setParsedData(null);
                setParseError(null);
              }}
              className="flex items-center gap-2 px-4 py-2 bg-theme-hover hover:bg-theme-primary text-theme-secondary hover:text-theme-primary font-medium rounded-lg transition-colors"
            >
              <Upload className="w-4 h-4" />
              New Import
            </button>
          </div>
          
          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-theme-primary text-theme-secondary text-sm">
                <tr>
                  <th className="w-10 px-4 py-3"></th>
                  <th 
                    className="px-4 py-3 text-left cursor-pointer hover:text-theme-primary"
                    onClick={() => handleSort('asin')}
                  >
                    ASIN <SortIndicator column="asin" />
                  </th>
                  <th 
                    className="px-4 py-3 text-left cursor-pointer hover:text-theme-primary"
                    onClick={() => handleSort('title')}
                  >
                    Title <SortIndicator column="title" />
                  </th>
                  <th 
                    className="px-4 py-3 text-center cursor-pointer hover:text-theme-primary"
                    onClick={() => handleSort('quantity')}
                  >
                    Qty <SortIndicator column="quantity" />
                  </th>
                  <th 
                    className="px-4 py-3 text-right cursor-pointer hover:text-theme-primary"
                    onClick={() => handleSort('manifest_price')}
                  >
                    Manifest <SortIndicator column="manifest_price" />
                  </th>
                  <th 
                    className="px-4 py-3 text-right cursor-pointer hover:text-theme-primary"
                    onClick={() => handleSort('amazon_price')}
                  >
                    Amazon <SortIndicator column="amazon_price" />
                  </th>
                  <th 
                    className="px-4 py-3 text-right cursor-pointer hover:text-theme-primary"
                    onClick={() => handleSort('sales_rank')}
                  >
                    Rank <SortIndicator column="sales_rank" />
                  </th>
                  <th 
                    className="px-4 py-3 text-left cursor-pointer hover:text-theme-primary"
                    onClick={() => handleSort('category')}
                  >
                    Category <SortIndicator column="category" />
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-theme">
                {filteredItems.map((item) => {
                  const rankStyle = getRankStyle(item.sales_rank, item.enriched);
                  const isExpanded = expandedRows.has(item.id);
                  
                  return (
                    <>
                      <tr 
                        key={item.id} 
                        className={`${rankStyle.bg} hover:bg-theme-hover/50 transition-colors`}
                      >
                        <td className="px-4 py-3">
                          <button
                            onClick={() => toggleExpanded(item.id)}
                            className="p-1 rounded text-theme-tertiary hover:text-theme-primary"
                          >
                            {isExpanded ? (
                              <ChevronDown className="w-4 h-4" />
                            ) : (
                              <ChevronRight className="w-4 h-4" />
                            )}
                          </button>
                        </td>
                        <td className="px-4 py-3">
                          <a
                            href={`https://www.amazon.com/dp/${item.asin}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-mono text-sm text-purple-600 dark:text-purple-400 hover:underline flex items-center gap-1"
                          >
                            {item.asin}
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {item.image_url && (
                              <img 
                                src={item.image_url} 
                                alt="" 
                                className="w-8 h-8 object-contain bg-white rounded"
                              />
                            )}
                            <span className="text-sm text-theme-primary truncate max-w-[200px]">
                              {item.title || '—'}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center text-sm text-theme-primary">
                          {item.quantity}
                        </td>
                        <td className="px-4 py-3 text-right text-sm text-theme-primary">
                          {formatCurrency(item.manifest_price)}
                        </td>
                        <td className="px-4 py-3 text-right text-sm text-theme-primary">
                          {item.enriched ? formatCurrency(item.amazon_price) : '—'}
                        </td>
                        <td className={`px-4 py-3 text-right text-sm font-medium ${rankStyle.text}`}>
                          {item.enriched ? formatNumber(item.sales_rank) : '—'}
                        </td>
                        <td className="px-4 py-3 text-left text-sm text-theme-secondary truncate max-w-[150px]">
                          {item.enriched ? (item.category || '—') : '—'}
                        </td>
                      </tr>
                      
                      {/* Expanded Row */}
                      {isExpanded && (
                        <tr key={`${item.id}-expanded`} className="bg-theme-primary/50">
                          <td colSpan="7" className="px-4 py-4">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                              <div>
                                <span className="text-theme-tertiary">Brand:</span>
                                <span className="ml-2 text-theme-primary">{item.brand || '—'}</span>
                              </div>
                              <div>
                                <span className="text-theme-tertiary">Condition:</span>
                                <span className="ml-2 text-theme-primary">{item.condition || '—'}</span>
                              </div>
                              <div>
                                <span className="text-theme-tertiary">Lot ID:</span>
                                <span className="ml-2 text-theme-primary">{item.lot_id || '—'}</span>
                              </div>
                              <div>
                                <span className="text-theme-tertiary">Total Cost:</span>
                                <span className="ml-2 text-theme-primary">
                                  {formatCurrency((item.manifest_price || 0) * (item.quantity || 1))}
                                </span>
                              </div>
                              {item.enriched && (
                                <>
                                  <div>
                                    <span className="text-theme-tertiary">FBA Sellers:</span>
                                    <span className="ml-2 text-theme-primary">{item.fba_sellers ?? '—'}</span>
                                  </div>
                                  <div>
                                    <span className="text-theme-tertiary">FBM Sellers:</span>
                                    <span className="ml-2 text-theme-primary">{item.fbm_sellers ?? '—'}</span>
                                  </div>
                                  <div>
                                    <span className="text-theme-tertiary">90-Day Avg Rank:</span>
                                    <span className="ml-2 text-theme-primary">{item.sales_rank_90_avg ? formatNumber(item.sales_rank_90_avg) : '—'}</span>
                                  </div>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
          
          {/* Table Footer */}
          <div className="px-4 py-3 border-t border-theme text-sm text-theme-secondary">
            Showing {filteredItems.length} of {items.length} items
            {lotFilter !== 'all' && ` (filtered by lot: ${lotFilter})`}
          </div>
        </div>
      )}
    </div>
  );
}

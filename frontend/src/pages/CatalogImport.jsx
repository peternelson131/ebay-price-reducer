/**
 * CatalogImport Component
 * 
 * Allows users to import their Amazon Influencer ASINs via Excel/CSV upload.
 * Shows import status and correlations found for each ASIN.
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
  ChevronDown,
  ChevronRight,
  X,
  Trash2,
  Search,
  Plus,
  CheckSquare,
  Square
} from 'lucide-react';

// Status configuration
const STATUS_CONFIG = {
  imported: { 
    icon: FileSpreadsheet, 
    label: 'Imported', 
    emoji: '📥',
    bgClass: 'bg-gray-100 dark:bg-gray-800', 
    textClass: 'text-gray-600 dark:text-gray-400',
    animated: false,
    canSync: true
  },
  pending: { 
    icon: Clock, 
    label: 'Queued', 
    emoji: '⏳',
    bgClass: 'bg-yellow-50 dark:bg-yellow-900/30', 
    textClass: 'text-yellow-600 dark:text-yellow-400',
    animated: false,
    canSync: false
  },
  processing: { 
    icon: Loader, 
    label: 'Processing', 
    emoji: '🔄',
    bgClass: 'bg-blue-50 dark:bg-blue-900/30', 
    textClass: 'text-blue-600 dark:text-blue-400',
    animated: true,
    canSync: false
  },
  processed: { 
    icon: CheckCircle, 
    label: 'Processed', 
    emoji: '✅',
    bgClass: 'bg-green-50 dark:bg-green-900/30', 
    textClass: 'text-green-600 dark:text-green-400',
    animated: false,
    canSync: false
  },
  error: { 
    icon: AlertCircle, 
    label: 'Error', 
    emoji: '❌',
    bgClass: 'bg-red-50 dark:bg-red-900/30', 
    textClass: 'text-red-600 dark:text-red-400',
    animated: false,
    canSync: true
  }
};

// Helper to find ASIN column in Excel data
const findAsinColumn = (headers) => {
  const asinPatterns = ['asin', 'amazon asin', 'product asin', 'asin code'];
  const lowerHeaders = headers.map(h => (h || '').toString().toLowerCase().trim());
  
  for (const pattern of asinPatterns) {
    const index = lowerHeaders.findIndex(h => h === pattern || h.includes(pattern));
    if (index !== -1) return index;
  }
  
  // Fallback: look for column with ASIN-like values in first data row
  return 0; // Default to first column
};

// Validate ASIN format
const isValidAsin = (value) => {
  if (!value || typeof value !== 'string') return false;
  const trimmed = value.trim().toUpperCase();
  return /^B[0-9A-Z]{9}$/.test(trimmed);
};

export default function CatalogImport() {
  // State
  const [imports, setImports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [expandedRows, setExpandedRows] = useState(new Set());
  const [selectedIds, setSelectedIds] = useState(new Set());
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const pageSize = 25;
  
  // Sort state
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState('desc');
  
  // Image fetch state
  const [fetchingImages, setFetchingImages] = useState(false);
  
  // Sync all state
  const [syncingAll, setSyncingAll] = useState(false);
  
  // File upload state
  const [parsedData, setParsedData] = useState(null);
  const [parseError, setParseError] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  
  // Polling ref
  const pollingRef = useRef(null);
  
  // Debounce ref for search
  const searchDebounceRef = useRef(null);

  // Define loadImports function (needs to be before useEffects that call it)
  const loadImports = async (page, sort, order, search) => {
    // Use passed values or fall back to current state
    const p = page ?? currentPage;
    const s = sort ?? sortBy;
    const o = order ?? sortOrder;
    const q = search !== undefined ? search : debouncedSearch;
    try {
      const token = await userAPI.getAuthToken();
      const params = new URLSearchParams({
        action: 'list',
        limit: pageSize.toString(),
        page: p.toString(),
        sortBy: s,
        sortOrder: o
      });
      // Add search param if present
      if (q) {
        params.set('search', q);
      }
      const response = await fetch(`/.netlify/functions/catalog-import?${params}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      if (data.success) {
        setImports(data.items || []);
        setTotalPages(data.pagination?.pages || 1);
        setTotalCount(data.pagination?.total || 0);
        setCurrentPage(p);
      }
    } catch (err) {
      console.error('Failed to load catalog imports:', err);
    } finally {
      setLoading(false);
    }
  };

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  const startPolling = useCallback(() => {
    if (pollingRef.current) return; // Already polling
    
    pollingRef.current = setInterval(() => {
      loadImports(currentPage, sortBy, sortOrder, debouncedSearch);
    }, 12000); // Poll every 12 seconds
  }, [currentPage, sortBy, sortOrder, debouncedSearch]);

  // Load imported ASINs on mount
  useEffect(() => {
    loadImports();
    return () => {
      stopPolling();
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current);
      }
    };
  }, []);

  // Debounce search input
  useEffect(() => {
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }
    
    searchDebounceRef.current = setTimeout(() => {
      if (searchQuery !== debouncedSearch) {
        setDebouncedSearch(searchQuery);
        setCurrentPage(1);
        loadImports(1, sortBy, sortOrder, searchQuery);
      }
    }, 300);
    
    return () => {
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current);
      }
    };
  }, [searchQuery]);

  // Start polling when we have processing items
  useEffect(() => {
    const hasProcessing = imports.some(i => i.status === 'pending' || i.status === 'processing');
    if (hasProcessing) {
      startPolling();
    } else {
      stopPolling();
    }
  }, [imports]);

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
        const asinColumnIndex = findAsinColumn(headers);
        
        // Extract ASINs from data rows
        const asins = [];
        const invalidRows = [];
        
        for (let i = 1; i < jsonData.length; i++) {
          const row = jsonData[i];
          const rawValue = row[asinColumnIndex];
          
          if (!rawValue) continue;
          
          const value = rawValue.toString().trim().toUpperCase();
          
          if (isValidAsin(value)) {
            // Extract all available fields
            const titleIndex = headers.findIndex(h => 
              (h || '').toLowerCase().includes('title') || 
              (h || '').toLowerCase().includes('name')
            );
            const imageIndex = headers.findIndex(h => 
              (h || '').toLowerCase().includes('image') || 
              (h || '').toLowerCase().includes('photo')
            );
            const categoryIndex = headers.findIndex(h => 
              (h || '').toLowerCase().includes('category')
            );
            const priceIndex = headers.findIndex(h => 
              (h || '').toLowerCase().includes('price')
            );
            
            const title = titleIndex !== -1 ? row[titleIndex] : null;
            const image_url = imageIndex !== -1 ? row[imageIndex] : null;
            const category = categoryIndex !== -1 ? row[categoryIndex] : null;
            const price = priceIndex !== -1 ? parseFloat(row[priceIndex]) || null : null;
            
            asins.push({ 
              asin: value, 
              title: title?.toString() || null,
              image_url: image_url?.toString() || null,
              category: category?.toString() || null,
              price,
              rowNum: i + 1 
            });
          } else if (value) {
            invalidRows.push({ value, rowNum: i + 1 });
          }
        }
        
        if (asins.length === 0) {
          setParseError(`No valid ASINs found in the file. ${invalidRows.length > 0 ? `Found ${invalidRows.length} invalid values.` : ''}`);
          return;
        }
        
        // Deduplicate
        const uniqueAsins = [...new Map(asins.map(a => [a.asin, a])).values()];
        
        setParsedData({
          fileName: file.name,
          totalRows: jsonData.length - 1,
          validAsins: uniqueAsins,
          invalidRows,
          duplicatesRemoved: asins.length - uniqueAsins.length
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
    if (!parsedData?.validAsins?.length) return;
    
    setImporting(true);
    
    try {
      const token = await userAPI.getAuthToken();
      const response = await fetch('/.netlify/functions/catalog-import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          action: 'import',
          asins: parsedData.validAsins.map(a => ({
            asin: a.asin,
            title: a.title,
            image_url: a.image_url,
            category: a.category,
            price: a.price
          }))
        })
      });
      
      const data = await response.json();
      
      if (data.success) {
        setShowPreview(false);
        setParsedData(null);
        await loadImports();
      } else {
        setParseError(data.error || 'Import failed');
      }
    } catch (err) {
      console.error('Import error:', err);
      setParseError('Failed to import ASINs. Please try again.');
    } finally {
      setImporting(false);
    }
  };

  // Delete import
  const handleDelete = async (importId) => {
    if (!confirm('Are you sure you want to delete this import?')) return;
    
    try {
      const token = await userAPI.getAuthToken();
      const response = await fetch('/.netlify/functions/catalog-import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          action: 'delete',
          id: importId
        })
      });
      
      if (response.ok) {
        setImports(prev => prev.filter(i => i.id !== importId));
      }
    } catch (err) {
      console.error('Delete error:', err);
    }
  };

  // Queue items for sync (find correlations)
  const handleSync = async (importIds) => {
    try {
      const token = await userAPI.getAuthToken();
      const response = await fetch('/.netlify/functions/catalog-import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          action: 'sync',
          ids: importIds
        })
      });
      
      const data = await response.json();
      if (data.success) {
        // Update local state to show pending status
        setImports(prev => prev.map(i => 
          importIds.includes(i.id) ? { ...i, status: 'pending' } : i
        ));
        // Clear selection
        setSelectedIds(new Set());
      } else {
        alert(data.error || 'Failed to queue for sync');
      }
    } catch (err) {
      console.error('Sync error:', err);
      alert('Failed to queue for sync');
    }
  };

  // Fetch images from Keepa for items missing images
  const handleFetchImages = async () => {
    setFetchingImages(true);
    try {
      const token = await userAPI.getAuthToken();
      const response = await fetch('/.netlify/functions/catalog-import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          action: 'fetch_images',
          limit: 100
        })
      });
      
      const data = await response.json();
      if (data.success) {
        alert(`✅ ${data.message}`);
        // Reload to show updated images
        await loadImports(currentPage);
      } else {
        alert(data.error || 'Failed to fetch images');
      }
    } catch (err) {
      console.error('Fetch images error:', err);
      alert('Failed to fetch images from Keepa');
    } finally {
      setFetchingImages(false);
    }
  };

  // Create task from correlation
  const handleCreateTask = async (importItem, correlation) => {
    try {
      const token = await userAPI.getAuthToken();
      const response = await fetch('/.netlify/functions/catalog-import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          action: 'create_task',
          import_id: importItem.id,
          source_asin: importItem.asin,
          target_asin: correlation.asin,
          marketplace: 'US' // Default, could be expanded
        })
      });
      
      const data = await response.json();
      if (data.success) {
        alert('Task created successfully! Check the Upload Tasks page.');
      } else {
        alert(data.error || 'Failed to create task');
      }
    } catch (err) {
      console.error('Create task error:', err);
      alert('Failed to create task');
    }
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

  // Toggle selection of individual item
  const toggleSelected = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Toggle select all syncable items on current page
  const toggleSelectAll = () => {
    const syncableIds = filteredImports
      .filter(item => STATUS_CONFIG[item.status]?.canSync)
      .map(item => item.id);
    
    const allSelected = syncableIds.every(id => selectedIds.has(id));
    
    if (allSelected) {
      // Deselect all
      setSelectedIds(prev => {
        const next = new Set(prev);
        syncableIds.forEach(id => next.delete(id));
        return next;
      });
    } else {
      // Select all syncable
      setSelectedIds(prev => {
        const next = new Set(prev);
        syncableIds.forEach(id => next.add(id));
        return next;
      });
    }
  };

  // Handle sync selected items
  const handleSyncSelected = async () => {
    if (selectedIds.size === 0) return;
    await handleSync(Array.from(selectedIds));
  };

  // Handle sync ALL imported items
  const handleSyncAll = async () => {
    // Count items that would be synced
    const importedCount = imports.filter(i => i.status === 'imported').length;
    const errorCount = imports.filter(i => i.status === 'error').length;
    const totalSyncable = importedCount + errorCount;
    
    // If we only have current page data, use totalCount for better estimate
    const estimatedTotal = totalCount > totalSyncable ? totalCount : totalSyncable;
    
    if (estimatedTotal === 0) {
      alert('No items available to sync.');
      return;
    }
    
    const confirmed = confirm(`Queue all ${estimatedTotal} imported items for sync?\n\nThis will find correlations for all items with "Imported" or "Error" status.`);
    if (!confirmed) return;
    
    setSyncingAll(true);
    try {
      const token = await userAPI.getAuthToken();
      const response = await fetch('/.netlify/functions/catalog-import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          action: 'sync_all'
        })
      });
      
      const data = await response.json();
      if (data.success) {
        alert(`✅ ${data.queued || 'All'} items queued for sync!`);
        // Reload to show updated statuses
        await loadImports(currentPage);
      } else {
        alert(data.error || 'Failed to queue items for sync');
      }
    } catch (err) {
      console.error('Sync all error:', err);
      alert('Failed to sync all items');
    } finally {
      setSyncingAll(false);
    }
  };

  // Calculate syncable items for UI
  const syncableItems = filteredImports.filter(item => STATUS_CONFIG[item.status]?.canSync);
  const allSyncableSelected = syncableItems.length > 0 && 
    syncableItems.every(item => selectedIds.has(item.id));
  const someSyncableSelected = syncableItems.some(item => selectedIds.has(item.id));

  // Handle sort change
  const handleSortChange = (value) => {
    const [newSortBy, newSortOrder] = value.split(':');
    setSortBy(newSortBy);
    setSortOrder(newSortOrder);
    setCurrentPage(1);
    loadImports(1, newSortBy, newSortOrder, debouncedSearch);
  };

  // Sort options
  const sortOptions = [
    { value: 'created_at:desc', label: 'Date (newest)' },
    { value: 'created_at:asc', label: 'Date (oldest)' },
    { value: 'status:asc', label: 'Status' },
    { value: 'title:asc', label: 'Title (A-Z)' },
    { value: 'asin:asc', label: 'ASIN' }
  ];

  // Filter imports (search is now server-side, only filter by status client-side)
  const filteredImports = imports.filter(item => {
    if (statusFilter !== 'all' && item.status !== statusFilter) return false;
    return true;
  });

  // Status counts for filter badges
  const statusCounts = {
    all: imports.length,
    pending: imports.filter(i => i.status === 'pending').length,
    processing: imports.filter(i => i.status === 'processing').length,
    processed: imports.filter(i => i.status === 'processed').length,
    error: imports.filter(i => i.status === 'error').length
  };

  // Render status badge
  const StatusBadge = ({ status }) => {
    const config = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
    const Icon = config.icon;
    
    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${config.bgClass} ${config.textClass}`}>
        <Icon className={`w-3.5 h-3.5 ${config.animated ? 'animate-spin' : ''}`} />
        {config.label}
      </span>
    );
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-theme-primary flex items-center gap-3">
            📥 Catalog Import
          </h1>
          <p className="text-theme-secondary mt-1">
            Import your Amazon Influencer ASINs and find correlations
          </p>
        </div>
        <button
          onClick={loadImports}
          disabled={loading}
          className="p-2 text-theme-secondary hover:text-accent transition-colors"
          title="Refresh"
        >
          <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-theme-surface rounded-xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-theme">
              <h2 className="text-lg font-semibold text-theme-primary flex items-center gap-2">
                <Upload className="w-5 h-5 text-accent" />
                Import ASINs from File
              </h2>
              <button
                onClick={() => {
                  setShowUploadModal(false);
                  setParsedData(null);
                  setParseError(null);
                }}
                className="p-1 rounded-lg text-theme-tertiary hover:text-theme-primary hover:bg-theme-hover transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            {/* Modal Body */}
            <div className="p-4">
              {/* Dropzone */}
              <div
                {...getRootProps()}
                className={`
                  border-2 border-dashed rounded-xl p-8 text-center cursor-pointer
                  transition-all duration-200
                  ${isDragActive 
                    ? 'border-accent bg-accent/5 scale-[1.02]' 
                    : 'border-theme hover:border-accent/50 hover:bg-theme-hover'
                  }
                `}
              >
                <input {...getInputProps()} />
                <div className="flex flex-col items-center">
                  <div className={`
                    w-16 h-16 rounded-full flex items-center justify-center mb-4
                    ${isDragActive ? 'bg-accent/20' : 'bg-theme-primary'}
                  `}>
                    {isDragActive ? (
                      <FileSpreadsheet className="w-8 h-8 text-accent" />
                    ) : (
                      <Upload className="w-8 h-8 text-theme-tertiary" />
                    )}
                  </div>
                  <p className="text-theme-primary font-medium mb-1">
                    {isDragActive ? 'Drop your file here' : 'Drop Excel/CSV file here'}
                  </p>
                  <p className="text-sm text-theme-secondary">
                    or click to browse • Supports .xlsx, .xls, .csv
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
                      <div className="text-success font-medium">{parsedData.validAsins.length}</div>
                      {parsedData.duplicatesRemoved > 0 && (
                        <>
                          <div className="text-theme-secondary">Duplicates removed:</div>
                          <div className="text-warning">{parsedData.duplicatesRemoved}</div>
                        </>
                      )}
                      {parsedData.invalidRows.length > 0 && (
                        <>
                          <div className="text-theme-secondary">Invalid rows:</div>
                          <div className="text-error">{parsedData.invalidRows.length}</div>
                        </>
                      )}
                    </div>
                  </div>
                  
                  {/* Sample ASINs */}
                  <div className="mb-4">
                    <p className="text-sm text-theme-secondary mb-2">Sample ASINs to import:</p>
                    <div className="flex flex-wrap gap-1.5">
                      {parsedData.validAsins.slice(0, 8).map(a => (
                        <span key={a.asin} className="px-2 py-1 bg-theme-primary rounded text-xs font-mono text-accent">
                          {a.asin}
                        </span>
                      ))}
                      {parsedData.validAsins.length > 8 && (
                        <span className="px-2 py-1 bg-theme-primary rounded text-xs text-theme-secondary">
                          +{parsedData.validAsins.length - 8} more
                        </span>
                      )}
                    </div>
                  </div>
                  
                  {/* Import Button */}
                  <button
                    onClick={async () => {
                      await handleImport();
                      if (!parseError) {
                        setShowUploadModal(false);
                      }
                    }}
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
                        <Plus className="w-4 h-4" />
                        Import {parsedData.validAsins.length} ASINs
                      </>
                    )}
                  </button>
                </div>
              )}
              
              {/* Instructions */}
              {!parsedData && (
                <div className="mt-4 p-3 bg-theme-primary rounded-lg">
                  <p className="text-sm text-theme-secondary">
                    <strong className="text-theme-primary">Required column:</strong> ASIN (e.g., B01N9SPQHQ)
                  </p>
                  <p className="text-sm text-theme-secondary mt-1">
                    <strong className="text-theme-primary">Optional:</strong> Product Title, Category, Price
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="mb-6 flex flex-wrap gap-3">
        <button
          onClick={() => setShowUploadModal(true)}
          className="px-4 py-2.5 bg-accent hover:bg-accent-hover text-white font-medium rounded-lg transition-colors flex items-center gap-2"
        >
          <Upload className="w-4 h-4" />
          Import from File
        </button>
        
        <button
          onClick={handleFetchImages}
          disabled={fetchingImages}
          className="px-4 py-2.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-medium rounded-lg transition-colors flex items-center gap-2"
        >
          {fetchingImages ? (
            <Loader className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
          {fetchingImages ? 'Fetching...' : 'Fetch Images from Keepa'}
        </button>
        
        {/* Sync All button */}
        <button
          onClick={handleSyncAll}
          disabled={syncingAll || totalCount === 0}
          className="px-4 py-2.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-medium rounded-lg transition-colors flex items-center gap-2"
        >
          {syncingAll ? (
            <Loader className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
          {syncingAll ? 'Queuing...' : 'Sync All'}
        </button>
        
        {/* Sync Selected button */}
        {selectedIds.size > 0 && (
          <button
            onClick={handleSyncSelected}
            className="px-4 py-2.5 bg-orange-500 hover:bg-orange-600 text-white font-medium rounded-lg transition-colors flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Sync Selected ({selectedIds.size})
          </button>
        )}
        
        {parseError && !showUploadModal && (
          <div className="w-full mt-3 p-3 bg-error/10 border border-error/30 rounded-lg flex items-center gap-2 text-error text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {parseError}
          </div>
        )}
      </div>

      {/* Search and Filter Bar */}
      {imports.length > 0 && (
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
                onClick={() => {
                  setSearchQuery('');
                  setDebouncedSearch('');
                  setCurrentPage(1);
                  loadImports(1, sortBy, sortOrder, '');
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-theme-tertiary hover:text-theme-primary"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Sort Dropdown */}
          <select
            value={`${sortBy}:${sortOrder}`}
            onChange={(e) => handleSortChange(e.target.value)}
            className="px-3 py-2 bg-theme-surface border border-theme rounded-lg text-theme-primary focus:outline-none focus:border-accent cursor-pointer"
          >
            {sortOptions.map((option) => (
              <option key={option.value} value={option.value}>
                Sort: {option.label}
              </option>
            ))}
          </select>

          {/* Status Filter */}
          <div className="flex gap-2 flex-wrap">
            {['all', 'pending', 'processing', 'processed', 'error'].map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
                  statusFilter === status
                    ? 'bg-accent text-white'
                    : 'bg-theme-surface border border-theme text-theme-secondary hover:text-theme-primary'
                }`}
              >
                {status !== 'all' && (
                  <span>{STATUS_CONFIG[status]?.emoji}</span>
                )}
                <span className="capitalize">{status}</span>
                <span className="text-xs opacity-70">({statusCounts[status]})</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Import List */}
      {loading && imports.length === 0 ? (
        <div className="text-center py-12">
          <Loader className="w-8 h-8 animate-spin mx-auto mb-3 text-accent" />
          <p className="text-theme-secondary">Loading imports...</p>
        </div>
      ) : filteredImports.length === 0 ? (
        <div className="text-center py-12 bg-theme-surface rounded-lg border border-theme">
          <div className="w-16 h-16 bg-theme-primary rounded-full flex items-center justify-center mx-auto mb-4">
            {searchQuery || statusFilter !== 'all' ? (
              <Search className="w-8 h-8 text-theme-tertiary" />
            ) : (
              <FileSpreadsheet className="w-8 h-8 text-theme-tertiary" />
            )}
          </div>
          <h3 className="text-lg font-medium text-theme-primary mb-1">
            {searchQuery || statusFilter !== 'all' ? 'No matches found' : 'No imports yet'}
          </h3>
          <p className="text-theme-secondary">
            {searchQuery || statusFilter !== 'all' 
              ? 'Try adjusting your search or filters'
              : 'Upload an Excel file with your ASINs to get started'}
          </p>
        </div>
      ) : (
        <div className="bg-theme-surface rounded-lg border border-theme overflow-hidden">
          {/* Header Row */}
          <div className="hidden sm:grid sm:grid-cols-12 gap-4 px-4 py-3 bg-theme-primary border-b border-theme text-sm font-medium text-theme-secondary">
            <div className="col-span-1 flex items-center gap-2">
              {syncableItems.length > 0 && (
                <button
                  onClick={toggleSelectAll}
                  className="p-1 text-theme-tertiary hover:text-accent transition-colors"
                  title={allSyncableSelected ? 'Deselect all' : 'Select all syncable'}
                >
                  {allSyncableSelected ? (
                    <CheckSquare className="w-5 h-5 text-accent" />
                  ) : someSyncableSelected ? (
                    <CheckSquare className="w-5 h-5 text-theme-tertiary" />
                  ) : (
                    <Square className="w-5 h-5" />
                  )}
                </button>
              )}
            </div>
            <div className="col-span-1">Image</div>
            <div className="col-span-3">Title</div>
            <div className="col-span-2">ASIN</div>
            <div className="col-span-2">Status</div>
            <div className="col-span-2">Correlations</div>
            <div className="col-span-1">Actions</div>
          </div>

          {/* List Items */}
          <div className="divide-y divide-theme">
            {filteredImports.map((item) => {
              const isExpanded = expandedRows.has(item.id);
              const correlationCount = item.correlations?.length || 0;
              const statusConfig = STATUS_CONFIG[item.status] || STATUS_CONFIG.pending;
              
              return (
                <div key={item.id}>
                  {/* Main Row */}
                  <div 
                    className={`grid grid-cols-1 sm:grid-cols-12 gap-4 px-4 py-3 items-center hover:bg-theme-hover transition-colors ${
                      isExpanded ? 'bg-theme-hover' : ''
                    }`}
                  >
                    {/* Checkbox + Expand Toggle */}
                    <div className="col-span-1 hidden sm:flex items-center gap-1">
                      {/* Checkbox for syncable items */}
                      {statusConfig.canSync ? (
                        <button
                          onClick={() => toggleSelected(item.id)}
                          className="p-1 text-theme-tertiary hover:text-accent transition-colors"
                        >
                          {selectedIds.has(item.id) ? (
                            <CheckSquare className="w-5 h-5 text-accent" />
                          ) : (
                            <Square className="w-5 h-5" />
                          )}
                        </button>
                      ) : (
                        <div className="w-7"></div>
                      )}
                      {/* Expand toggle */}
                      {correlationCount > 0 && (
                        <button
                          onClick={() => toggleExpanded(item.id)}
                          className="p-1 text-theme-tertiary hover:text-theme-primary hover:bg-theme-primary rounded transition-colors"
                        >
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4" />
                          ) : (
                            <ChevronRight className="w-4 h-4" />
                          )}
                        </button>
                      )}
                    </div>

                    {/* Image */}
                    <div className="col-span-1 flex justify-center sm:justify-start">
                      {item.image_url ? (
                        <img 
                          src={item.image_url} 
                          alt={item.title || item.asin}
                          className="w-12 h-12 object-contain bg-white rounded"
                        />
                      ) : (
                        <div className="w-12 h-12 bg-theme-primary rounded flex items-center justify-center">
                          <span className="text-2xl">📦</span>
                        </div>
                      )}
                    </div>

                    {/* Title */}
                    <div className="col-span-3">
                      <p className="text-theme-primary line-clamp-2 text-sm">
                        {item.title || 'Title pending...'}
                      </p>
                    </div>

                    {/* ASIN */}
                    <div className="col-span-2">
                      <a
                        href={`https://www.amazon.com/dp/${item.asin}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-sm text-accent hover:underline flex items-center gap-1"
                      >
                        {item.asin}
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>

                    {/* Status */}
                    <div className="col-span-2">
                      <StatusBadge status={item.status} />
                      {item.error_message && (
                        <p className="text-xs text-error mt-1 truncate" title={item.error_message}>
                          {item.error_message}
                        </p>
                      )}
                    </div>

                    {/* Correlations Count */}
                    <div className="col-span-2">
                      {item.status === 'processed' ? (
                        <button
                          onClick={() => toggleExpanded(item.id)}
                          className={`text-sm font-medium ${
                            correlationCount > 0 
                              ? 'text-accent hover:underline cursor-pointer' 
                              : 'text-theme-tertiary'
                          }`}
                        >
                          {correlationCount > 0 ? (
                            <span className="flex items-center gap-1">
                              {correlationCount} found
                              {!isExpanded && <ChevronRight className="w-4 h-4" />}
                            </span>
                          ) : (
                            'None found'
                          )}
                        </button>
                      ) : (
                        <span className="text-sm text-theme-tertiary">—</span>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="col-span-1 flex justify-end gap-2">
                      {/* Sync button - only for imported/error status */}
                      {(item.status === 'imported' || item.status === 'error') && (
                        <button
                          onClick={() => handleSync([item.id])}
                          className="px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-1"
                          title="Find Correlations"
                        >
                          <RefreshCw className="w-3 h-3" />
                          Sync
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(item.id)}
                        className="p-2 text-theme-tertiary hover:text-error hover:bg-error/10 rounded-lg transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Expanded Correlations */}
                  {isExpanded && item.correlations && item.correlations.length > 0 && (
                    <div className="px-4 pb-4 bg-theme-primary">
                      <div className="ml-6 sm:ml-12 border-l-2 border-accent/30 pl-4 space-y-2">
                        <div className="text-xs font-medium text-theme-secondary py-2">
                          Related Products ({correlationCount})
                        </div>
                        {item.correlations.map((corr, idx) => (
                          <div 
                            key={corr.asin || idx}
                            className="flex items-center gap-3 p-3 bg-theme-surface rounded-lg border border-theme"
                          >
                            {/* Correlation Image */}
                            {corr.image_url ? (
                              <img 
                                src={corr.image_url}
                                alt={corr.title || corr.asin}
                                className="w-10 h-10 object-contain bg-white rounded flex-shrink-0"
                              />
                            ) : (
                              <div className="w-10 h-10 bg-theme-primary rounded flex items-center justify-center flex-shrink-0">
                                <span className="text-lg">📦</span>
                              </div>
                            )}
                            
                            {/* Correlation Info */}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-theme-primary truncate">
                                {corr.title || 'Unknown Title'}
                              </p>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="font-mono text-xs text-accent">{corr.asin}</span>
                                {corr.type && (
                                  <span className={`text-xs px-1.5 py-0.5 rounded ${
                                    corr.type === 'variation'
                                      ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400'
                                      : 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                                  }`}>
                                    {corr.type}
                                  </span>
                                )}
                              </div>
                            </div>
                            
                            {/* Correlation Actions */}
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <a
                                href={`https://www.amazon.com/dp/${corr.asin}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-2 text-theme-secondary hover:text-accent hover:bg-theme-hover rounded-lg transition-colors"
                                title="View on Amazon"
                              >
                                <ExternalLink className="w-4 h-4" />
                              </a>
                              <button
                                onClick={() => handleCreateTask(item, corr)}
                                className="px-3 py-1.5 text-xs bg-accent/10 text-accent hover:bg-accent/20 rounded-lg transition-colors flex items-center gap-1"
                              >
                                <Plus className="w-3 h-3" />
                                Create Task
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-between">
          <div className="text-sm text-theme-secondary">
            Showing {((currentPage - 1) * pageSize) + 1} - {Math.min(currentPage * pageSize, totalCount)} of {totalCount} items
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => loadImports(1)}
              disabled={currentPage === 1}
              className="px-3 py-1.5 text-sm border border-theme rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-theme-hover transition-colors"
            >
              First
            </button>
            <button
              onClick={() => loadImports(currentPage - 1)}
              disabled={currentPage === 1}
              className="px-3 py-1.5 text-sm border border-theme rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-theme-hover transition-colors"
            >
              Previous
            </button>
            <span className="px-3 py-1.5 text-sm text-theme-primary">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => loadImports(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="px-3 py-1.5 text-sm border border-theme rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-theme-hover transition-colors"
            >
              Next
            </button>
            <button
              onClick={() => loadImports(totalPages)}
              disabled={currentPage === totalPages}
              className="px-3 py-1.5 text-sm border border-theme rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-theme-hover transition-colors"
            >
              Last
            </button>
          </div>
        </div>
      )}

      {/* Auto-refresh indicator */}
      {imports.some(i => i.status === 'pending' || i.status === 'processing') && (
        <div className="mt-4 text-center text-sm text-theme-tertiary flex items-center justify-center gap-2">
          <div className="w-2 h-2 bg-accent rounded-full animate-pulse"></div>
          Auto-refreshing every 12 seconds
        </div>
      )}
    </div>
  );
}

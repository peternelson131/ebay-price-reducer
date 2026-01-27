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
  Square,
  Download,
  FolderInput,
  Package,
  Image as ImageIcon
} from 'lucide-react';

// Status configuration - simplified to 2 states
const STATUS_CONFIG = {
  imported: { 
    icon: Download, 
    label: 'Imported', 
    bgClass: 'bg-gray-100 dark:bg-gray-800', 
    textClass: 'text-gray-600 dark:text-gray-400',
    animated: false,
    canSync: true,
    clickable: false
  },
  processed: { 
    icon: CheckCircle, 
    label: 'Processed', 
    bgClass: 'bg-green-50 dark:bg-green-900/30', 
    textClass: 'text-green-600 dark:text-green-400',
    animated: false,
    canSync: false,
    clickable: true  // Can click to expand and see correlations
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
  const [statusFilter, setStatusFilter] = useState('imported');
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
  const [imageFetchProgress, setImageFetchProgress] = useState(null); // { message, inProgress }
  
  // Auto-fetch images on import
  const [autoFetchImages, setAutoFetchImages] = useState(true);
  
  // Export state
  const [exporting, setExporting] = useState(false);
  
  // Re-import merge mode
  const [mergeMode, setMergeMode] = useState('skip'); // 'skip' or 'merge'
  const [duplicateCheck, setDuplicateCheck] = useState(null); // { newCount, existingCount, existingAsins }
  
  // Sync all state
  const [syncingAll, setSyncingAll] = useState(false);
  const [processingQueue, setProcessingQueue] = useState(false);
  
  // Enhanced sync progress state
  const [syncingItems, setSyncingItems] = useState(new Set()); // IDs being synced
  const [syncStartTimes, setSyncStartTimes] = useState({}); // { id: timestamp }
  const [syncElapsedTimes, setSyncElapsedTimes] = useState({}); // { id: seconds }
  
  // Batch sync progress state
  const [batchSyncProgress, setBatchSyncProgress] = useState(null); // { current, total, currentAsin, startTime, cancelled }
  const batchSyncCancelledRef = useRef(false);
  
  // Image fetch elapsed time
  const [imageFetchStartTime, setImageFetchStartTime] = useState(null);
  
  // Correlations state (Feature: Correlation View & Actions)
  const [correlationsCache, setCorrelationsCache] = useState({}); // { asin: correlations[] }
  const [loadingCorrelations, setLoadingCorrelations] = useState(new Set()); // ASINs being fetched
  const [correlationActions, setCorrelationActions] = useState({}); // { asin: 'accepted'|'declined' }
  const [actionInProgress, setActionInProgress] = useState(null); // { asin, action: 'accepting'|'declining' }
  const [marketplaceModal, setMarketplaceModal] = useState(null); // { importItem, correlation }
  
  // File upload state
  const [parsedData, setParsedData] = useState(null);
  const [parseError, setParseError] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  
  // Polling ref
  const pollingRef = useRef(null);
  
  // Debounce ref for search
  const searchDebounceRef = useRef(null);

  // Refs for polling
  const loadImportsRef = useRef(null);
  
  // Define loadImports function
  const loadImports = useCallback(async (page, sort, order, search) => {
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
  }, [currentPage, sortBy, sortOrder, debouncedSearch]);
  
  // Keep ref updated with latest loadImports
  useEffect(() => {
    loadImportsRef.current = loadImports;
  }, [loadImports]);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  const startPolling = useCallback(() => {
    if (pollingRef.current) return; // Already polling
    
    pollingRef.current = setInterval(() => {
      if (loadImportsRef.current) {
        loadImportsRef.current();
      }
    }, 12000); // Poll every 12 seconds
  }, []);

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

  // Polling removed - simplified to 2 states (imported/processed)
  // Status changes directly from imported → processed on sync completion

  // Update elapsed times for syncing items every second
  useEffect(() => {
    if (syncingItems.size === 0 && !batchSyncProgress && !imageFetchStartTime) return;
    
    const interval = setInterval(() => {
      const now = Date.now();
      
      // Update individual sync elapsed times
      if (syncingItems.size > 0) {
        setSyncElapsedTimes(prev => {
          const updated = { ...prev };
          syncingItems.forEach(id => {
            const startTime = syncStartTimes[id];
            if (startTime) {
              updated[id] = Math.floor((now - startTime) / 1000);
            }
          });
          return updated;
        });
      }
      
      // Update batch sync elapsed time
      if (batchSyncProgress?.startTime) {
        setBatchSyncProgress(prev => prev ? {
          ...prev,
          elapsed: Math.floor((now - prev.startTime) / 1000)
        } : null);
      }
      
      // Update image fetch elapsed time
      if (imageFetchStartTime && imageFetchProgress?.inProgress) {
        setImageFetchProgress(prev => prev ? {
          ...prev,
          elapsed: Math.floor((now - imageFetchStartTime) / 1000)
        } : null);
      }
    }, 1000);
    
    return () => clearInterval(interval);
  }, [syncingItems, syncStartTimes, batchSyncProgress, imageFetchStartTime, imageFetchProgress?.inProgress]);

  // Check for duplicate ASINs in existing catalog (Feature 10)
  const checkForDuplicates = async (asins) => {
    try {
      const token = await userAPI.getAuthToken();
      const response = await fetch('/.netlify/functions/catalog-import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          action: 'check_duplicates',
          asins
        })
      });
      
      const data = await response.json();
      if (data.success) {
        const existingAsins = data.existingAsins || [];
        const newCount = asins.length - existingAsins.length;
        setDuplicateCheck({
          newCount,
          existingCount: existingAsins.length,
          existingAsins
        });
        // Reset merge mode based on duplicates found
        setMergeMode(existingAsins.length > 0 ? 'skip' : 'skip');
      }
    } catch (err) {
      console.error('Duplicate check error:', err);
      // Don't block import if check fails
      setDuplicateCheck(null);
    }
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
        
        // Check for existing ASINs (Feature 10: Re-import merge)
        checkForDuplicates(uniqueAsins.map(a => a.asin));
        
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
          mode: mergeMode, // Feature 10: pass merge mode ('skip' or 'merge')
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
        setDuplicateCheck(null);
        await loadImports();
        
        // Feature 8: Auto-fetch images after import
        if (autoFetchImages) {
          await handleFetchImages(true);
        }
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

  // Queue items for sync (find correlations) - single item
  const handleSync = async (importIds) => {
    const startTime = Date.now();
    
    // Mark items as syncing with start times
    setSyncingItems(prev => {
      const next = new Set(prev);
      importIds.forEach(id => next.add(id));
      return next;
    });
    setSyncStartTimes(prev => {
      const updated = { ...prev };
      importIds.forEach(id => { updated[id] = startTime; });
      return updated;
    });
    
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
        // Sync started - clear selection, status stays 'imported' until complete
        setSelectedIds(new Set());
        // Refresh data after a short delay to pick up changes
        setTimeout(() => loadImports(), 3000);
      } else {
        alert(data.error || 'Failed to sync');
      }
    } catch (err) {
      console.error('Sync error:', err);
      alert('Failed to queue for sync');
    } finally {
      // Remove from syncing state
      setSyncingItems(prev => {
        const next = new Set(prev);
        importIds.forEach(id => next.delete(id));
        return next;
      });
      // Clean up elapsed times after a delay
      setTimeout(() => {
        setSyncElapsedTimes(prev => {
          const updated = { ...prev };
          importIds.forEach(id => { delete updated[id]; });
          return updated;
        });
        setSyncStartTimes(prev => {
          const updated = { ...prev };
          importIds.forEach(id => { delete updated[id]; });
          return updated;
        });
      }, 2000);
    }
  };

  // Fetch images from Keepa for items missing images
  const handleFetchImages = async (showModal = true) => {
    setFetchingImages(true);
    const startTime = Date.now();
    setImageFetchStartTime(startTime);
    
    if (showModal) {
      setImageFetchProgress({ 
        message: 'Fetching images from Keepa...', 
        inProgress: true,
        elapsed: 0
      });
    }
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
      const finalElapsed = Math.floor((Date.now() - startTime) / 1000);
      
      if (data.success) {
        // Backend returns: { updated, total, noImageAvailable, batches, tokensUsed }
        const resultMessage = `Updated ${data.updated || 0} images (${data.noImageAvailable || 0} had no image available)`;
        setImageFetchProgress({ 
          message: resultMessage, 
          inProgress: false,
          updated: data.updated || 0,
          noImageAvailable: data.noImageAvailable || 0,
          batches: data.batches || 0,
          tokensUsed: data.tokensUsed || 0,
          elapsed: finalElapsed
        });
        // Reload to show updated images
        await loadImports(currentPage);
      } else {
        setImageFetchProgress({ 
          message: data.error || 'Failed to fetch images', 
          inProgress: false, 
          error: true,
          elapsed: finalElapsed
        });
      }
    } catch (err) {
      console.error('Fetch images error:', err);
      const finalElapsed = Math.floor((Date.now() - startTime) / 1000);
      setImageFetchProgress({ 
        message: 'Failed to fetch images from Keepa', 
        inProgress: false, 
        error: true,
        elapsed: finalElapsed
      });
    } finally {
      setFetchingImages(false);
      setImageFetchStartTime(null);
    }
  };

  // Export catalog as CSV (Feature 9)
  const handleExportCSV = async () => {
    setExporting(true);
    try {
      const token = await userAPI.getAuthToken();
      const response = await fetch('/.netlify/functions/catalog-import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          action: 'export'
        })
      });
      
      const data = await response.json();
      
      if (data.success && data.csv) {
        // Create download
        const blob = new Blob([data.csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        const date = new Date().toISOString().split('T')[0];
        link.href = url;
        link.download = `catalog-export-${date}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      } else {
        alert(data.error || 'Failed to export catalog');
      }
    } catch (err) {
      console.error('Export error:', err);
      alert('Failed to export catalog');
    } finally {
      setExporting(false);
    }
  };

  // Create task from correlation (now with marketplace selection)
  const handleCreateTask = async (importItem, correlation, marketplace = 'US') => {
    setActionInProgress({ asin: correlation.asin, action: 'accepting' });
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
          marketplace
        })
      });
      
      const data = await response.json();
      if (data.success) {
        // Mark as accepted
        setCorrelationActions(prev => ({
          ...prev,
          [correlation.asin]: 'accepted'
        }));
        setMarketplaceModal(null);
      } else {
        alert(data.error || 'Failed to create task');
      }
    } catch (err) {
      console.error('Create task error:', err);
      alert('Failed to create task');
    } finally {
      setActionInProgress(null);
    }
  };

  // Fetch correlations for an ASIN when expanding row
  const fetchCorrelations = async (asin) => {
    // Check cache first
    if (correlationsCache[asin]) {
      return correlationsCache[asin];
    }
    
    // Mark as loading
    setLoadingCorrelations(prev => new Set(prev).add(asin));
    
    try {
      const token = await userAPI.getAuthToken();
      const response = await fetch(
        `/.netlify/functions/catalog-import?action=get_correlations&asin=${encodeURIComponent(asin)}`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      
      const data = await response.json();
      
      if (data.success && data.correlations) {
        // Cache the results
        setCorrelationsCache(prev => ({
          ...prev,
          [asin]: data.correlations
        }));
        return data.correlations;
      } else {
        console.error('Failed to fetch correlations:', data.error);
        return [];
      }
    } catch (err) {
      console.error('Fetch correlations error:', err);
      return [];
    } finally {
      setLoadingCorrelations(prev => {
        const next = new Set(prev);
        next.delete(asin);
        return next;
      });
    }
  };

  // Supported marketplaces for task creation (US, CA, UK, DE only)
  const SUPPORTED_MARKETPLACES = ['US', 'CA', 'UK', 'DE'];

  // Accept correlation - automatically create tasks for supported marketplaces
  const handleAcceptCorrelation = async (importItem, correlation) => {
    setActionInProgress({ asin: correlation.asin, action: 'accepting' });
    
    try {
      // Get available marketplaces from correlation data, intersect with supported
      const availableMarketplaces = correlation.marketplaces || ['US'];
      const marketplacesToCreate = SUPPORTED_MARKETPLACES.filter(mp => 
        availableMarketplaces.includes(mp)
      );
      
      // Create task for each supported marketplace
      const token = await userAPI.getAuthToken();
      let successCount = 0;
      
      for (const marketplace of marketplacesToCreate) {
        try {
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
              marketplace
            })
          });
          
          const data = await response.json();
          if (data.success) {
            successCount++;
          }
        } catch (err) {
          console.error(`Failed to create task for ${marketplace}:`, err);
        }
      }
      
      if (successCount > 0) {
        // Mark as accepted
        setCorrelationActions(prev => ({
          ...prev,
          [correlation.asin]: 'accepted'
        }));
      } else {
        alert('Failed to create tasks');
      }
    } catch (err) {
      console.error('Accept correlation error:', err);
      alert('Failed to create tasks');
    } finally {
      setActionInProgress(null);
    }
  };

  // Decline a correlation
  const handleDeclineCorrelation = async (importItem, correlation) => {
    setActionInProgress({ asin: correlation.asin, action: 'declining' });
    try {
      const token = await userAPI.getAuthToken();
      const response = await fetch('/.netlify/functions/catalog-import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          action: 'decline_correlation',
          source_asin: importItem.asin,
          target_asin: correlation.asin
        })
      });
      
      const data = await response.json();
      if (data.success) {
        // Mark as declined
        setCorrelationActions(prev => ({
          ...prev,
          [correlation.asin]: 'declined'
        }));
      } else {
        // Still mark as declined locally even if backend fails
        setCorrelationActions(prev => ({
          ...prev,
          [correlation.asin]: 'declined'
        }));
      }
    } catch (err) {
      console.error('Decline correlation error:', err);
      // Still hide it locally
      setCorrelationActions(prev => ({
        ...prev,
        [correlation.asin]: 'declined'
      }));
    } finally {
      setActionInProgress(null);
    }
  };

  // Marketplace flag component
  const MarketplaceFlags = ({ marketplaces }) => {
    const flags = {
      US: { emoji: '🇺🇸', label: 'United States' },
      UK: { emoji: '🇬🇧', label: 'United Kingdom' },
      DE: { emoji: '🇩🇪', label: 'Germany' },
      FR: { emoji: '🇫🇷', label: 'France' },
      IT: { emoji: '🇮🇹', label: 'Italy' },
      ES: { emoji: '🇪🇸', label: 'Spain' },
      CA: { emoji: '🇨🇦', label: 'Canada' },
      JP: { emoji: '🇯🇵', label: 'Japan' }
    };
    
    if (!marketplaces || marketplaces.length === 0) {
      return null;
    }
    
    return (
      <div className="flex items-center gap-0.5">
        {marketplaces.map(mp => {
          const flag = flags[mp] || { emoji: '🌐', label: mp };
          return (
            <span key={mp} title={flag.label} className="text-sm">
              {flag.emoji}
            </span>
          );
        })}
      </div>
    );
  };

  // Toggle row expansion (fetches correlations on expand)
  const toggleExpanded = (id, asin) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
        // Fetch correlations when expanding
        if (asin && !correlationsCache[asin] && !loadingCorrelations.has(asin)) {
          fetchCorrelations(asin);
        }
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

  // Handle sync selected items with batch progress
  const handleSyncSelected = async () => {
    if (selectedIds.size === 0) return;
    
    const idsToSync = Array.from(selectedIds);
    const total = idsToSync.length;
    
    // If just one item, use simple sync
    if (total === 1) {
      await handleSync(idsToSync);
      return;
    }
    
    // Reset cancel flag
    batchSyncCancelledRef.current = false;
    
    // Initialize batch progress
    setBatchSyncProgress({
      current: 0,
      total,
      currentAsin: null,
      startTime: Date.now(),
      elapsed: 0,
      cancelled: false
    });
    
    try {
      const token = await userAPI.getAuthToken();
      
      // Process items one by one for detailed progress
      for (let i = 0; i < idsToSync.length; i++) {
        if (batchSyncCancelledRef.current) {
          setBatchSyncProgress(prev => prev ? { ...prev, cancelled: true } : null);
          break;
        }
        
        const id = idsToSync[i];
        const item = imports.find(imp => imp.id === id);
        
        setBatchSyncProgress(prev => prev ? {
          ...prev,
          current: i + 1,
          currentAsin: item?.asin || 'Unknown',
          elapsed: Math.floor((Date.now() - prev.startTime) / 1000)
        } : null);
        
        try {
          const response = await fetch('/.netlify/functions/catalog-import', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
              action: 'sync',
              ids: [id]
            })
          });
          
          const data = await response.json();
          if (data.success) {
            // Sync started - status will update when complete
          }
        } catch (err) {
          console.error(`Sync error for item ${id}:`, err);
        }
      }
      
      // Clear selection
      setSelectedIds(new Set());
      
    } catch (err) {
      console.error('Batch sync error:', err);
    } finally {
      // Keep progress visible for a moment before closing
      setTimeout(() => {
        setBatchSyncProgress(null);
      }, 2000);
    }
  };

  // Handle sync ALL imported items
  const handleSyncAll = async () => {
    // Count items that would be synced
    const importedCount = imports.filter(i => i.status === 'imported').length;
    
    // If we only have current page data, use totalCount for better estimate
    const estimatedTotal = totalCount > importedCount ? totalCount : importedCount;
    
    if (estimatedTotal === 0) {
      alert('No imported items to sync.');
      return;
    }
    
    const confirmed = confirm(`Sync all ${estimatedTotal} imported items?\n\nThis will find correlations for all items.`);
    if (!confirmed) return;
    
    setSyncingAll(true);
    
    // Reset cancel flag
    batchSyncCancelledRef.current = false;
    
    // Show batch progress for sync all
    setBatchSyncProgress({
      current: 0,
      total: estimatedTotal,
      currentAsin: 'Queuing all items...',
      startTime: Date.now(),
      elapsed: 0,
      cancelled: false,
      isSyncAll: true
    });
    
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
      const finalElapsed = Math.floor((Date.now() - batchSyncProgress?.startTime) / 1000);
      
      if (data.success) {
        setBatchSyncProgress(prev => prev ? {
          ...prev,
          current: data.queued || estimatedTotal,
          currentAsin: 'Complete!',
          elapsed: finalElapsed,
          complete: true
        } : null);
        // Reload to show updated statuses
        await loadImports(currentPage);
      } else {
        setBatchSyncProgress(prev => prev ? {
          ...prev,
          error: data.error || 'Failed to queue items for sync',
          elapsed: finalElapsed
        } : null);
      }
    } catch (err) {
      console.error('Sync all error:', err);
      setBatchSyncProgress(prev => prev ? {
        ...prev,
        error: 'Failed to sync all items'
      } : null);
    } finally {
      setSyncingAll(false);
      // Keep progress visible for a moment before closing
      setTimeout(() => {
        setBatchSyncProgress(null);
      }, 3000);
    }
  };

  // Process queue elapsed time state
  const [processQueueStartTime, setProcessQueueStartTime] = useState(null);
  const [processQueueElapsed, setProcessQueueElapsed] = useState(0);
  
  // Update process queue elapsed time
  useEffect(() => {
    if (!processQueueStartTime) return;
    
    const interval = setInterval(() => {
      setProcessQueueElapsed(Math.floor((Date.now() - processQueueStartTime) / 1000));
    }, 1000);
    
    return () => clearInterval(interval);
  }, [processQueueStartTime]);
  
  // Handle process queue - processes pending items
  const handleProcessQueue = async () => {
    setProcessingQueue(true);
    setProcessQueueStartTime(Date.now());
    setProcessQueueElapsed(0);
    
    try {
      const token = await userAPI.getAuthToken();
      const response = await fetch('/.netlify/functions/catalog-import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          action: 'process_pending',
          limit: 5 // Process 5 at a time
        })
      });
      
      const data = await response.json();
      if (data.success) {
        alert(`✅ ${data.message}`);
        // Reload to show updated statuses
        await loadImports(currentPage);
      } else {
        alert(data.error || 'Failed to process queue');
      }
    } catch (err) {
      console.error('Process queue error:', err);
      alert('Failed to process queue');
    } finally {
      setProcessingQueue(false);
      setProcessQueueStartTime(null);
      setProcessQueueElapsed(0);
    }
  };

  // Filter imports (search is now server-side, only filter by status client-side)
  const filteredImports = imports.filter(item => {
    // Filter by status (imported or processed)
    if (item.status !== statusFilter) return false;
    return true;
  });

  // Calculate syncable items for UI (must come after filteredImports)
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

  // Status counts for filter badges (simplified to 2 states)
  const statusCounts = {
    imported: imports.filter(i => i.status === 'imported').length,
    processed: imports.filter(i => i.status === 'processed').length
  };

  // Render status badge
  const StatusBadge = ({ status }) => {
    const config = STATUS_CONFIG[status] || STATUS_CONFIG.imported;
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
            <FolderInput className="w-7 h-7 text-accent" />
            Catalog Import
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
                  setDuplicateCheck(null);
                  setMergeMode('skip');
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
                  
                  {/* Feature 10: Re-import Merge UI */}
                  {duplicateCheck && duplicateCheck.existingCount > 0 && (
                    <div className="mb-4 p-3 bg-warning/10 border border-warning/30 rounded-lg">
                      <p className="text-sm text-theme-primary mb-2 font-medium">
                        📋 {duplicateCheck.newCount} new ASINs, {duplicateCheck.existingCount} already exist
                      </p>
                      <div className="space-y-2">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name="mergeMode"
                            value="skip"
                            checked={mergeMode === 'skip'}
                            onChange={() => setMergeMode('skip')}
                            className="w-4 h-4 text-accent focus:ring-accent"
                          />
                          <span className="text-sm text-theme-secondary">Skip existing (import only new)</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name="mergeMode"
                            value="merge"
                            checked={mergeMode === 'merge'}
                            onChange={() => setMergeMode('merge')}
                            className="w-4 h-4 text-accent focus:ring-accent"
                          />
                          <span className="text-sm text-theme-secondary">Update existing (merge data)</span>
                        </label>
                      </div>
                    </div>
                  )}
                  
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
                  
                  {/* Feature 8: Auto-fetch Images Checkbox */}
                  <div className="mb-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={autoFetchImages}
                        onChange={(e) => setAutoFetchImages(e.target.checked)}
                        className="w-4 h-4 text-orange-500 focus:ring-orange-500 rounded"
                      />
                      <span className="text-sm text-theme-secondary">Fetch images from Keepa after import</span>
                    </label>
                  </div>
                  
                  {/* Import Button */}
                  <button
                    onClick={async () => {
                      await handleImport();
                      if (!parseError) {
                        setShowUploadModal(false);
                      }
                    }}
                    disabled={importing || fetchingImages}
                    className="w-full py-3 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
                  >
                    {importing ? (
                      <>
                        <Loader className="w-4 h-4 animate-spin" />
                        Importing...
                      </>
                    ) : fetchingImages ? (
                      <>
                        <Loader className="w-4 h-4 animate-spin" />
                        Fetching images...
                      </>
                    ) : (
                      <>
                        <Plus className="w-4 h-4" />
                        Import {parsedData.validAsins.length} ASINs
                        {autoFetchImages && ' + Fetch Images'}
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

      {/* Marketplace Selection Modal */}
      {marketplaceModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-theme-surface rounded-xl shadow-2xl max-w-md w-full">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-theme">
              <h2 className="text-lg font-semibold text-theme-primary flex items-center gap-2">
                🌍 Select Marketplace
              </h2>
              <button
                onClick={() => setMarketplaceModal(null)}
                className="p-1 rounded-lg text-theme-tertiary hover:text-theme-primary hover:bg-theme-hover transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            {/* Modal Body */}
            <div className="p-4">
              <p className="text-sm text-theme-secondary mb-4">
                Select the marketplace to create a task for:
              </p>
              
              {/* Product Info */}
              <div className="flex items-center gap-3 p-3 bg-theme-primary rounded-lg mb-4">
                {marketplaceModal.correlation.image_url ? (
                  <img 
                    src={marketplaceModal.correlation.image_url}
                    alt=""
                    className="w-12 h-12 object-contain bg-white rounded"
                  />
                ) : (
                  <div className="w-12 h-12 bg-theme-surface rounded flex items-center justify-center">
                    <Package className="w-6 h-6 text-theme-tertiary" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-theme-primary truncate">
                    {marketplaceModal.correlation.correlated_title || marketplaceModal.correlation.title || 'Unknown'}
                  </p>
                  <p className="text-xs font-mono text-accent">{marketplaceModal.correlation.asin}</p>
                </div>
              </div>
              
              {/* Marketplace Options */}
              <div className="grid grid-cols-2 gap-2">
                {(() => {
                  // Only show supported marketplaces (US, CA, UK, DE)
                  const allMarketplaces = [
                    { code: 'US', emoji: '🇺🇸', label: 'United States' },
                    { code: 'CA', emoji: '🇨🇦', label: 'Canada' },
                    { code: 'UK', emoji: '🇬🇧', label: 'United Kingdom' },
                    { code: 'DE', emoji: '🇩🇪', label: 'Germany' }
                  ];
                  
                  const available = marketplaceModal.correlation.marketplaces || ['US'];
                  
                  return allMarketplaces.map(mp => {
                    const isAvailable = available.includes(mp.code);
                    return (
                      <button
                        key={mp.code}
                        onClick={() => handleCreateTask(
                          marketplaceModal.importItem, 
                          marketplaceModal.correlation, 
                          mp.code
                        )}
                        disabled={!isAvailable || actionInProgress}
                        className={`p-3 rounded-lg border transition-all flex items-center gap-2 ${
                          isAvailable
                            ? 'border-theme hover:border-accent hover:bg-accent/5 cursor-pointer'
                            : 'border-theme/50 bg-theme-primary/50 opacity-50 cursor-not-allowed'
                        }`}
                      >
                        <span className="text-xl">{mp.emoji}</span>
                        <div className="text-left">
                          <p className="text-sm font-medium text-theme-primary">{mp.code}</p>
                          <p className="text-xs text-theme-secondary">{mp.label}</p>
                        </div>
                        {actionInProgress && actionInProgress.asin === marketplaceModal.correlation.asin && (
                          <Loader className="w-4 h-4 animate-spin ml-auto text-accent" />
                        )}
                      </button>
                    );
                  });
                })()}
              </div>
              
              <p className="text-xs text-theme-tertiary mt-3 text-center">
                Only available marketplaces are clickable
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Image Fetch Progress Modal (Feature 3) */}
      {imageFetchProgress && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-theme-surface rounded-xl shadow-2xl max-w-md w-full">
            <div className="p-6 text-center">
              {imageFetchProgress.inProgress ? (
                <>
                  <Loader className="w-12 h-12 animate-spin mx-auto mb-4 text-orange-500" />
                  <h3 className="text-lg font-semibold text-theme-primary mb-2">Fetching Images</h3>
                  <p className="text-theme-secondary">{imageFetchProgress.message}</p>
                  {imageFetchProgress.elapsed > 0 && (
                    <p className="text-sm text-theme-tertiary mt-2">
                      Elapsed: {imageFetchProgress.elapsed}s
                    </p>
                  )}
                </>
              ) : (
                <>
                  {imageFetchProgress.error ? (
                    <AlertCircle className="w-12 h-12 mx-auto mb-4 text-error" />
                  ) : (
                    <CheckCircle className="w-12 h-12 mx-auto mb-4 text-success" />
                  )}
                  <h3 className="text-lg font-semibold text-theme-primary mb-2">
                    {imageFetchProgress.error ? 'Fetch Failed' : 'Fetch Complete'}
                  </h3>
                  <p className="text-theme-secondary mb-4">{imageFetchProgress.message}</p>
                  {!imageFetchProgress.error && imageFetchProgress.batches > 0 && (
                    <div className="text-sm text-theme-tertiary">
                      Processed in {imageFetchProgress.batches} batch{imageFetchProgress.batches !== 1 ? 'es' : ''} • {imageFetchProgress.tokensUsed} Keepa tokens used
                      {imageFetchProgress.elapsed > 0 && ` • ${imageFetchProgress.elapsed}s`}
                    </div>
                  )}
                  <button
                    onClick={() => setImageFetchProgress(null)}
                    className="mt-4 px-6 py-2 bg-accent hover:bg-accent-hover text-white font-medium rounded-lg transition-colors"
                  >
                    Close
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Batch Sync Progress Modal */}
      {batchSyncProgress && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-theme-surface rounded-xl shadow-2xl max-w-md w-full">
            <div className="p-6">
              {/* Header */}
              <div className="text-center mb-4">
                {batchSyncProgress.complete ? (
                  <CheckCircle className="w-12 h-12 mx-auto mb-3 text-success" />
                ) : batchSyncProgress.error ? (
                  <AlertCircle className="w-12 h-12 mx-auto mb-3 text-error" />
                ) : batchSyncProgress.cancelled ? (
                  <AlertCircle className="w-12 h-12 mx-auto mb-3 text-warning" />
                ) : (
                  <Loader className="w-12 h-12 animate-spin mx-auto mb-3 text-orange-500" />
                )}
                <h3 className="text-lg font-semibold text-theme-primary">
                  {batchSyncProgress.complete ? 'Sync Complete!' : 
                   batchSyncProgress.error ? 'Sync Failed' :
                   batchSyncProgress.cancelled ? 'Sync Cancelled' :
                   batchSyncProgress.isSyncAll ? 'Syncing All Items' : 'Syncing Selected Items'}
                </h3>
              </div>
              
              {/* Progress bar */}
              {!batchSyncProgress.error && (
                <div className="mb-4">
                  <div className="flex justify-between text-sm text-theme-secondary mb-1">
                    <span>Progress</span>
                    <span>{batchSyncProgress.current} of {batchSyncProgress.total}</span>
                  </div>
                  <div className="w-full bg-theme-primary rounded-full h-3 overflow-hidden">
                    <div 
                      className={`h-full rounded-full transition-all duration-300 ${
                        batchSyncProgress.complete ? 'bg-success' :
                        batchSyncProgress.cancelled ? 'bg-warning' : 'bg-orange-500'
                      }`}
                      style={{ width: `${Math.round((batchSyncProgress.current / batchSyncProgress.total) * 100)}%` }}
                    />
                  </div>
                </div>
              )}
              
              {/* Current item info */}
              {batchSyncProgress.currentAsin && !batchSyncProgress.error && (
                <div className="mb-4 p-3 bg-theme-primary rounded-lg">
                  <p className="text-sm text-theme-secondary">
                    {batchSyncProgress.complete ? 'Completed:' : 'Currently processing:'}
                  </p>
                  <p className="font-mono text-accent text-sm">{batchSyncProgress.currentAsin}</p>
                </div>
              )}
              
              {/* Error message */}
              {batchSyncProgress.error && (
                <div className="mb-4 p-3 bg-error/10 border border-error/30 rounded-lg">
                  <p className="text-sm text-error">{batchSyncProgress.error}</p>
                </div>
              )}
              
              {/* Elapsed time */}
              <div className="text-center text-sm text-theme-tertiary mb-4">
                {batchSyncProgress.elapsed > 0 && (
                  <span>Elapsed: {batchSyncProgress.elapsed}s</span>
                )}
              </div>
              
              {/* Action buttons */}
              <div className="flex gap-3 justify-center">
                {!batchSyncProgress.complete && !batchSyncProgress.error && !batchSyncProgress.cancelled && !batchSyncProgress.isSyncAll && (
                  <button
                    onClick={() => { batchSyncCancelledRef.current = true; }}
                    className="px-4 py-2 bg-theme-primary border border-theme hover:bg-error/10 hover:border-error/30 hover:text-error text-theme-secondary font-medium rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                )}
                {(batchSyncProgress.complete || batchSyncProgress.error || batchSyncProgress.cancelled) && (
                  <button
                    onClick={() => setBatchSyncProgress(null)}
                    className="px-6 py-2 bg-accent hover:bg-accent-hover text-white font-medium rounded-lg transition-colors"
                  >
                    Close
                  </button>
                )}
              </div>
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
          onClick={() => handleFetchImages(true)}
          disabled={fetchingImages}
          className="px-4 py-2.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-medium rounded-lg transition-colors flex items-center gap-2"
        >
          {fetchingImages ? (
            <Loader className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
          {fetchingImages ? `Fetching... ${imageFetchProgress?.elapsed || 0}s` : 'Fetch Images from Keepa'}
        </button>
        
        {/* Export CSV button (Feature 9) */}
        <button
          onClick={handleExportCSV}
          disabled={exporting || totalCount === 0}
          className="px-4 py-2.5 bg-theme-surface border border-theme hover:bg-theme-hover disabled:opacity-50 text-theme-primary font-medium rounded-lg transition-colors flex items-center gap-2"
        >
          {exporting ? (
            <Loader className="w-4 h-4 animate-spin" />
          ) : (
            <Download className="w-4 h-4" />
          )}
          {exporting ? 'Exporting...' : 'Export CSV'}
        </button>
        
        {/* Individual sync via per-row button only */}
        
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
            {['imported', 'processed'].map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
                  statusFilter === status
                    ? 'bg-accent text-white'
                    : 'bg-theme-surface border border-theme text-theme-secondary hover:text-theme-primary'
                }`}
              >
                {(() => {
                  const Icon = STATUS_CONFIG[status]?.icon;
                  return Icon ? <Icon className="w-4 h-4" /> : null;
                })()}
                <span className="capitalize">{status}</span>
                <span className="text-xs opacity-70">({statusCounts[status] || 0})</span>
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
            {searchQuery ? (
              <Search className="w-8 h-8 text-theme-tertiary" />
            ) : statusFilter === 'imported' ? (
              <FileSpreadsheet className="w-8 h-8 text-theme-tertiary" />
            ) : (
              <CheckCircle className="w-8 h-8 text-theme-tertiary" />
            )}
          </div>
          <h3 className="text-lg font-medium text-theme-primary mb-1">
            {searchQuery 
              ? 'No matches found' 
              : statusFilter === 'imported' 
                ? 'No imports awaiting sync' 
                : 'No processed items yet'}
          </h3>
          <p className="text-theme-secondary">
            {searchQuery 
              ? 'Try adjusting your search'
              : statusFilter === 'imported'
                ? 'Upload an Excel file with your ASINs to get started'
                : 'Sync imported items to find correlations'}
          </p>
        </div>
      ) : (
        <div className="bg-theme-surface rounded-lg border border-theme overflow-hidden">
          {/* Header Row */}
          <div className="hidden sm:grid sm:grid-cols-12 gap-4 px-4 py-3 bg-theme-primary border-b border-theme text-sm font-medium text-theme-secondary">
            <div className="col-span-1"></div>
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
              const statusConfig = STATUS_CONFIG[item.status] || STATUS_CONFIG.imported;
              
              return (
                <div key={item.id}>
                  {/* Main Row */}
                  <div 
                    className={`grid grid-cols-1 sm:grid-cols-12 gap-4 px-4 py-3 items-center hover:bg-theme-hover transition-colors ${
                      isExpanded ? 'bg-theme-hover' : ''
                    }`}
                  >
                    {/* Expand Toggle */}
                    <div className="col-span-1 hidden sm:flex items-center justify-center">
                      {correlationCount > 0 && (
                        <button
                          onClick={() => toggleExpanded(item.id, item.asin)}
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
                          <Package className="w-6 h-6 text-theme-tertiary" />
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

                    {/* Correlations Count Badge (Feature 7) */}
                    <div className="col-span-2">
                      {/* Use correlation_count from backend if available, else count array */}
                      {(() => {
                        const count = item.correlation_count ?? correlationCount;
                        if (item.status === 'processed' || count > 0) {
                          return (
                            <button
                              onClick={() => toggleExpanded(item.id, item.asin)}
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                                count > 0 
                                  ? 'bg-accent/10 text-accent hover:bg-accent/20 cursor-pointer' 
                                  : 'bg-theme-primary text-theme-tertiary'
                              }`}
                            >
                              {count > 0 ? (
                                <>
                                  <span className="font-bold">{count}</span>
                                  <span>correlation{count !== 1 ? 's' : ''}</span>
                                  {!isExpanded && <ChevronRight className="w-3 h-3" />}
                                  {isExpanded && <ChevronDown className="w-3 h-3" />}
                                </>
                              ) : (
                                <span>—</span>
                              )}
                            </button>
                          );
                        }
                        return <span className="text-sm text-theme-tertiary">—</span>;
                      })()}
                    </div>

                    {/* Actions */}
                    <div className="col-span-1 flex justify-end gap-2">
                      {/* Sync button - only for imported/error status */}
                      {item.status === 'imported' && (
                        <button
                          onClick={() => handleSync([item.id])}
                          disabled={syncingItems.has(item.id)}
                          className="px-3 py-1.5 bg-orange-500 hover:bg-orange-600 disabled:bg-orange-400 text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-1 min-w-[80px] justify-center"
                          title="Find Correlations"
                        >
                          {syncingItems.has(item.id) ? (
                            <>
                              <Loader className="w-3 h-3 animate-spin" />
                              <span>{syncElapsedTimes[item.id] || 0}s</span>
                            </>
                          ) : (
                            <>
                              <RefreshCw className="w-3 h-3" />
                              <span>Sync</span>
                            </>
                          )}
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(item.id)}
                        disabled={syncingItems.has(item.id)}
                        className="p-2 text-theme-tertiary hover:text-error hover:bg-error/10 disabled:opacity-50 rounded-lg transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Expanded Correlations */}
                  {isExpanded && (
                    <div className="px-4 pb-4 bg-theme-primary">
                      <div className="ml-6 sm:ml-12 border-l-2 border-accent/30 pl-4 space-y-3">
                        <div className="text-xs font-medium text-theme-secondary py-2 flex items-center gap-2">
                          Related Products
                          {loadingCorrelations.has(item.asin) && (
                            <Loader className="w-3 h-3 animate-spin text-accent" />
                          )}
                        </div>
                        
                        {/* Loading state */}
                        {loadingCorrelations.has(item.asin) && !correlationsCache[item.asin] && (
                          <div className="flex items-center gap-3 p-4 bg-theme-surface rounded-lg border border-theme">
                            <Loader className="w-5 h-5 animate-spin text-accent" />
                            <span className="text-sm text-theme-secondary">Loading correlations...</span>
                          </div>
                        )}
                        
                        {/* Correlations list - use cache if available, fallback to embedded */}
                        {(() => {
                          const correlations = correlationsCache[item.asin] || item.correlations || [];
                          const visibleCorrelations = correlations.filter(
                            corr => correlationActions[corr.asin] !== 'declined'
                          );
                          
                          if (visibleCorrelations.length === 0 && !loadingCorrelations.has(item.asin)) {
                            return (
                              <div className="p-4 bg-theme-surface rounded-lg border border-theme text-center">
                                <span className="text-sm text-theme-tertiary">No correlations found</span>
                              </div>
                            );
                          }
                          
                          return visibleCorrelations.map((corr, idx) => {
                            const actionStatus = correlationActions[corr.asin];
                            const isProcessing = actionInProgress?.asin === corr.asin;
                            
                            return (
                              <div 
                                key={corr.asin || idx}
                                className={`p-4 bg-theme-surface rounded-lg border transition-all ${
                                  actionStatus === 'accepted' 
                                    ? 'border-green-500/50 bg-green-50/5' 
                                    : 'border-theme hover:border-accent/30'
                                }`}
                              >
                                <div className="flex items-start gap-4">
                                  {/* Correlation Image */}
                                  {corr.image_url ? (
                                    <img 
                                      src={corr.image_url}
                                      alt={corr.correlated_title || corr.title || corr.asin}
                                      className="w-16 h-16 object-contain bg-white rounded-lg flex-shrink-0 border border-theme"
                                    />
                                  ) : (
                                    <div className="w-16 h-16 bg-theme-primary rounded-lg flex items-center justify-center flex-shrink-0 border border-theme">
                                      <Package className="w-8 h-8 text-theme-tertiary" />
                                    </div>
                                  )}
                                  
                                  {/* Correlation Info */}
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm text-theme-primary font-medium line-clamp-2 mb-2">
                                      {corr.correlated_title || corr.title || 'Unknown Title'}
                                    </p>
                                    <div className="flex flex-wrap items-center gap-2">
                                      {/* ASIN with link */}
                                      <a
                                        href={`https://www.amazon.com/dp/${corr.asin}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="font-mono text-xs text-accent hover:underline flex items-center gap-1"
                                      >
                                        {corr.asin}
                                        <ExternalLink className="w-3 h-3" />
                                      </a>
                                      
                                      {/* Type badge */}
                                      {corr.type && (
                                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                          corr.type === 'variation'
                                            ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400'
                                            : 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                                        }`}>
                                          {corr.type}
                                        </span>
                                      )}
                                      
                                      {/* Marketplace flags */}
                                      {corr.marketplaces && corr.marketplaces.length > 0 && (
                                        <MarketplaceFlags marketplaces={corr.marketplaces} />
                                      )}
                                    </div>
                                  </div>
                                  
                                  {/* Actions */}
                                  <div className="flex items-center gap-2 flex-shrink-0">
                                    {actionStatus === 'accepted' ? (
                                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                                        <CheckCircle className="w-3.5 h-3.5" />
                                        Accepted
                                      </span>
                                    ) : (
                                      <>
                                        <button
                                          onClick={() => handleAcceptCorrelation(item, corr)}
                                          disabled={isProcessing}
                                          className="px-3 py-1.5 text-xs bg-green-500 hover:bg-green-600 disabled:bg-green-300 text-white rounded-lg transition-colors flex items-center gap-1.5 font-medium"
                                        >
                                          {isProcessing && actionInProgress?.action === 'accepting' ? (
                                            <Loader className="w-3 h-3 animate-spin" />
                                          ) : (
                                            <CheckCircle className="w-3.5 h-3.5" />
                                          )}
                                          Accept
                                        </button>
                                        <button
                                          onClick={() => handleDeclineCorrelation(item, corr)}
                                          disabled={isProcessing}
                                          className="px-3 py-1.5 text-xs bg-theme-primary hover:bg-red-100 dark:hover:bg-red-900/20 text-theme-secondary hover:text-red-600 dark:hover:text-red-400 rounded-lg transition-colors flex items-center gap-1.5 border border-theme"
                                        >
                                          {isProcessing && actionInProgress?.action === 'declining' ? (
                                            <Loader className="w-3 h-3 animate-spin" />
                                          ) : (
                                            <X className="w-3.5 h-3.5" />
                                          )}
                                          Decline
                                        </button>
                                      </>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          });
                        })()}
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

      {/* Auto-refresh indicator removed - simplified status workflow */}
    </div>
  );
}

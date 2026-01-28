/**
 * CatalogImport Component
 * 
 * Allows users to import their Amazon Influencer ASINs via Excel/CSV upload.
 * Shows import status.
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
  AlertCircle,
  X,
  Trash2,
  Search,
  Plus,
  Download,
  FolderInput,
  Package,
  ClipboardList
} from 'lucide-react';

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
  
  // Image fetch elapsed time
  const [imageFetchStartTime, setImageFetchStartTime] = useState(null);
  
  // File upload state
  const [parsedData, setParsedData] = useState(null);
  const [parseError, setParseError] = useState(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  
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

  // Load imported ASINs on mount
  useEffect(() => {
    loadImports();
    return () => {
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

  // Update elapsed times for image fetch
  useEffect(() => {
    if (!imageFetchStartTime) return;
    
    const interval = setInterval(() => {
      const now = Date.now();
      
      // Update image fetch elapsed time
      if (imageFetchStartTime && imageFetchProgress?.inProgress) {
        setImageFetchProgress(prev => prev ? {
          ...prev,
          elapsed: Math.floor((now - imageFetchStartTime) / 1000)
        } : null);
      }
    }, 1000);
    
    return () => clearInterval(interval);
  }, [imageFetchStartTime, imageFetchProgress?.inProgress]);

  // Check for duplicate ASINs in existing catalog
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
        
        // Check for existing ASINs (Re-import merge)
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
          mode: mergeMode, // pass merge mode ('skip' or 'merge')
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
        setParsedData(null);
        setDuplicateCheck(null);
        await loadImports();
        
        // Auto-fetch images after import
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

  // Export catalog as CSV
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
    { value: 'title:asc', label: 'Title (A-Z)' },
    { value: 'asin:asc', label: 'ASIN' }
  ];

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
            Import your Amazon Influencer ASINs via Excel or CSV
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
                  
                  {/* Re-import Merge UI */}
                  {duplicateCheck && duplicateCheck.existingCount > 0 && (
                    <div className="mb-4 p-3 bg-warning/10 border border-warning/30 rounded-lg">
                      <p className="text-sm text-theme-primary mb-2 font-medium flex items-center gap-2">
                        <ClipboardList className="w-4 h-4 text-theme-secondary" />
                        {duplicateCheck.newCount} new ASINs, {duplicateCheck.existingCount} already exist
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
                  
                  {/* Auto-fetch Images Checkbox */}
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

      {/* Image Fetch Progress Modal */}
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
                    <Download className="w-12 h-12 mx-auto mb-4 text-success" />
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
        
        {/* Export CSV button */}
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
        
        {parseError && !showUploadModal && (
          <div className="w-full mt-3 p-3 bg-error/10 border border-error/30 rounded-lg flex items-center gap-2 text-error text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {parseError}
          </div>
        )}
      </div>

      {/* Search and Sort Bar */}
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
        </div>
      )}

      {/* Import List */}
      {loading && imports.length === 0 ? (
        <div className="text-center py-12">
          <Loader className="w-8 h-8 animate-spin mx-auto mb-3 text-accent" />
          <p className="text-theme-secondary">Loading imports...</p>
        </div>
      ) : imports.length === 0 ? (
        <div className="text-center py-12 bg-theme-surface rounded-lg border border-theme">
          <div className="w-16 h-16 bg-theme-primary rounded-full flex items-center justify-center mx-auto mb-4">
            {searchQuery ? (
              <Search className="w-8 h-8 text-theme-tertiary" />
            ) : (
              <FileSpreadsheet className="w-8 h-8 text-theme-tertiary" />
            )}
          </div>
          <h3 className="text-lg font-medium text-theme-primary mb-1">
            {searchQuery ? 'No matches found' : 'No imports yet'}
          </h3>
          <p className="text-theme-secondary">
            {searchQuery 
              ? 'Try adjusting your search'
              : 'Upload an Excel file with your ASINs to get started'}
          </p>
        </div>
      ) : (
        <div className="bg-theme-surface rounded-lg border border-theme overflow-hidden">
          {/* Header Row */}
          <div className="hidden sm:grid sm:grid-cols-12 gap-4 px-4 py-3 bg-theme-primary border-b border-theme text-sm font-medium text-theme-secondary">
            <div className="col-span-1">Image</div>
            <div className="col-span-4">Title</div>
            <div className="col-span-2">ASIN</div>
            <div className="col-span-2">Category</div>
            <div className="col-span-2">Imported</div>
            <div className="col-span-1">Actions</div>
          </div>

          {/* List Items */}
          <div className="divide-y divide-theme">
            {imports.map((item) => {
              return (
                <div 
                  key={item.id}
                  className="grid grid-cols-1 sm:grid-cols-12 gap-4 px-4 py-3 items-center hover:bg-theme-hover transition-colors"
                >
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
                  <div className="col-span-4">
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

                  {/* Category */}
                  <div className="col-span-2">
                    <span className="text-sm text-theme-secondary">
                      {item.category || '—'}
                    </span>
                  </div>

                  {/* Import Date */}
                  <div className="col-span-2">
                    <span className="text-xs text-theme-tertiary">
                      {new Date(item.created_at).toLocaleDateString()}
                    </span>
                  </div>

                  {/* Actions */}
                  <div className="col-span-1 flex justify-end gap-2">
                    <button
                      onClick={() => handleDelete(item.id)}
                      className="p-2 text-theme-tertiary hover:text-error hover:bg-error/10 rounded-lg transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
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
    </div>
  );
}

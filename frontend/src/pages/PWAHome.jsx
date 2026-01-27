import { useState, useEffect, useRef } from 'react'
import { Plus, Upload, Search, Check, X, Film, Package, Loader, Users } from 'lucide-react'
import { supabase } from '../lib/supabase'

const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB chunks

// Status IDs that count as "delivered" - need to fetch dynamically
const DELIVERED_STATUS_NAMES = ['delivered', 'ready to list', 'listed'];
const COMPLETED_STATUS_NAMES = ['completed', 'sold', 'archived'];

export default function PWAHome() {
  const [mode, setMode] = useState(null) // 'upload' | 'add' | null
  const [products, setProducts] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [newAsin, setNewAsin] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [message, setMessage] = useState(null)
  const fileInputRef = useRef(null)
  
  // New state for filtered views
  const [viewMode, setViewMode] = useState('delivered') // 'open' | 'delivered'
  const [ownerFilter, setOwnerFilter] = useState('')
  const [availableOwners, setAvailableOwners] = useState([])
  const [statusMap, setStatusMap] = useState({ delivered: [], completed: [] })

  // Fetch statuses and owners on mount
  useEffect(() => {
    const fetchStatusesAndOwners = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Fetch status mappings
      const { data: statuses } = await supabase
        .from('crm_statuses')
        .select('id, name')
        .eq('user_id', user.id)
      
      if (statuses) {
        const deliveredIds = statuses
          .filter(s => DELIVERED_STATUS_NAMES.includes(s.name?.toLowerCase()))
          .map(s => s.id)
        const completedIds = statuses
          .filter(s => COMPLETED_STATUS_NAMES.includes(s.name?.toLowerCase()))
          .map(s => s.id)
        setStatusMap({ delivered: deliveredIds, completed: completedIds })
      }

      // Fetch available owners
      const { data: owners } = await supabase
        .from('crm_owners')
        .select('id, name, email')
        .eq('user_id', user.id)
        .order('name')
      
      if (owners) setAvailableOwners(owners)
    }
    fetchStatusesAndOwners()
  }, [])

  // Fetch products for video upload selection
  useEffect(() => {
    const fetchProducts = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data } = await supabase
        .from('sourced_products')
        .select(`
          id, asin, title, image_url, status,
          owners:product_owners(owner_id)
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(200)
      if (data) setProducts(data)
    }
    fetchProducts()
  }, [])

  // Filter products by view mode, owner, and search
  const filteredProducts = products.filter(p => {
    // Always hide completed products
    if (statusMap.completed.includes(p.status)) return false
    
    // View mode filter
    if (viewMode === 'delivered') {
      if (!statusMap.delivered.includes(p.status)) return false
    } else {
      // Open items = not delivered and not completed
      if (statusMap.delivered.includes(p.status)) return false
    }
    
    // Owner filter
    if (ownerFilter) {
      const hasOwner = p.owners?.some(o => o.owner_id === ownerFilter)
      if (!hasOwner) return false
    }
    
    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      if (!p.asin?.toLowerCase().includes(query) && 
          !p.title?.toLowerCase().includes(query)) {
        return false
      }
    }
    
    return true
  })

  // Chunked upload helper
  const uploadChunked = async (file, uploadUrl, onProgress) => {
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    let finalResponse = null;

    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, file.size);
      const chunk = file.slice(start, end);

      const response = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Range': `bytes ${start}-${end - 1}/${file.size}`,
          'Content-Type': 'application/octet-stream'
        },
        body: chunk
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Upload failed at chunk ${i + 1}/${totalChunks}: ${errorText}`);
      }

      // The final chunk response contains the file metadata
      if (i === totalChunks - 1) {
        finalResponse = await response.json();
      }

      const chunkProgress = ((i + 1) / totalChunks) * 100;
      onProgress(chunkProgress);
    }

    return finalResponse;
  };

  // Handle video upload
  const handleVideoUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file || !selectedProduct) return

    setIsUploading(true)
    setUploadProgress(0)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token

      if (!token) {
        throw new Error('Not authenticated. Please log in again.')
      }

      // Step 1: Create upload session
      const fileExtension = file.name.split('.').pop().toLowerCase();
      const uploadFilename = selectedProduct.asin ? `${selectedProduct.asin}.${fileExtension}` : file.name;
      
      const sessionResponse = await fetch('/.netlify/functions/onedrive-upload-session', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          productId: selectedProduct.id,
          filename: uploadFilename,
          fileSize: file.size
        })
      });

      if (!sessionResponse.ok) {
        const errorData = await sessionResponse.json();
        
        if (errorData.error === 'OneDrive not connected') {
          throw new Error('OneDrive not connected. Please connect in Settings.');
        }
        
        throw new Error(errorData.error || 'Failed to create upload session');
      }

      const sessionData = await sessionResponse.json();

      if (!sessionData.uploadUrl) {
        throw new Error('No upload URL received');
      }

      // Step 2: Upload file in chunks
      const oneDriveFile = await uploadChunked(file, sessionData.uploadUrl, setUploadProgress);

      if (!oneDriveFile || !oneDriveFile.id) {
        throw new Error('Upload completed but no file ID returned');
      }

      // Step 3: Save video metadata
      const metadataResponse = await fetch('/.netlify/functions/videos', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sessionId: sessionData.sessionId,
          productId: selectedProduct.id,
          onedrive_file_id: oneDriveFile.id,
          onedrive_path: oneDriveFile.parentReference?.path 
            ? `${oneDriveFile.parentReference.path}/${oneDriveFile.name}`
            : `/${oneDriveFile.name}`,
          filename: uploadFilename,
          file_size: file.size,
          mime_type: file.type || null
        })
      });

      if (!metadataResponse.ok) {
        const errorText = await metadataResponse.text();
        throw new Error(`Failed to save video metadata: ${errorText}`);
      }
      
      setMessage({ type: 'success', text: `Video uploaded for ${selectedProduct.asin}!` })
      setSelectedProduct(null)
      setMode(null)
    } catch (error) {
      console.error('Upload error:', error)
      setMessage({ type: 'error', text: error.message || 'Upload failed. Try again.' })
    } finally {
      setIsUploading(false)
      setUploadProgress(0)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  // Handle quick add ASIN
  const handleAddAsin = async () => {
    if (!newAsin.trim()) return
    
    setIsLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      
      // Get default status (first one)
      const { data: statuses } = await supabase
        .from('crm_statuses')
        .select('id')
        .order('sort_order')
        .limit(1)
      
      const { data: user } = await supabase.auth.getUser()
      
      // Create product
      const { data, error } = await supabase
        .from('sourced_products')
        .insert({
          asin: newAsin.trim().toUpperCase(),
          status_id: statuses?.[0]?.id,
          user_id: user?.user?.id
        })
        .select()
        .single()

      if (error) throw error

      // Add to local list
      setProducts(prev => [data, ...prev])
      setMessage({ type: 'success', text: `Added ${newAsin.toUpperCase()}` })
      setNewAsin('')
      setMode(null)

      // Fetch product details in background
      fetch(`/.netlify/functions/keepa-lookup?asin=${newAsin}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      }).catch(() => {})

    } catch (error) {
      console.error('Add error:', error)
      setMessage({ type: 'error', text: error.message || 'Failed to add product' })
    } finally {
      setIsLoading(false)
    }
  }

  // Clear message after 3 seconds
  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(null), 3000)
      return () => clearTimeout(timer)
    }
  }, [message])

  return (
    <div className="min-h-full bg-theme-primary p-4 flex flex-col">
      {/* Message Toast */}
      {message && (
        <div className={`fixed top-16 left-4 right-4 p-3 rounded-lg text-white text-center z-50 ${
          message.type === 'success' ? 'bg-green-600' : 'bg-red-600'
        }`}>
          {message.text}
        </div>
      )}

      {/* Main Actions */}
      {!mode && (
        <div className="flex-1 flex flex-col items-center justify-center gap-6">
          <img 
            src="/assets/logos/logo-icon.svg" 
            alt="OpSyncPro" 
            className="h-20 w-auto opacity-50 mb-4"
          />
          
          <button
            onClick={() => setMode('upload')}
            className="w-full max-w-xs p-6 bg-orange-600 text-white rounded-2xl flex flex-col items-center gap-3 hover:bg-orange-700 active:scale-95 transition-all shadow-lg"
          >
            <Film className="w-12 h-12" />
            <span className="text-lg font-semibold">Upload Video</span>
            <span className="text-sm opacity-80">Add video to existing product</span>
          </button>

          <button
            onClick={() => setMode('add')}
            className="w-full max-w-xs p-6 bg-theme-surface border-2 border-theme text-theme-primary rounded-2xl flex flex-col items-center gap-3 hover:bg-theme-hover active:scale-95 transition-all"
          >
            <Plus className="w-12 h-12 text-orange-500" />
            <span className="text-lg font-semibold">Add Product</span>
            <span className="text-sm text-theme-secondary">Quick add by ASIN</span>
          </button>
        </div>
      )}

      {/* Upload Video Mode */}
      {mode === 'upload' && (
        <div className="flex-1 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-theme-primary">Select Product</h2>
            <button onClick={() => { setMode(null); setSelectedProduct(null); setSearchQuery(''); setViewMode('delivered'); setOwnerFilter(''); }}>
              <X className="w-6 h-6 text-theme-secondary" />
            </button>
          </div>

          {/* Owner Filter */}
          <div className="relative mb-3">
            <Users className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <select
              value={ownerFilter}
              onChange={e => setOwnerFilter(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-theme-surface border border-theme rounded-xl text-theme-primary text-sm appearance-none cursor-pointer"
            >
              <option value="">All Owners</option>
              {availableOwners.map(owner => (
                <option key={owner.id} value={owner.id}>{owner.name || owner.email}</option>
              ))}
            </select>
          </div>

          {/* View Mode Toggle */}
          <div className="flex gap-2 mb-3">
            <button
              onClick={() => setViewMode('open')}
              className={`flex-1 py-2.5 px-4 rounded-xl text-sm font-medium transition-all ${
                viewMode === 'open'
                  ? 'bg-orange-600 text-white'
                  : 'bg-theme-surface border border-theme text-theme-secondary hover:bg-theme-hover'
              }`}
            >
              Open Items
            </button>
            <button
              onClick={() => setViewMode('delivered')}
              className={`flex-1 py-2.5 px-4 rounded-xl text-sm font-medium transition-all ${
                viewMode === 'delivered'
                  ? 'bg-orange-600 text-white'
                  : 'bg-theme-surface border border-theme text-theme-secondary hover:bg-theme-hover'
              }`}
            >
              Delivered ✓
            </button>
          </div>

          {/* Search */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search by ASIN or title..."
              className="w-full pl-10 pr-4 py-3 bg-theme-surface border border-theme rounded-xl text-theme-primary"
            />
          </div>

          {/* Product List - extra padding at bottom when button visible */}
          <div className={`flex-1 overflow-y-auto space-y-2 ${selectedProduct ? 'pb-24' : ''}`}>
            {filteredProducts.map(product => (
              <button
                key={product.id}
                onClick={() => setSelectedProduct(product)}
                className={`w-full p-3 rounded-xl flex items-center gap-3 transition-all ${
                  selectedProduct?.id === product.id 
                    ? 'bg-orange-600 text-white' 
                    : 'bg-theme-surface hover:bg-theme-hover'
                }`}
              >
                <div className="w-12 h-12 rounded-lg bg-theme-hover flex items-center justify-center overflow-hidden flex-shrink-0">
                  {product.image_url ? (
                    <img src={product.image_url} alt="" className="w-full h-full object-contain" />
                  ) : (
                    <Package className="w-6 h-6 text-gray-400" />
                  )}
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <div className="font-mono text-sm font-medium">{product.asin}</div>
                  {product.title && (
                    <div className={`text-xs truncate ${selectedProduct?.id === product.id ? 'text-white/80' : 'text-theme-secondary'}`}>
                      {product.title}
                    </div>
                  )}
                </div>
                {selectedProduct?.id === product.id && (
                  <Check className="w-5 h-5 flex-shrink-0" />
                )}
              </button>
            ))}
          </div>

          {/* Hidden file input - no capture to allow library selection */}
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            onChange={handleVideoUpload}
            className="hidden"
          />
          
          {/* Sticky Upload Button at bottom */}
          {selectedProduct && (
            <div className="fixed bottom-0 left-0 right-0 p-4 bg-theme-primary border-t border-theme">
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="w-full p-4 bg-orange-600 text-white rounded-xl flex flex-col items-center justify-center gap-2 font-semibold disabled:opacity-50 shadow-lg relative overflow-hidden"
              >
                {isUploading ? (
                  <>
                    {/* Progress bar background */}
                    <div 
                      className="absolute inset-0 bg-orange-700 transition-all duration-300"
                      style={{ width: `${uploadProgress}%` }}
                    />
                    <div className="relative flex items-center gap-3">
                      <Loader className="w-5 h-5 animate-spin" />
                      <span>Uploading... {Math.round(uploadProgress)}%</span>
                    </div>
                  </>
                ) : (
                  <>
                    <Upload className="w-5 h-5" />
                    Upload Video for {selectedProduct.asin}
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Add Product Mode */}
      {mode === 'add' && (
        <div className="flex-1 flex flex-col">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-theme-primary">Add Product</h2>
            <button onClick={() => { setMode(null); setNewAsin(''); }}>
              <X className="w-6 h-6 text-theme-secondary" />
            </button>
          </div>

          <div className="flex-1 flex flex-col items-center justify-center">
            <div className="w-full max-w-sm">
              <label className="block text-sm font-medium text-theme-secondary mb-2">
                Amazon ASIN
              </label>
              <input
                type="text"
                value={newAsin}
                onChange={e => setNewAsin(e.target.value.toUpperCase())}
                placeholder="B0XXXXXXXXX"
                className="w-full px-4 py-4 text-xl font-mono bg-theme-surface border-2 border-theme rounded-xl text-theme-primary text-center tracking-wider"
                autoFocus
                maxLength={10}
              />
              <p className="text-xs text-theme-tertiary text-center mt-2">
                Enter the 10-character Amazon ASIN
              </p>
            </div>
          </div>

          <button
            onClick={handleAddAsin}
            disabled={!newAsin.trim() || isLoading}
            className="w-full p-4 bg-orange-600 text-white rounded-xl flex items-center justify-center gap-3 font-semibold disabled:opacity-50 mt-4"
          >
            {isLoading ? (
              <>
                <Loader className="w-5 h-5 animate-spin" />
                Adding...
              </>
            ) : (
              <>
                <Plus className="w-5 h-5" />
                Add Product
              </>
            )}
          </button>
        </div>
      )}
    </div>
  )
}

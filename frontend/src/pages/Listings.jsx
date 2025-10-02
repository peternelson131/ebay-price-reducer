import { useState, useMemo, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { listingsAPI, userAPI } from '../lib/supabase'
import { getEbayAuthUrl, getEbayConnectionStatus } from '../services/api'
import { getActiveStrategies, getStrategyById, getStrategyDisplayName } from '../data/strategies'

// Helper functions for localStorage
const getStoredColumnOrder = () => {
  try {
    const stored = localStorage.getItem('listings-column-order')
    if (stored) {
      return JSON.parse(stored)
    }
  } catch (error) {
    console.warn('Failed to load column order from localStorage:', error)
  }
  return [
    'image', 'title', 'quantity', 'currentPrice', 'minimumPrice',
    'priceReductionEnabled', 'strategy', 'viewCount', 'watchCount', 'listingAge', 'actions'
  ]
}

const getStoredVisibleColumns = () => {
  try {
    const stored = localStorage.getItem('listings-visible-columns')
    if (stored) {
      return JSON.parse(stored)
    }
  } catch (error) {
    console.warn('Failed to load visible columns from localStorage:', error)
  }
  return {
    image: true,
    title: true,
    quantity: true,
    currentPrice: true,
    minimumPrice: true,
    priceReductionEnabled: true,
    strategy: true,
    viewCount: true,
    watchCount: true,
    listingAge: true,
    actions: true
  }
}

export default function Listings() {
  const navigate = useNavigate()
  const [status, setStatus] = useState('Active')
  const [searchTerm, setSearchTerm] = useState('')
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' })
  const [visibleColumns, setVisibleColumns] = useState(getStoredVisibleColumns())
  const [columnOrder, setColumnOrder] = useState(getStoredColumnOrder())
  const [draggedColumn, setDraggedColumn] = useState(null)
  const [filters, setFilters] = useState([])
  const [notification, setNotification] = useState(null)
  const queryClient = useQueryClient()

  const showNotification = (type, message) => {
    setNotification({ type, message })
    setTimeout(() => setNotification(null), 5000)
  }

  // Save column order to localStorage when it changes
  useEffect(() => {
    try {
      localStorage.setItem('listings-column-order', JSON.stringify(columnOrder))
    } catch (error) {
      console.warn('Failed to save column order to localStorage:', error)
    }
  }, [columnOrder])

  // Save visible columns to localStorage when they change
  useEffect(() => {
    try {
      localStorage.setItem('listings-visible-columns', JSON.stringify(visibleColumns))
    } catch (error) {
      console.warn('Failed to save visible columns to localStorage:', error)
    }
  }, [visibleColumns])

  const { data: listings, isLoading, error, refetch } = useQuery(
    ['listings', { status }],
    () => listingsAPI.getListings({ status }),
    {
      keepPreviousData: true,
      refetchOnWindowFocus: false,
      refetchOnMount: false, // Don't refetch on mount if data exists
      staleTime: 6 * 60 * 60 * 1000, // Consider data fresh for 6 hours (matches scheduled sync interval)
      cacheTime: 12 * 60 * 60 * 1000, // Keep cached data for 12 hours
      retry: 1, // Only retry once on failure
      refetchInterval: false, // Disable automatic polling (use scheduled sync instead)
      refetchIntervalInBackground: false,
      refetchOnReconnect: 'always' // Refetch when network reconnects
    }
  )

  const { data: userProfile, isLoading: isUserLoading } = useQuery(
    ['userProfile'],
    () => userAPI.getProfile(),
    {
      retry: 1,
      refetchOnWindowFocus: false
    }
  )

  const reducePriceMutation = useMutation(
    ({ listingId, customPrice }) => listingsAPI.recordPriceReduction(listingId, customPrice, 'manual'),
    {
      onSuccess: (data, { listingId }) => {
        showNotification('success', `Price reduced to $${data.current_price}`)
        queryClient.invalidateQueries('listings')
      },
      onError: (error) => {
        showNotification('error', error.message || 'Failed to reduce price')
      }
    }
  )

  const deleteMutation = useMutation(listingsAPI.deleteListing, {
    onSuccess: () => {
      showNotification('success', 'Listing removed from monitoring')
      queryClient.invalidateQueries('listings')
    },
    onError: (error) => {
      showNotification('error', error.message || 'Failed to delete listing')
    }
  })

  const updateMinimumPriceMutation = useMutation(
    ({ listingId, minimumPrice }) => listingsAPI.updateListing(listingId, { minimum_price: minimumPrice }),
    {
      onSuccess: () => {
        showNotification('success', 'Minimum price updated')
        queryClient.invalidateQueries('listings')
      },
      onError: (error) => {
        showNotification('error', error.message || 'Failed to update minimum price')
      }
    }
  )

  const updateStrategyMutation = useMutation(
    ({ listingId, strategy }) => listingsAPI.updateListing(listingId, { reduction_strategy: strategy }),
    {
      onSuccess: () => {
        showNotification('success', 'Strategy updated')
        queryClient.invalidateQueries('listings')
      },
      onError: (error) => {
        showNotification('error', error.message || 'Failed to update strategy')
      }
    }
  )

  const togglePriceReductionMutation = useMutation(
    ({ listingId, enabled }) => listingsAPI.updateListing(listingId, { price_reduction_enabled: enabled }),
    {
      onSuccess: (data, { enabled }) => {
        showNotification('success', `Price reduction ${enabled ? 'enabled' : 'disabled'}`)
        queryClient.invalidateQueries('listings')
      },
      onError: (error) => {
        showNotification('error', error.message || 'Failed to update price reduction status')
      }
    }
  )

  const handleReducePrice = (listingId) => {
    if (window.confirm('Are you sure you want to reduce the price now?')) {
      reducePriceMutation.mutate({ listingId, customPrice: null })
    }
  }

  const handleDeleteListing = (listingId) => {
    if (window.confirm('Are you sure you want to remove this listing from monitoring?')) {
      deleteMutation.mutate(listingId)
    }
  }

  const handleMinimumPriceUpdate = (listingId, value) => {
    const minimumPrice = parseFloat(value)
    if (!isNaN(minimumPrice) && minimumPrice >= 0) {
      updateMinimumPriceMutation.mutate({ listingId, minimumPrice })
    }
  }

  const handleStrategyUpdate = (listingId, strategy) => {
    updateStrategyMutation.mutate({ listingId, strategy })
  }

  const handleTogglePriceReduction = (listingId, currentState) => {
    togglePriceReductionMutation.mutate({ listingId, enabled: !currentState })
  }

  const handleConnectEbay = () => {
    // Navigate to Account page with integrations tab active
    navigate('/account?tab=integrations')
  }

  const handleSyncFromEbay = async () => {
    try {
      setNotification({ type: 'info', message: 'Syncing listings from eBay...' })

      const { supabase } = await import('../lib/supabase')
      const { data: { session } } = await supabase.auth.getSession()

      if (!session?.access_token) {
        throw new Error('Not authenticated')
      }

      const response = await fetch('/.netlify/functions/trigger-sync', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        }
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.message || 'Sync failed')
      }

      setNotification({
        type: 'success',
        message: `Successfully synced ${result.count} listings from eBay!`
      })

      // Refresh the listings
      refetch()
    } catch (error) {
      console.error('Sync error:', error)
      setNotification({
        type: 'error',
        message: error.message || 'Failed to sync listings'
      })
    }
  }

  const handleSort = (key) => {
    let direction = 'asc'
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc'
    }
    setSortConfig({ key, direction })
  }

  const toggleColumnVisibility = (column) => {
    setVisibleColumns(prev => ({
      ...prev,
      [column]: !prev[column]
    }))
  }

  const handleDragStart = (e, column) => {
    setDraggedColumn(column)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const handleDrop = (e, targetColumn) => {
    e.preventDefault()

    if (draggedColumn && draggedColumn !== targetColumn) {
      const newOrder = [...columnOrder]
      const draggedIndex = newOrder.indexOf(draggedColumn)
      const targetIndex = newOrder.indexOf(targetColumn)

      newOrder.splice(draggedIndex, 1)
      newOrder.splice(targetIndex, 0, draggedColumn)

      setColumnOrder(newOrder)
    }
    setDraggedColumn(null)
  }

  const handleDragEnd = () => {
    setDraggedColumn(null)
  }

  const calculateListingAge = (createdAt) => {
    const now = new Date()
    const created = new Date(createdAt)
    const diffTime = Math.abs(now - created)
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    return `${diffDays} days`
  }

  const calculateSuggestedPrice = (currentPrice, originalPrice) => {
    const reduction = Math.max(0.05, Math.random() * 0.15)
    return (currentPrice * (1 - reduction)).toFixed(2)
  }

  const sortedListings = useMemo(() => {
    let listingsToSort = listings?.listings || []

    // Use empty array if no listings
    if (!listingsToSort) {
      listingsToSort = []
    }

    // Apply search filter
    if (searchTerm.trim()) {
      const searchLower = searchTerm.toLowerCase()
      listingsToSort = listingsToSort.filter(listing => {
        const strategy = getStrategyById(listing.reduction_strategy)
        const strategyName = strategy ? strategy.name : ''

        return (
          listing.title?.toLowerCase().includes(searchLower) ||
          listing.sku?.toLowerCase().includes(searchLower) ||
          listing.current_price?.toString().includes(searchLower) ||
          listing.original_price?.toString().includes(searchLower) ||
          listing.quantity?.toString().includes(searchLower) ||
          listing.minimum_price?.toString().includes(searchLower) ||
          strategyName.toLowerCase().includes(searchLower) ||
          listing.id?.toLowerCase().includes(searchLower)
        )
      })
    }

    // Apply filters
    if (filters.length > 0) {
      listingsToSort = listingsToSort.filter(listing => {
        return filters.every(filter => {
          if (!filter.field || !filter.value) return true

          let listingValue
          if (filter.field === 'strategy') {
            listingValue = listing.reduction_strategy
          } else if (filter.field === 'listing_age') {
            const created = new Date(listing.created_at || new Date())
            const now = new Date()
            listingValue = Math.ceil((now - created) / (1000 * 60 * 60 * 24))
          } else if (filter.field === 'price_reduction_enabled') {
            listingValue = listing.price_reduction_enabled?.toString()
          } else {
            listingValue = listing[filter.field]
          }

          const filterValue = filter.value
          const numericListingValue = parseFloat(listingValue)
          const numericFilterValue = parseFloat(filterValue)

          switch (filter.operator) {
            case 'equals':
              return filter.field === 'sku'
                ? listingValue?.toLowerCase().includes(filterValue.toLowerCase())
                : listingValue?.toString() === filterValue
            case 'contains':
              return listingValue?.toLowerCase().includes(filterValue.toLowerCase())
            case 'greater_than':
              return !isNaN(numericListingValue) && !isNaN(numericFilterValue) && numericListingValue > numericFilterValue
            case 'less_than':
              return !isNaN(numericListingValue) && !isNaN(numericFilterValue) && numericListingValue < numericFilterValue
            case 'greater_than_equal':
              return !isNaN(numericListingValue) && !isNaN(numericFilterValue) && numericListingValue >= numericFilterValue
            case 'less_than_equal':
              return !isNaN(numericListingValue) && !isNaN(numericFilterValue) && numericListingValue <= numericFilterValue
            default:
              return true
          }
        })
      })
    }

    // Apply sorting
    if (!sortConfig.key) return listingsToSort

    return [...listingsToSort].sort((a, b) => {
      let aValue = a[sortConfig.key]
      let bValue = b[sortConfig.key]

      if (sortConfig.key === 'current_price' || sortConfig.key === 'original_price') {
        aValue = parseFloat(aValue)
        bValue = parseFloat(bValue)
      }

      if (aValue < bValue) {
        return sortConfig.direction === 'asc' ? -1 : 1
      }
      if (aValue > bValue) {
        return sortConfig.direction === 'asc' ? 1 : -1
      }
      return 0
    })
  }, [listings?.listings, sortConfig, searchTerm, filters])

  // Get active strategies from shared data source
  const availableStrategies = getActiveStrategies()

  // Filter configuration
  const filterOptions = [
    { key: 'strategy', label: 'Strategy', type: 'select', options: availableStrategies.map(s => ({ value: s.id, label: s.name })) },
    { key: 'current_price', label: 'Current Price', type: 'number' },
    { key: 'original_price', label: 'Original Price', type: 'number' },
    { key: 'quantity', label: 'Quantity', type: 'number' },
    { key: 'minimum_price', label: 'Minimum Price', type: 'number' },
    { key: 'listing_age', label: 'Listing Age (days)', type: 'number' },
    { key: 'sku', label: 'SKU', type: 'text' },
    { key: 'price_reduction_enabled', label: 'Monitoring Status', type: 'select', options: [
      { value: 'true', label: 'Active' },
      { value: 'false', label: 'Paused' }
    ]}
  ]

  const addFilter = () => {
    const newFilter = {
      id: Date.now(),
      field: '',
      operator: 'equals',
      value: ''
    }
    setFilters([...filters, newFilter])
  }

  const updateFilter = (id, updates) => {
    setFilters(filters.map(filter =>
      filter.id === id ? { ...filter, ...updates } : filter
    ))
  }

  const removeFilter = (id) => {
    setFilters(filters.filter(filter => filter.id !== id))
  }

  const clearAllFilters = () => {
    setFilters([])
  }

  // Column configuration
  const getColumnConfig = (column) => {
    const configs = {
      image: { label: 'Image', sortable: false, width: 'w-20 lg:w-24' },
      title: { label: 'Title', sortable: true, sortKey: 'title', width: 'w-1/3 lg:w-2/5' },
      quantity: { label: 'Quantity', sortable: true, sortKey: 'quantity', width: 'w-16 lg:w-20' },
      currentPrice: { label: 'Current Price', sortable: true, sortKey: 'current_price', width: 'w-24 lg:w-28' },
      minimumPrice: { label: 'Minimum Price', sortable: false, width: 'w-24 lg:w-28' },
      priceReductionEnabled: { label: 'Price Reduction', sortable: true, sortKey: 'price_reduction_enabled', width: 'w-32 lg:w-36' },
      strategy: { label: 'Strategy', sortable: false, width: 'w-40 lg:w-48' },
      viewCount: { label: 'Views', sortable: true, sortKey: 'view_count', width: 'w-20 lg:w-24' },
      watchCount: { label: 'Watchers', sortable: true, sortKey: 'watch_count', width: 'w-20 lg:w-24' },
      listingAge: { label: 'Listing Age', sortable: true, sortKey: 'created_at', width: 'w-20 lg:w-24' },
      actions: { label: 'Actions', sortable: false, width: 'w-32 lg:w-36' }
    }
    return configs[column] || { label: column, sortable: false }
  }

  if (isLoading) {
    return <div className="text-center py-8">Loading listings...</div>
  }

  if (error) {
    const errorMessage = error?.message || 'Unknown error occurred'
    const isEbayConnectionError = errorMessage.includes('eBay account not connected')
    const isAuthError = errorMessage.includes('Authentication') || errorMessage.includes('log in')
    const isServiceError = errorMessage.includes('service') || errorMessage.includes('unavailable')

    return (
      <div className="max-w-2xl mx-auto py-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <div className="flex items-center mb-4">
            <svg className="w-6 h-6 text-red-600 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
            <h3 className="text-lg font-medium text-red-800">Unable to Load Listings</h3>
          </div>

          <p className="text-red-700 mb-4">{errorMessage}</p>

          <div className="space-y-3">
            {isEbayConnectionError && (
              <button
                onClick={handleConnectEbay}
                className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500"
              >
                Connect eBay Account
              </button>
            )}

            {isAuthError && (
              <button
                onClick={() => window.location.reload()}
                className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500"
              >
                Refresh Page
              </button>
            )}

            {isServiceError && (
              <div className="text-sm text-red-600">
                <p>This is usually temporary. Please try again in a few minutes.</p>
                <button
                  onClick={() => window.location.reload()}
                  className="mt-2 bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500"
                >
                  Try Again
                </button>
              </div>
            )}

            {!isEbayConnectionError && !isAuthError && !isServiceError && (
              <div className="text-sm text-red-600">
                <p>If this problem persists, please contact support.</p>
                <button
                  onClick={() => window.location.reload()}
                  className="mt-2 bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500"
                >
                  Try Again
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Notification Banner */}
      {notification && (
        <div className={`rounded-md p-3 ${
          notification.type === 'success'
            ? 'bg-blue-50 border border-blue-200'
            : 'bg-red-50 border border-red-200'
        }`}>
          <div className="flex">
            <div className={`${
              notification.type === 'success' ? 'text-blue-800' : 'text-red-800'
            }`}>
              {notification.message}
            </div>
          </div>
        </div>
      )}

      {/* eBay Connection Banner */}
      {userProfile && userProfile.ebay_connection_status !== 'connected' && (
        <div className="rounded-md p-4 bg-yellow-50 border border-yellow-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className="text-yellow-800">
                <svg className="w-5 h-5 mr-2 inline" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <strong>Connect Your eBay Account</strong>
                <div className="mt-1 text-sm">
                  You need to connect your eBay account to import and manage your listings automatically.
                </div>
              </div>
            </div>
            <button
              onClick={handleConnectEbay}
              className="bg-yellow-600 text-white px-4 py-2 rounded hover:bg-yellow-700 focus:outline-none focus:ring-2 focus:ring-yellow-500"
            >
              Connect eBay Account
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Your eBay Listings</h1>
          <p className="text-gray-600">Manage and monitor your eBay listing prices</p>
        </div>
        <button
          onClick={handleSyncFromEbay}
          disabled={isLoading}
          className={`px-4 py-2 rounded text-white ${
            isLoading
              ? 'bg-gray-400 cursor-not-allowed'
              : 'bg-blue-600 hover:bg-blue-700'
          }`}
        >
          {isLoading ? 'Loading...' : 'Import from eBay'}
        </button>
      </div>

      {/* Search Box */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
            </svg>
          </div>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
            placeholder="Search listings by title, SKU, price, quantity, strategy, or any data..."
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute inset-y-0 right-0 pr-3 flex items-center"
            >
              <svg className="h-5 w-5 text-gray-400 hover:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
              </svg>
            </button>
          )}
        </div>
        {searchTerm && (
          <div className="mt-2 text-sm text-gray-600">
            {sortedListings.length} listing{sortedListings.length !== 1 ? 's' : ''} found
          </div>
        )}
      </div>

      {/* Controls Row */}
      <div className="space-y-4 lg:space-y-0 lg:flex lg:justify-between lg:items-center">
        {/* Status Filter */}
        <div className="flex flex-wrap gap-2 justify-center lg:justify-start">
          {['Active', 'Ended', 'all'].map((statusOption) => (
            <button
              key={statusOption}
              onClick={() => setStatus(statusOption)}
              className={`px-3 py-2 rounded text-sm font-medium flex-shrink-0 ${
                status === statusOption
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              {statusOption === 'all' ? 'All' : statusOption}
            </button>
          ))}
        </div>

        {/* Filter and Column Controls */}
        <div className="flex flex-wrap gap-2 justify-center lg:justify-end">
          {/* Add Filter Button */}
          <button
            onClick={addFilter}
            className="bg-green-100 text-green-800 px-3 py-2 rounded text-sm hover:bg-green-200 flex items-center space-x-1 flex-shrink-0"
          >
            <span>+</span>
            <span className="hidden sm:inline">Add Filter</span>
            <span className="sm:hidden">Filter</span>
          </button>

          {/* Clear Filters Button */}
          {filters.length > 0 && (
            <button
              onClick={clearAllFilters}
              className="bg-red-100 text-red-800 px-3 py-2 rounded text-sm hover:bg-red-200 flex-shrink-0"
            >
              <span className="hidden sm:inline">Clear All ({filters.length})</span>
              <span className="sm:hidden">Clear ({filters.length})</span>
            </button>
          )}

          {/* Column Visibility Controls - Hidden on mobile since mobile uses cards */}
          <div className="hidden lg:block relative">
            <details className="relative">
              <summary className="bg-gray-100 px-3 py-2 rounded text-sm cursor-pointer hover:bg-gray-200">
                Manage Columns
              </summary>
              <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg border z-10">
                <div className="p-2">
                  {Object.entries(visibleColumns).map(([column, visible]) => (
                    <label key={column} className="flex items-center space-x-2 p-1">
                      <input
                        type="checkbox"
                        checked={visible}
                        onChange={() => toggleColumnVisibility(column)}
                        className="rounded"
                      />
                      <span className="text-sm capitalize">{column.replace(/([A-Z])/g, ' $1').trim()}</span>
                    </label>
                  ))}
                </div>
              </div>
            </details>
          </div>
        </div>
      </div>

      {/* Active Filters */}
      {filters.length > 0 && (
        <div className="bg-white rounded-lg shadow p-4">
          <h3 className="text-sm font-medium text-gray-700 mb-3">Active Filters</h3>
          <div className="space-y-3">
            {filters.map((filter) => {
              const filterOption = filterOptions.find(opt => opt.key === filter.field)
              const isNumeric = filterOption?.type === 'number'
              const isSelect = filterOption?.type === 'select'

              return (
                <div key={filter.id} className="p-3 bg-gray-50 rounded">
                  <div className="flex flex-col space-y-3 sm:flex-row sm:space-y-0 sm:space-x-3 sm:items-center">
                    {/* Field Selection */}
                    <select
                      value={filter.field}
                      onChange={(e) => updateFilter(filter.id, { field: e.target.value, operator: 'equals', value: '' })}
                      className="text-sm border border-gray-300 rounded px-2 py-1 bg-white w-full sm:w-auto"
                    >
                      <option value="">Select Field</option>
                      {filterOptions.map(option => (
                        <option key={option.key} value={option.key}>{option.label}</option>
                      ))}
                    </select>

                    {/* Operator Selection (for numeric fields) */}
                    {filter.field && isNumeric && (
                      <select
                        value={filter.operator}
                        onChange={(e) => updateFilter(filter.id, { operator: e.target.value })}
                        className="text-sm border border-gray-300 rounded px-2 py-1 bg-white w-full sm:w-auto"
                      >
                        <option value="equals">=</option>
                        <option value="greater_than">&gt;</option>
                        <option value="less_than">&lt;</option>
                        <option value="greater_than_equal">≥</option>
                        <option value="less_than_equal">≤</option>
                      </select>
                    )}

                    {/* Operator Selection (for text fields) */}
                    {filter.field && !isNumeric && !isSelect && (
                      <select
                        value={filter.operator}
                        onChange={(e) => updateFilter(filter.id, { operator: e.target.value })}
                        className="text-sm border border-gray-300 rounded px-2 py-1 bg-white w-full sm:w-auto"
                      >
                        <option value="equals">Equals</option>
                        <option value="contains">Contains</option>
                      </select>
                    )}

                    {/* Value Input */}
                    {filter.field && (
                      <>
                        {isSelect ? (
                          <select
                            value={filter.value}
                            onChange={(e) => updateFilter(filter.id, { value: e.target.value })}
                            className="text-sm border border-gray-300 rounded px-2 py-1 bg-white w-full sm:w-auto"
                          >
                            <option value="">Select Value</option>
                            {filterOption.options?.map(option => (
                              <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type={isNumeric ? 'number' : 'text'}
                            value={filter.value}
                            onChange={(e) => updateFilter(filter.id, { value: e.target.value })}
                            placeholder={`Enter ${filterOption?.label.toLowerCase()}`}
                            className="text-sm border border-gray-300 rounded px-2 py-1 bg-white w-full sm:w-auto"
                          />
                        )}
                      </>
                    )}

                    {/* Remove Filter Button */}
                    <button
                      onClick={() => removeFilter(filter.id)}
                      className="text-red-600 hover:text-red-800 text-sm p-2 hover:bg-red-50 rounded flex-shrink-0 self-center sm:self-auto"
                      aria-label="Remove filter"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Mobile Card View (visible on small screens) */}
      <div className="lg:hidden space-y-4">
        {sortedListings.map((listing) => (
          <div key={listing.id} className="bg-white rounded-lg shadow p-4">
            <div className="flex items-start space-x-4">
              <img
                src={listing.image_urls?.[0] || '/placeholder-image.jpg'}
                alt={listing.title}
                className="w-20 h-20 rounded-lg object-cover flex-shrink-0"
              />
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-medium text-gray-900 truncate">{listing.title}</h3>
                {listing.sku && (
                  <p className="text-xs text-gray-500 mt-1">SKU: {listing.sku}</p>
                )}

                <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-gray-500">Current Price:</span>
                    <div className="font-bold text-green-600">${listing.current_price}</div>
                  </div>
                  <div>
                    <span className="text-gray-500">Quantity:</span>
                    <div className="font-medium">{listing.quantity || 1}</div>
                  </div>
                  <div>
                    <span className="text-gray-500">Views:</span>
                    <div className="font-medium">{listing.view_count || 0}</div>
                  </div>
                  <div>
                    <span className="text-gray-500">Watchers:</span>
                    <div className="font-medium">{listing.watch_count || 0}</div>
                  </div>
                  <div>
                    <span className="text-gray-500">Age:</span>
                    <div className="font-medium">{calculateListingAge(listing.created_at || new Date())}</div>
                  </div>
                </div>

                <div className="mt-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-500">Minimum Price:</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      defaultValue={listing.minimum_price || ''}
                      onBlur={(e) => handleMinimumPriceUpdate(listing.id, e.target.value)}
                      className="w-24 px-2 py-1 text-sm border border-gray-300 rounded"
                      placeholder="Set min"
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-500">Price Reduction:</span>
                    <div className="flex items-center">
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={listing.price_reduction_enabled}
                          onChange={() => handleTogglePriceReduction(listing.id, listing.price_reduction_enabled)}
                          disabled={togglePriceReductionMutation.isLoading}
                          className="sr-only"
                        />
                        <div className={`relative w-11 h-6 rounded-full transition-colors duration-200 ease-in-out ${
                          listing.price_reduction_enabled ? 'bg-blue-600' : 'bg-gray-200'
                        }`}>
                          <div className={`absolute top-0.5 left-0.5 bg-white w-5 h-5 rounded-full transition-transform duration-200 ease-in-out ${
                            listing.price_reduction_enabled ? 'translate-x-5' : 'translate-x-0'
                          }`}></div>
                        </div>
                      </label>
                      <span className={`ml-2 text-xs ${
                        listing.price_reduction_enabled ? 'text-green-600 font-medium' : 'text-gray-500'
                      }`}>
                        {listing.price_reduction_enabled ? 'Active' : 'Paused'}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-500">Strategy:</span>
                    <select
                      value={listing.reduction_strategy || ''}
                      onChange={(e) => handleStrategyUpdate(listing.id, e.target.value)}
                      className="text-sm border border-gray-300 rounded px-2 py-1 max-w-32"
                    >
                      <option value="">Select Strategy</option>
                      {availableStrategies.map((strategy) => (
                        <option key={strategy.id} value={strategy.id}>
                          {strategy.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Link
                    to={`/listings/${listing.id}`}
                    className="bg-blue-600 text-white px-3 py-1 rounded text-xs hover:bg-blue-700"
                  >
                    View
                  </Link>
                  <button
                    onClick={() => handleReducePrice(listing.id)}
                    disabled={reducePriceMutation.isLoading}
                    className="bg-orange-600 text-white px-3 py-1 rounded text-xs hover:bg-orange-700 disabled:opacity-50"
                  >
                    Reduce Price
                  </button>
                  <button
                    onClick={() => handleDeleteListing(listing.id)}
                    disabled={deleteMutation.isLoading}
                    className="bg-red-600 text-white px-3 py-1 rounded text-xs hover:bg-red-700 disabled:opacity-50"
                  >
                    Remove
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}

        {sortedListings.length === 0 && (
          <div className="text-center py-12 bg-white rounded-lg shadow">
            <div className="text-gray-500 mb-4">
              {userProfile?.ebay_connection_status === 'connected'
                ? 'No listings found. Click "Import from eBay" to sync your listings.'
                : 'Connect your eBay account to import listings.'
              }
            </div>
            {userProfile?.ebay_connection_status === 'connected' ? (
              <button
                onClick={handleSyncFromEbay}
                className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700"
              >
                Import from eBay
              </button>
            ) : (
              <button
                onClick={handleConnectEbay}
                className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700"
              >
                Connect eBay Account
              </button>
            )}
          </div>
        )}
      </div>

      {/* Desktop Table View (visible on large screens) */}
      <div className="hidden lg:block bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full table-fixed divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {columnOrder.map((column) => {
                  if (!visibleColumns[column]) return null
                  const config = getColumnConfig(column)

                  return (
                    <th
                      key={column}
                      draggable
                      onDragStart={(e) => handleDragStart(e, column)}
                      onDragOver={handleDragOver}
                      onDrop={(e) => handleDrop(e, column)}
                      onDragEnd={handleDragEnd}
                      className={`px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider ${
                        config.sortable ? 'cursor-pointer hover:bg-gray-100' : ''
                      } ${draggedColumn === column ? 'opacity-50' : ''} ${config.width || ''} select-none`}
                      onClick={config.sortable ? () => handleSort(config.sortKey) : undefined}
                    >
                      <div className="flex items-center space-x-1">
                        <span>⋮⋮</span>
                        <span>{config.label}</span>
                        {config.sortable && sortConfig.key === config.sortKey && (
                          <span>{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                        )}
                      </div>
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {sortedListings.map((listing) => (
                <tr key={listing.id} className="hover:bg-gray-50">
                  {columnOrder.map((column) => {
                    if (!visibleColumns[column]) return null

                    const renderCell = () => {
                      switch (column) {
                        case 'image':
                          return (
                            <img
                              src={listing.image_urls?.[0] || '/placeholder-image.jpg'}
                              alt={listing.title}
                              className="w-16 h-16 rounded-lg object-cover"
                            />
                          )
                        case 'title':
                          return (
                            <div className="max-w-xs">
                              <div className="text-sm font-medium text-gray-900 truncate">
                                {listing.title}
                              </div>
                              {listing.sku && (
                                <div className="text-xs text-gray-500 mt-1">
                                  SKU: {listing.sku}
                                </div>
                              )}
                            </div>
                          )
                        case 'quantity':
                          return (
                            <div className="text-sm text-gray-900">{listing.quantity || 1}</div>
                          )
                        case 'currentPrice':
                          return (
                            <div className="text-sm font-bold text-green-600">${listing.current_price}</div>
                          )
                        case 'minimumPrice':
                          return (
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              defaultValue={listing.minimum_price || ''}
                              onBlur={(e) => handleMinimumPriceUpdate(listing.id, e.target.value)}
                              className="w-20 px-2 py-1 text-sm border border-gray-300 rounded"
                              placeholder="Set min"
                            />
                          )
                        case 'priceReductionEnabled':
                          return (
                            <div className="flex items-center">
                              <label className="relative inline-flex items-center cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={listing.price_reduction_enabled}
                                  onChange={() => handleTogglePriceReduction(listing.id, listing.price_reduction_enabled)}
                                  disabled={togglePriceReductionMutation.isLoading}
                                  className="sr-only"
                                />
                                <div className={`relative w-11 h-6 rounded-full transition-colors duration-200 ease-in-out ${
                                  listing.price_reduction_enabled ? 'bg-blue-600' : 'bg-gray-200'
                                }`}>
                                  <div className={`absolute top-0.5 left-0.5 bg-white w-5 h-5 rounded-full transition-transform duration-200 ease-in-out ${
                                    listing.price_reduction_enabled ? 'translate-x-5' : 'translate-x-0'
                                  }`}></div>
                                </div>
                              </label>
                              <span className={`ml-2 text-xs ${
                                listing.price_reduction_enabled ? 'text-green-600 font-medium' : 'text-gray-500'
                              }`}>
                                {listing.price_reduction_enabled ? 'Active' : 'Paused'}
                              </span>
                            </div>
                          )
                        case 'strategy':
                          const currentStrategy = getStrategyById(listing.reduction_strategy)
                          return (
                            <select
                              value={listing.reduction_strategy || ''}
                              onChange={(e) => handleStrategyUpdate(listing.id, e.target.value)}
                              className="text-sm border border-gray-300 rounded px-2 py-1 min-w-40"
                            >
                              <option value="">Select Strategy</option>
                              {availableStrategies.map((strategy) => (
                                <option key={strategy.id} value={strategy.id}>
                                  {strategy.name}
                                </option>
                              ))}
                            </select>
                          )
                        case 'viewCount':
                          return (
                            <div className="text-sm text-gray-900 text-center">
                              {listing.view_count || 0}
                            </div>
                          )
                        case 'watchCount':
                          return (
                            <div className="text-sm text-gray-900 text-center">
                              {listing.watch_count || 0}
                            </div>
                          )
                        case 'listingAge':
                          return (
                            <div className="text-sm text-gray-900">
                              {calculateListingAge(listing.created_at || new Date())}
                            </div>
                          )
                        case 'actions':
                          return (
                            <div className="flex space-x-2">
                              <Link
                                to={`/listings/${listing.id}`}
                                className="bg-blue-600 text-white px-2 py-1 rounded text-xs hover:bg-blue-700"
                              >
                                View
                              </Link>
                              <button
                                onClick={() => handleReducePrice(listing.id)}
                                disabled={reducePriceMutation.isLoading}
                                className="bg-orange-600 text-white px-2 py-1 rounded text-xs hover:bg-orange-700 disabled:opacity-50"
                              >
                                Reduce
                              </button>
                              <button
                                onClick={() => handleDeleteListing(listing.id)}
                                disabled={deleteMutation.isLoading}
                                className="bg-red-600 text-white px-2 py-1 rounded text-xs hover:bg-red-700 disabled:opacity-50"
                              >
                                Remove
                              </button>
                            </div>
                          )
                        default:
                          return null
                      }
                    }

                    const config = getColumnConfig(column)
                    return (
                      <td
                        key={column}
                        className={`px-4 py-3 ${column === 'actions' ? 'whitespace-nowrap text-sm font-medium' : 'whitespace-nowrap'} ${config.width || ''}`}
                      >
                        {renderCell()}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {(!listings?.listings || listings.listings.length === 0) && (
          <div className="text-center py-12">
            <div className="text-gray-500 mb-4">
              {userProfile?.ebay_connection_status === 'connected'
                ? 'No listings found. Click "Import from eBay" to sync your listings.'
                : 'Connect your eBay account to import listings.'
              }
            </div>
            {userProfile?.ebay_connection_status === 'connected' ? (
              <button
                onClick={handleSyncFromEbay}
                className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700"
              >
                Import from eBay
              </button>
            ) : (
              <button
                onClick={handleConnectEbay}
                className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700"
              >
                Connect eBay Account
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
import { useState, useMemo, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { listingsAPI } from '../lib/supabase'
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
    'priceReductionEnabled', 'strategy', 'suggestedPrice', 'listingAge', 'actions'
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
    suggestedPrice: true,
    listingAge: true,
    actions: true
  }
}

export default function Listings() {
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

  const { data: listings, isLoading, error } = useQuery(
    ['listings', { status }],
    () => listingsAPI.getListings({ status }),
    {
      keepPreviousData: true
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

    // Add mock data if we don't have real listings
    if (!listingsToSort || listingsToSort.length === 0) {
      listingsToSort = [
        {
          id: '1',
          title: 'iPhone 14 Pro Max 256GB Space Black',
          sku: 'IPH14PM-256-SB',
          current_price: 899.99,
          original_price: 999.99,
          quantity: 1,
          minimum_price: 850.00,
          reduction_strategy: '1',
          image_urls: ['https://via.placeholder.com/150x150?text=iPhone'],
          created_at: '2024-01-15',
          price_reduction_enabled: true
        },
        {
          id: '2',
          title: 'Samsung Galaxy S23 Ultra 512GB Phantom Black',
          sku: 'SGS23U-512-PB',
          current_price: 799.99,
          original_price: 849.99,
          quantity: 2,
          minimum_price: 750.00,
          reduction_strategy: '2',
          image_urls: ['https://via.placeholder.com/150x150?text=Galaxy'],
          created_at: '2024-01-20',
          price_reduction_enabled: true
        },
        {
          id: '3',
          title: 'MacBook Air M2 13-inch 256GB Silver',
          sku: 'MBA-M2-256-SLV',
          current_price: 1099.99,
          original_price: 1199.99,
          quantity: 1,
          minimum_price: 1050.00,
          reduction_strategy: '',
          image_urls: ['https://via.placeholder.com/150x150?text=MacBook'],
          created_at: '2024-02-01',
          price_reduction_enabled: false
        }
      ]
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
      image: { label: 'Image', sortable: false },
      title: { label: 'Title', sortable: true, sortKey: 'title' },
      quantity: { label: 'Quantity', sortable: true, sortKey: 'quantity' },
      currentPrice: { label: 'Current Price', sortable: true, sortKey: 'current_price' },
      minimumPrice: { label: 'Minimum Price', sortable: false },
      priceReductionEnabled: { label: 'Price Reduction', sortable: true, sortKey: 'price_reduction_enabled' },
      strategy: { label: 'Strategy', sortable: false },
      suggestedPrice: { label: 'Suggested Price', sortable: false },
      listingAge: { label: 'Listing Age', sortable: true, sortKey: 'created_at' },
      actions: { label: 'Actions', sortable: false }
    }
    return configs[column] || { label: column, sortable: false }
  }

  if (isLoading) {
    return <div className="text-center py-8">Loading listings...</div>
  }

  if (error) {
    return <div className="text-center py-8 text-red-600">Error loading listings</div>
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

      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Your eBay Listings</h1>
          <p className="text-gray-600">Manage and monitor your eBay listing prices</p>
        </div>
        <button className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">
          Import from eBay
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
      <div className="flex justify-between items-center">
        {/* Status Filter */}
        <div className="flex space-x-2">
          {['Active', 'Ended', 'all'].map((statusOption) => (
            <button
              key={statusOption}
              onClick={() => setStatus(statusOption)}
              className={`px-4 py-2 rounded text-sm font-medium ${
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
        <div className="flex space-x-2">
          {/* Add Filter Button */}
          <button
            onClick={addFilter}
            className="bg-green-100 text-green-800 px-4 py-2 rounded text-sm hover:bg-green-200 flex items-center space-x-1"
          >
            <span>+</span>
            <span>Add Filter</span>
          </button>

          {/* Clear Filters Button */}
          {filters.length > 0 && (
            <button
              onClick={clearAllFilters}
              className="bg-red-100 text-red-800 px-4 py-2 rounded text-sm hover:bg-red-200"
            >
              Clear All ({filters.length})
            </button>
          )}

          {/* Column Visibility Controls */}
          <div className="relative">
            <details className="relative">
              <summary className="bg-gray-100 px-4 py-2 rounded text-sm cursor-pointer hover:bg-gray-200">
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
                <div key={filter.id} className="flex items-center space-x-3 p-3 bg-gray-50 rounded">
                  {/* Field Selection */}
                  <select
                    value={filter.field}
                    onChange={(e) => updateFilter(filter.id, { field: e.target.value, operator: 'equals', value: '' })}
                    className="text-sm border border-gray-300 rounded px-2 py-1 bg-white"
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
                      className="text-sm border border-gray-300 rounded px-2 py-1 bg-white"
                    >
                      <option value="equals">Equals</option>
                      <option value="greater_than">Greater Than</option>
                      <option value="less_than">Less Than</option>
                      <option value="greater_than_equal">Greater Than or Equal</option>
                      <option value="less_than_equal">Less Than or Equal</option>
                    </select>
                  )}

                  {/* Operator Selection (for text fields) */}
                  {filter.field && !isNumeric && !isSelect && (
                    <select
                      value={filter.operator}
                      onChange={(e) => updateFilter(filter.id, { operator: e.target.value })}
                      className="text-sm border border-gray-300 rounded px-2 py-1 bg-white"
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
                          className="text-sm border border-gray-300 rounded px-2 py-1 bg-white"
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
                          className="text-sm border border-gray-300 rounded px-2 py-1 bg-white"
                        />
                      )}
                    </>
                  )}

                  {/* Remove Filter Button */}
                  <button
                    onClick={() => removeFilter(filter.id)}
                    className="text-red-600 hover:text-red-800 text-sm"
                  >
                    ✕
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Listings Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
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
                      } ${draggedColumn === column ? 'opacity-50' : ''} select-none`}
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
                        case 'suggestedPrice':
                          return (
                            <div className="text-sm text-blue-600 font-medium">
                              ${calculateSuggestedPrice(listing.current_price, listing.original_price)}
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

                    return (
                      <td
                        key={column}
                        className={`px-4 py-3 ${column === 'actions' ? 'whitespace-nowrap text-sm font-medium' : 'whitespace-nowrap'}`}
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
            <div className="text-gray-500 mb-4">No listings found</div>
            <button className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700">
              Import Your First Listing
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
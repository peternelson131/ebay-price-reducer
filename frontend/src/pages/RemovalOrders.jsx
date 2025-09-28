import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import * as XLSX from 'xlsx'
import { useMutation } from '@tanstack/react-query'
import { listingsAPI } from '../lib/supabase'

export default function RemovalOrders() {
  const [excelData, setExcelData] = useState([])
  const [processedData, setProcessedData] = useState([])
  const [selectedItems, setSelectedItems] = useState(new Set())
  const [processing, setProcessing] = useState(false)
  const [step, setStep] = useState(1) // 1: Upload, 2: Review, 3: Create Listings
  const [notification, setNotification] = useState(null)

  const showNotification = (type, message) => {
    setNotification({ type, message })
    setTimeout(() => setNotification(null), 5000)
  }

  // Excel file processing
  const processExcelFile = (file) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result)
        const workbook = XLSX.read(data, { type: 'array' })
        const sheetName = workbook.SheetNames[0]
        const worksheet = workbook.Sheets[sheetName]
        const jsonData = XLSX.utils.sheet_to_json(worksheet)

        // Process Amazon removal order data
        const processed = jsonData.map((row, index) => ({
          id: `row-${index}`,
          asin: row['ASIN'] || row['asin'] || '',
          sku: row['SKU'] || row['sku'] || row['Merchant SKU'] || '',
          fnsku: row['FNSKU'] || row['fnsku'] || '',
          title: row['Product Name'] || row['Title'] || row['Product'] || '',
          quantity: parseInt(row['Quantity'] || row['quantity'] || row['Qty'] || 1),
          condition: row['Condition'] || row['condition'] || 'New',
          originalPrice: parseFloat(row['Price'] || row['Your Price'] || 0),
          suggestedPrice: null,
          category: row['Category'] || row['Product Category'] || '',
          brand: row['Brand'] || '',
          imageUrl: row['Image URL'] || row['Main Image'] || ''
        })).filter(item => item.asin || item.sku) // Filter out empty rows

        setExcelData(processed)
        setStep(2)
        showNotification('success', `Loaded ${processed.length} items from Excel`)
      } catch (error) {
        showNotification('error', 'Failed to parse Excel file. Please ensure it contains the correct columns.')
        console.error('Excel parsing error:', error)
      }
    }
    reader.readAsArrayBuffer(file)
  }

  // Dropzone configuration
  const onDrop = useCallback((acceptedFiles) => {
    if (acceptedFiles.length > 0) {
      processExcelFile(acceptedFiles[0])
    }
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/vnd.ms-excel': ['.xls'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'text/csv': ['.csv']
    },
    maxFiles: 1
  })

  // Process selected items for eBay listing creation
  const processForEbay = async () => {
    setProcessing(true)
    const selected = Array.from(selectedItems)
    const itemsToProcess = excelData.filter(item => selected.includes(item.id))

    // Calculate suggested prices and prepare for eBay
    const ebayListings = itemsToProcess.map(item => ({
      ...item,
      suggestedPrice: calculateEbayPrice(item.originalPrice, item.condition),
      listingTitle: createEbayTitle(item),
      ebayCategory: mapToEbayCategory(item.category),
      listingDescription: createListingDescription(item)
    }))

    setProcessedData(ebayListings)
    setStep(3)
    setProcessing(false)
  }

  // Price calculation based on condition and market
  const calculateEbayPrice = (originalPrice, condition) => {
    const conditionMultipliers = {
      'New': 1.2,
      'Like New': 1.1,
      'Very Good': 0.95,
      'Good': 0.85,
      'Acceptable': 0.75
    }
    const multiplier = conditionMultipliers[condition] || 1.0
    return (originalPrice * multiplier).toFixed(2)
  }

  // Create optimized eBay title (max 80 chars)
  const createEbayTitle = (item) => {
    let title = `${item.brand ? item.brand + ' ' : ''}${item.title}`
    if (item.condition !== 'New') {
      title += ` - ${item.condition}`
    }
    return title.substring(0, 80)
  }

  // Map Amazon categories to eBay categories
  const mapToEbayCategory = (amazonCategory) => {
    // This would need a proper mapping table
    const categoryMap = {
      'Electronics': '58058',
      'Books': '267',
      'Toys & Games': '220',
      'Home & Kitchen': '11700',
      'Clothing': '11450'
    }
    return categoryMap[amazonCategory] || '0' // Default category
  }

  // Create listing description
  const createListingDescription = (item) => {
    return `
      <h3>${item.title}</h3>
      <p><strong>Condition:</strong> ${item.condition}</p>
      <p><strong>SKU:</strong> ${item.sku}</p>
      ${item.asin ? `<p><strong>ASIN:</strong> ${item.asin}</p>` : ''}
      <p>This item is from Amazon FBA inventory.</p>
    `
  }

  // Toggle item selection
  const toggleSelection = (itemId) => {
    const newSelection = new Set(selectedItems)
    if (newSelection.has(itemId)) {
      newSelection.delete(itemId)
    } else {
      newSelection.add(itemId)
    }
    setSelectedItems(newSelection)
  }

  // Select all items
  const selectAll = () => {
    setSelectedItems(new Set(excelData.map(item => item.id)))
  }

  // Deselect all items
  const deselectAll = () => {
    setSelectedItems(new Set())
  }

  // Create eBay listings
  const createListingsMutation = useMutation(
    async (listings) => {
      // This would call the actual eBay API
      const results = await Promise.all(
        listings.map(listing =>
          listingsAPI.createListing({
            title: listing.listingTitle,
            description: listing.listingDescription,
            price: listing.suggestedPrice,
            quantity: listing.quantity,
            sku: listing.sku,
            category: listing.ebayCategory,
            condition: listing.condition,
            images: listing.imageUrl ? [listing.imageUrl] : []
          })
        )
      )
      return results
    },
    {
      onSuccess: () => {
        showNotification('success', 'Successfully created eBay listings!')
        // Reset state
        setExcelData([])
        setProcessedData([])
        setSelectedItems(new Set())
        setStep(1)
      },
      onError: (error) => {
        showNotification('error', `Failed to create listings: ${error.message}`)
      }
    }
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Amazon Removal Orders</h1>
        <p className="text-gray-600 mt-2">
          Upload your Amazon removal order Excel file to create eBay listings
        </p>
      </div>

      {/* Progress Steps */}
      <div className="bg-white rounded-lg shadow p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row items-center sm:justify-between gap-4">
          {[
            { num: 1, label: 'Upload Excel' },
            { num: 2, label: 'Review & Select' },
            { num: 3, label: 'Create Listings' }
          ].map((s, idx) => (
            <div key={s.num} className="flex items-center w-full sm:w-auto">
              <div className={`flex items-center justify-center w-10 h-10 rounded-full flex-shrink-0 ${
                step >= s.num ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600'
              }`}>
                {step > s.num ? '✓' : s.num}
              </div>
              <div className={`ml-3 text-sm sm:text-base ${step >= s.num ? 'text-gray-900' : 'text-gray-400'}`}>
                {s.label}
              </div>
              {idx < 2 && (
                <div className={`ml-4 w-full sm:w-20 h-1 hidden sm:block ${
                  step > s.num ? 'bg-blue-600' : 'bg-gray-200'
                }`} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Notification */}
      {notification && (
        <div className={`rounded-md p-3 ${
          notification.type === 'success'
            ? 'bg-green-50 border border-green-200 text-green-800'
            : 'bg-red-50 border border-red-200 text-red-800'
        }`}>
          {notification.message}
        </div>
      )}

      {/* Step 1: Upload */}
      {step === 1 && (
        <div className="bg-white rounded-lg shadow">
          <div className="p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">
              Upload Amazon Removal Order Excel
            </h2>

            <div
              {...getRootProps()}
              className={`border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-colors ${
                isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'
              }`}
            >
              <input {...getInputProps()} />
              <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <p className="mt-2 text-sm text-gray-600">
                {isDragActive
                  ? 'Drop your Excel file here...'
                  : 'Drag and drop your Excel file here, or click to browse'
                }
              </p>
              <p className="mt-1 text-xs text-gray-500">
                Supports .xls, .xlsx, and .csv files
              </p>
            </div>

            <div className="mt-6 border-t pt-6">
              <h3 className="text-sm font-medium text-gray-900 mb-2">
                Expected Excel Columns:
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-gray-600">
                <div>• ASIN</div>
                <div>• SKU</div>
                <div>• FNSKU</div>
                <div>• Product Name</div>
                <div>• Quantity</div>
                <div>• Condition</div>
                <div>• Price</div>
                <div>• Category</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Step 2: Review & Select */}
      {step === 2 && (
        <div className="bg-white rounded-lg shadow">
          <div className="p-6">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-4">
              <h2 className="text-lg font-medium text-gray-900">
                Review Items ({excelData.length} total, {selectedItems.size} selected)
              </h2>
              <div className="flex gap-2">
                <button
                  onClick={selectAll}
                  className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                >
                  Select All
                </button>
                <button
                  onClick={deselectAll}
                  className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                >
                  Deselect All
                </button>
              </div>
            </div>

            {/* Mobile Card View */}
            <div className="sm:hidden space-y-3">
              {excelData.map((item) => (
                <div key={item.id} className="border rounded-lg p-4 bg-gray-50">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        checked={selectedItems.has(item.id)}
                        onChange={() => toggleSelection(item.id)}
                        className="rounded border-gray-300 mr-3"
                      />
                      <div>
                        <div className="font-medium text-sm">{item.title}</div>
                        <div className="text-xs text-gray-500">SKU: {item.sku}</div>
                        {item.asin && (
                          <div className="text-xs text-gray-500">ASIN: {item.asin}</div>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-gray-500">Qty:</span> {item.quantity}
                    </div>
                    <div>
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        item.condition === 'New'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-yellow-100 text-yellow-800'
                      }`}>
                        {item.condition}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500">Original:</span> ${item.originalPrice}
                    </div>
                    <div className="font-semibold text-green-600">
                      <span className="text-gray-500">eBay:</span> ${calculateEbayPrice(item.originalPrice, item.condition)}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop Table View */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      Select
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      SKU/ASIN
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      Product
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      Qty
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      Condition
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      Original Price
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      Suggested eBay Price
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {excelData.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2">
                        <input
                          type="checkbox"
                          checked={selectedItems.has(item.id)}
                          onChange={() => toggleSelection(item.id)}
                          className="rounded border-gray-300"
                        />
                      </td>
                      <td className="px-4 py-2 text-sm">
                        <div>{item.sku}</div>
                        {item.asin && (
                          <div className="text-xs text-gray-500">{item.asin}</div>
                        )}
                      </td>
                      <td className="px-4 py-2 text-sm max-w-xs truncate">
                        {item.title}
                      </td>
                      <td className="px-4 py-2 text-sm">{item.quantity}</td>
                      <td className="px-4 py-2 text-sm">
                        <span className={`px-2 py-1 text-xs rounded-full ${
                          item.condition === 'New'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-yellow-100 text-yellow-800'
                        }`}>
                          {item.condition}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-sm">${item.originalPrice}</td>
                      <td className="px-4 py-2 text-sm font-semibold text-green-600">
                        ${calculateEbayPrice(item.originalPrice, item.condition)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-6 flex flex-col sm:flex-row sm:justify-between gap-3">
              <button
                onClick={() => setStep(1)}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 w-full sm:w-auto"
              >
                Back
              </button>
              <button
                onClick={processForEbay}
                disabled={selectedItems.size === 0 || processing}
                className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 w-full sm:w-auto"
              >
                {processing ? 'Processing...' : `Process ${selectedItems.size} Items`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step 3: Create Listings */}
      {step === 3 && (
        <div className="bg-white rounded-lg shadow">
          <div className="p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">
              Review eBay Listings ({processedData.length} items)
            </h2>

            <div className="space-y-4 max-h-96 overflow-y-auto">
              {processedData.map((item) => (
                <div key={item.id} className="border rounded-lg p-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <h3 className="font-medium text-gray-900">{item.listingTitle}</h3>
                      <p className="text-sm text-gray-500 mt-1">SKU: {item.sku}</p>
                      <p className="text-sm text-gray-500">Category: {item.ebayCategory}</p>
                    </div>
                    <div className="sm:text-right">
                      <p className="text-2xl font-bold text-green-600">${item.suggestedPrice}</p>
                      <p className="text-sm text-gray-500">Quantity: {item.quantity}</p>
                      <p className="text-sm text-gray-500">Condition: {item.condition}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 flex flex-col sm:flex-row sm:justify-between gap-3">
              <button
                onClick={() => setStep(2)}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 w-full sm:w-auto"
              >
                Back
              </button>
              <button
                onClick={() => createListingsMutation.mutate(processedData)}
                disabled={createListingsMutation.isLoading}
                className="px-6 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 w-full sm:w-auto"
              >
                {createListingsMutation.isLoading
                  ? 'Creating Listings...'
                  : `Create ${processedData.length} eBay Listings`
                }
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
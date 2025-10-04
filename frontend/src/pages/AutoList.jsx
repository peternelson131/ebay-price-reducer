import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import * as XLSX from 'xlsx'
import { useMutation } from '@tanstack/react-query'
import { listingsAPI, supabase } from '../lib/supabase'

export default function AutoList() {
  const [excelData, setExcelData] = useState([])
  const [processedData, setProcessedData] = useState([])
  const [selectedItems, setSelectedItems] = useState(new Set())
  const [processing, setProcessing] = useState(false)
  const [inputMethod, setInputMethod] = useState(null) // 'file', 'manual', 'sheets'
  const [step, setStep] = useState(1) // 1: Select Method, 2: Input Data, 3: Review, 4: Create Listings
  const [notification, setNotification] = useState(null)
  const [manualAsins, setManualAsins] = useState('')
  const [loadingAsins, setLoadingAsins] = useState(false)
  const [sheetsUrl, setSheetsUrl] = useState('')
  const [loadingSheets, setLoadingSheets] = useState(false)

  const showNotification = (type, message) => {
    setNotification({ type, message })
    setTimeout(() => setNotification(null), 5000)
  }

  // Process manual ASINs using Keepa API
  const processManualAsins = async () => {
    setLoadingAsins(true)

    try {
      // Parse ASINs from textarea
      const asinList = manualAsins
        .split('\n')
        .map(asin => asin.trim())
        .filter(asin => asin && asin.length === 10) // Valid Amazon ASINs are 10 characters

      if (asinList.length === 0) {
        showNotification('error', 'Please enter at least one valid ASIN')
        setLoadingAsins(false)
        return
      }

      showNotification('info', `Processing ${asinList.length} ASINs...`)

      // Get auth token for API calls
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        showNotification('error', 'Please log in to use this feature')
        setLoadingAsins(false)
        return
      }

      // Fetch product data from Keepa API for each ASIN
      const keepaPromises = asinList.map(async (asin, index) => {
        try {
          // Call our Netlify function to get Keepa data with authentication
          const response = await fetch(`/.netlify/functions/keepa-api?action=product&asin=${asin}`, {
            headers: {
              'Authorization': `Bearer ${session.access_token}`
            }
          })

          if (!response.ok) {
            throw new Error(`Failed to fetch data for ASIN ${asin}`)
          }

          const data = await response.json()

          if (!data.success) {
            throw new Error(data.message || `No data found for ASIN ${asin}`)
          }

          const product = data.product

          // Extract price from Keepa stats.current array
          // Index 1 = Amazon price, Index 4 = Buy Box price (prices in cents)
          let currentPrice = 0
          if (product.stats?.current) {
            // Try Buy Box price first (index 4), then Amazon price (index 1)
            const buyBoxPrice = product.stats.current[4]
            const amazonPrice = product.stats.current[1]

            if (buyBoxPrice && buyBoxPrice > 0) {
              currentPrice = buyBoxPrice / 100 // Convert cents to dollars
            } else if (amazonPrice && amazonPrice > 0) {
              currentPrice = amazonPrice / 100 // Convert cents to dollars
            }
          }

          return {
            id: `asin-${index}`,
            asin: asin,
            sku: asin, // Use ASIN as SKU for manual entries
            fnsku: '',
            title: product.title || `Product ${asin}`,
            quantity: 1, // Default quantity
            condition: 'New', // Default condition
            originalPrice: currentPrice,
            suggestedPrice: null,
            category: product.categoryTree?.[0]?.name || 'Unknown',
            brand: product.brand || '',
            imageUrl: product.imagesCSV?.split(',')[0] || ''
          }
        } catch (error) {
          console.error(`Error processing ASIN ${asin}:`, error)
          // Return partial data even if Keepa fails
          return {
            id: `asin-${index}`,
            asin: asin,
            sku: asin,
            fnsku: '',
            title: `Product ${asin} (Data unavailable)`,
            quantity: 1,
            condition: 'New',
            originalPrice: 0,
            suggestedPrice: null,
            category: 'Unknown',
            brand: '',
            imageUrl: '',
            error: error.message
          }
        }
      })

      const results = await Promise.all(keepaPromises)

      // Filter out completely failed entries
      const validResults = results.filter(item => item.asin)

      if (validResults.length === 0) {
        showNotification('error', 'Failed to process any ASINs. Please check your Keepa API connection.')
        setLoadingAsins(false)
        return
      }

      const failedCount = asinList.length - validResults.length
      if (failedCount > 0) {
        showNotification('warning', `Processed ${validResults.length} ASINs successfully. ${failedCount} failed.`)
      } else {
        showNotification('success', `Successfully processed ${validResults.length} ASINs`)
      }

      setExcelData(validResults)
      setStep(3) // Move to review step

    } catch (error) {
      console.error('Error processing manual ASINs:', error)
      showNotification('error', `Failed to process ASINs: ${error.message}`)
    }

    setLoadingAsins(false)
  }

  // Process Google Sheets data
  const processGoogleSheets = async () => {
    setLoadingSheets(true)

    try {
      if (!sheetsUrl.trim()) {
        showNotification('error', 'Please enter a Google Sheets URL')
        setLoadingSheets(false)
        return
      }

      // Convert Google Sheets URL to CSV export URL
      let csvUrl = sheetsUrl
      if (sheetsUrl.includes('docs.google.com/spreadsheets')) {
        // Extract the sheet ID from the URL
        const match = sheetsUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
        if (match) {
          const sheetId = match[1]
          csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`
        } else {
          throw new Error('Invalid Google Sheets URL format')
        }
      }

      showNotification('info', 'Connecting to Google Sheets...')

      // Fetch the CSV data
      const response = await fetch(csvUrl)

      if (!response.ok) {
        throw new Error(`Failed to fetch Google Sheets data: ${response.status} ${response.statusText}`)
      }

      const csvText = await response.text()

      // Parse CSV data
      const lines = csvText.split('\n').filter(line => line.trim())
      if (lines.length < 2) {
        throw new Error('Google Sheet appears to be empty or has no data rows')
      }

      const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim().toLowerCase())
      const dataRows = lines.slice(1)

      showNotification('info', `Processing ${dataRows.length} rows from Google Sheets...`)

      // Process each row
      const processed = dataRows.map((row, index) => {
        const values = row.split(',').map(v => v.replace(/"/g, '').trim())
        const rowData = {}

        headers.forEach((header, i) => {
          rowData[header] = values[i] || ''
        })

        return {
          id: `sheets-${index}`,
          asin: rowData['asin'] || rowData['amazon asin'] || '',
          sku: rowData['sku'] || rowData['merchant sku'] || rowData['asin'] || '',
          fnsku: rowData['fnsku'] || '',
          title: rowData['product name'] || rowData['title'] || rowData['product'] || '',
          quantity: parseInt(rowData['quantity'] || rowData['qty'] || 1),
          condition: rowData['condition'] || 'New',
          originalPrice: parseFloat(rowData['price'] || rowData['your price'] || 0),
          suggestedPrice: null,
          category: rowData['category'] || rowData['product category'] || '',
          brand: rowData['brand'] || '',
          imageUrl: rowData['image url'] || rowData['main image'] || ''
        }
      }).filter(item => item.asin || item.sku) // Filter out empty rows

      if (processed.length === 0) {
        throw new Error('No valid product data found in Google Sheets. Please check your column headers.')
      }

      const skippedRows = dataRows.length - processed.length
      if (skippedRows > 0) {
        showNotification('warning', `Processed ${processed.length} rows successfully. ${skippedRows} rows skipped due to missing ASIN/SKU.`)
      } else {
        showNotification('success', `Successfully imported ${processed.length} products from Google Sheets`)
      }

      setExcelData(processed)
      setStep(3) // Move to review step

    } catch (error) {
      console.error('Error processing Google Sheets:', error)
      showNotification('error', `Failed to process Google Sheets: ${error.message}`)
    }

    setLoadingSheets(false)
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
        setStep(3)
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
    setStep(4)
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
        listings.map(listing => {
          // Prepare image URLs
          const images = listing.imageUrl
            ? listing.imageUrl.split(',').map(img =>
                img.startsWith('http') ? img : `https://images-na.ssl-images-amazon.com/images/I/${img.trim()}`
              )
            : []

          // Prepare aspects with brand if available
          const aspects = {}
          if (listing.brand) {
            aspects['Brand'] = [listing.brand]
          }

          return listingsAPI.createListing({
            title: listing.listingTitle,
            description: listing.listingDescription,
            price: listing.suggestedPrice,
            quantity: listing.quantity,
            sku: listing.sku,
            categoryId: listing.ebayCategory,
            condition: listing.condition,
            images: images,
            aspects: aspects
          })
        })
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
        <h1 className="text-2xl font-bold text-gray-900">Auto-List</h1>
        <p className="text-gray-600 mt-2">
          Create eBay listings automatically using file uploads, manual ASIN entry, or Google Sheets integration
        </p>
      </div>

      {/* Progress Steps */}
      <div className="bg-white rounded-lg shadow p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row items-center sm:justify-between gap-4">
          {[
            { num: 1, label: 'Select Method' },
            { num: 2, label: 'Input Data' },
            { num: 3, label: 'Review & Select' },
            { num: 4, label: 'Create Listings' }
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
              {idx < 3 && (
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

      {/* Step 1: Select Input Method */}
      {step === 1 && (
        <div className="bg-white rounded-lg shadow">
          <div className="p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-6">
              Choose Your Input Method
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

              {/* File Upload Option */}
              <div
                onClick={() => {
                  setInputMethod('file')
                  setStep(2)
                }}
                className="border-2 border-gray-200 rounded-lg p-6 hover:border-blue-500 hover:bg-blue-50 cursor-pointer transition-colors"
              >
                <div className="text-center">
                  <svg className="mx-auto h-12 w-12 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  <h3 className="text-lg font-medium text-gray-900 mt-4">File Upload</h3>
                  <p className="text-sm text-gray-500 mt-2">
                    Upload Excel/CSV files with product data
                  </p>
                  <div className="mt-4 text-xs text-gray-400">
                    • Amazon removal orders
                    • Custom product lists
                    • Inventory exports
                  </div>
                </div>
              </div>

              {/* Manual ASIN Entry Option */}
              <div
                onClick={() => {
                  setInputMethod('manual')
                  setStep(2)
                }}
                className="border-2 border-gray-200 rounded-lg p-6 hover:border-green-500 hover:bg-green-50 cursor-pointer transition-colors"
              >
                <div className="text-center">
                  <svg className="mx-auto h-12 w-12 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  <h3 className="text-lg font-medium text-gray-900 mt-4">Manual Entry</h3>
                  <p className="text-sm text-gray-500 mt-2">
                    Enter ASINs manually for quick listing
                  </p>
                  <div className="mt-4 text-xs text-gray-400">
                    • Single or batch ASIN entry
                    • Keepa data lookup
                    • Immediate processing
                  </div>
                </div>
              </div>

              {/* Google Sheets Option */}
              <div
                onClick={() => {
                  setInputMethod('sheets')
                  setStep(2)
                }}
                className="border-2 border-gray-200 rounded-lg p-6 hover:border-purple-500 hover:bg-purple-50 cursor-pointer transition-colors"
              >
                <div className="text-center">
                  <svg className="mx-auto h-12 w-12 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                  <h3 className="text-lg font-medium text-gray-900 mt-4">Google Sheets</h3>
                  <p className="text-sm text-gray-500 mt-2">
                    Connect to your Google Sheets
                  </p>
                  <div className="mt-4 text-xs text-gray-400">
                    • Live sync with sheets
                    • Collaborative editing
                    • Real-time updates
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* Step 2: Input Data */}
      {step === 2 && (
        <div className="bg-white rounded-lg shadow">
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-medium text-gray-900">
                {inputMethod === 'file' && 'Upload File'}
                {inputMethod === 'manual' && 'Enter ASINs Manually'}
                {inputMethod === 'sheets' && 'Connect Google Sheets'}
              </h2>
              <button
                onClick={() => {
                  setStep(1)
                  setInputMethod(null)
                }}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                ← Change Method
              </button>
            </div>

            {/* File Upload Interface */}
            {inputMethod === 'file' && (
              <>
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
              </>
            )}

            {/* Manual ASIN Entry Interface */}
            {inputMethod === 'manual' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Enter ASINs (one per line)
                  </label>
                  <textarea
                    rows={8}
                    value={manualAsins}
                    onChange={(e) => setManualAsins(e.target.value)}
                    className="w-full border border-gray-300 rounded-md p-3 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="B0123456789
B0987654321
B0555666777

Enter multiple ASINs, one per line"
                  />
                </div>
                <div className="bg-blue-50 p-4 rounded-md">
                  <h4 className="text-sm font-medium text-blue-900 mb-2">How it works:</h4>
                  <ul className="text-sm text-blue-800 space-y-1">
                    <li>• Enter Amazon ASINs (10-character product IDs)</li>
                    <li>• Product data will be fetched from Keepa API</li>
                    <li>• Pricing will be calculated automatically</li>
                    <li>• eBay categories will be determined via taxonomy</li>
                  </ul>
                </div>
                <button
                  className="w-full bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700 disabled:opacity-50 transition-colors"
                  onClick={processManualAsins}
                  disabled={loadingAsins || !manualAsins.trim()}
                >
                  {loadingAsins ? 'Processing ASINs...' : 'Process ASINs'}
                </button>
              </div>
            )}

            {/* Google Sheets Interface */}
            {inputMethod === 'sheets' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Google Sheets URL
                  </label>
                  <input
                    type="url"
                    value={sheetsUrl}
                    onChange={(e) => setSheetsUrl(e.target.value)}
                    className="w-full border border-gray-300 rounded-md p-3 focus:ring-purple-500 focus:border-purple-500"
                    placeholder="https://docs.google.com/spreadsheets/d/..."
                  />
                </div>
                <div className="bg-purple-50 p-4 rounded-md">
                  <h4 className="text-sm font-medium text-purple-900 mb-2">Setup Instructions:</h4>
                  <ol className="text-sm text-purple-800 space-y-1 list-decimal list-inside">
                    <li>Make your Google Sheet publicly viewable</li>
                    <li>Ensure column headers match our expected format</li>
                    <li>Paste the shareable link above</li>
                    <li>Click "Connect Sheet" to import data</li>
                  </ol>
                </div>
                <div className="bg-amber-50 p-4 rounded-md">
                  <h4 className="text-sm font-medium text-amber-900 mb-2">Expected Columns:</h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-amber-800">
                    <div>• ASIN</div>
                    <div>• SKU</div>
                    <div>• Product Name</div>
                    <div>• Quantity</div>
                    <div>• Condition</div>
                    <div>• Price</div>
                  </div>
                </div>
                <button
                  className="w-full bg-purple-600 text-white py-2 px-4 rounded-md hover:bg-purple-700 disabled:opacity-50 transition-colors"
                  onClick={processGoogleSheets}
                  disabled={loadingSheets || !sheetsUrl.trim()}
                >
                  {loadingSheets ? 'Connecting...' : 'Connect Sheet'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Step 3: Review & Select */}
      {step === 3 && (
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
                onClick={() => setStep(2)}
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

      {/* Step 4: Create Listings */}
      {step === 4 && (
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
                onClick={() => setStep(3)}
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
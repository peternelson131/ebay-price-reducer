import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import * as XLSX from 'xlsx'
import { useMutation } from '@tanstack/react-query'
import { listingsAPI, supabase } from '../lib/supabase'
import { AlertTriangle, CheckCircle, XCircle } from 'lucide-react'

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
  const [editablePrices, setEditablePrices] = useState({}) // Track edited prices by item ID
  const [editableTitles, setEditableTitles] = useState({}) // Track edited titles by item ID
  const [editableQuantities, setEditableQuantities] = useState({}) // Track edited quantities by item ID
  const [editableConditions, setEditableConditions] = useState({}) // Track edited conditions by item ID
  const [creationResults, setCreationResults] = useState(null) // Track success/failure for each listing

  // eBay acceptable condition values
  const ebayConditions = [
    { value: 'NEW', label: 'Brand New' },
    { value: 'NEW_OTHER', label: 'New - Open Box' },
    { value: 'NEW_WITH_DEFECTS', label: 'New with Defects' },
    { value: 'MANUFACTURER_REFURBISHED', label: 'Manufacturer Refurbished' },
    { value: 'CERTIFIED_REFURBISHED', label: 'Certified Refurbished' },
    { value: 'SELLER_REFURBISHED', label: 'Seller Refurbished' },
    { value: 'USED_EXCELLENT', label: 'Used - Excellent' },
    { value: 'USED_VERY_GOOD', label: 'Used - Very Good' },
    { value: 'USED_GOOD', label: 'Used - Good' },
    { value: 'USED_ACCEPTABLE', label: 'Used - Acceptable' },
    { value: 'FOR_PARTS_OR_NOT_WORKING', label: 'For Parts or Not Working' }
  ]

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
          // Call keepa-fetch-product endpoint for enhanced field mapping
          const response = await fetch(`/.netlify/functions/keepa-fetch-product`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ asin })
          })

          if (!response.ok) {
            throw new Error(`Failed to fetch data for ASIN ${asin}`)
          }

          const data = await response.json()

          if (!data.success) {
            throw new Error(data.message || `No data found for ASIN ${asin}`)
          }

          const product = data.keepaData
          const ebayDraft = data.ebayDraft // This has all enhanced aspects!

          // DEBUG: Log what we received from Keepa
          console.log('🔍 KEEPA FETCH RESPONSE:', {
            asin: asin,
            hasEbayDraft: !!ebayDraft,
            ebayDraftKeys: ebayDraft ? Object.keys(ebayDraft) : [],
            hasImages: !!ebayDraft?.images,
            imagesCount: ebayDraft?.images?.length || 0,
            images: ebayDraft?.images || [],
            firstImage: ebayDraft?.images?.[0],
            descriptionLength: ebayDraft?.description?.length || 0,
            hasKeepaDataImages: !!product.images,
            keepaImagesCount: product.images?.length || 0
          })

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
            // sku will be auto-generated by backend with user's prefix
            fnsku: '',
            title: product.title || `Product ${asin}`,
            quantity: 1, // Default quantity
            condition: 'NEW', // Default: Brand New
            originalPrice: currentPrice,
            suggestedPrice: null,
            category: product.categoryTree?.[0]?.name || 'Unknown',
            brand: product.brand || '',
            imageUrl: product.imagesCSV?.split(',')[0] || '', // For display only
            ebayDraft: ebayDraft // Include the enhanced eBay draft with all aspects, description, and ALL images
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
            condition: 'NEW', // Default: Brand New
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
          condition: rowData['condition'] || 'NEW', // Default: Brand New
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
          condition: row['Condition'] || row['condition'] || 'NEW', // Default: Brand New
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
    // Note: We don't set ebayCategory here - let the backend determine it from title via eBay Taxonomy API
    const ebayListings = itemsToProcess.map(item => ({
      ...item,
      suggestedPrice: calculateEbayPrice(item.originalPrice, item.condition),
      listingTitle: createEbayTitle(item),
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
    let title = item.title

    // ❌ REMOVED: Do not prepend brand name to title
    // Brand is already in the title from Keepa or will be in aspects

    // Don't add condition suffix for NEW_OTHER as it's the default
    if (item.condition && item.condition !== 'NEW_OTHER' && item.condition !== 'New') {
      title += ` - ${item.condition}`
    }

    // Trim to 80 chars without cutting words
    if (title.length > 80) {
      title = title.substring(0, 80)
      // Find the last space before the 80-char limit
      const lastSpace = title.lastIndexOf(' ')
      if (lastSpace > 60) { // Only trim at word boundary if we don't lose too much
        title = title.substring(0, lastSpace)
      }
    }

    return title
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

  // Create eBay listings with detailed tracking
  const createListingsMutation = useMutation(
    async (listings) => {
      const results = []

      // Process listings sequentially to track individual success/failure
      for (const listing of listings) {
        try {
          // Use edited values if available, otherwise use defaults
          const price = editablePrices[listing.id] || listing.suggestedPrice
          const title = editableTitles[listing.id] || listing.listingTitle
          const quantity = editableQuantities[listing.id] || listing.quantity
          const condition = editableConditions[listing.id] || 'NEW_OTHER' // Default to New - Open Box

          // Use ALL images from ebayDraft if available, otherwise fallback to imageUrl
          const images = listing.ebayDraft?.images && listing.ebayDraft.images.length > 0
            ? listing.ebayDraft.images
            : (listing.imageUrl
                ? listing.imageUrl.split(',').map(img =>
                    img.startsWith('http') ? img : `https://images-na.ssl-images-amazon.com/images/I/${img.trim()}`
                  )
                : [])

          // Use full Keepa description from ebayDraft if available, otherwise use minimal description
          const description = listing.ebayDraft?.description || listing.listingDescription

          // Use enhanced aspects from ebayDraft if available, otherwise fallback to brand only
          const aspects = listing.ebayDraft?.aspects || {}
          if (!aspects.Brand && listing.brand) {
            aspects['Brand'] = [listing.brand]
          }

          // Debug logging
          console.log('📦 Creating listing with data:', {
            asin: listing.asin,
            sku: listing.sku,
            title: title,
            quantity: quantity,
            condition: condition,
            price: price,
            hasEbayDraft: !!listing.ebayDraft,
            imageCount: images.length,
            images: images,
            descriptionLength: description?.length || 0,
            aspectsKeys: Object.keys(aspects)
          })

          const result = await listingsAPI.createListing({
            asin: listing.asin, // ✅ Pass ASIN for SKU generation
            title: title, // ✅ Use edited title
            description: description, // ✅ Use full Keepa description
            price: price, // ✅ Use edited price
            quantity: quantity, // ✅ Use edited quantity
            // sku: Let backend generate with user's prefix settings
            condition: condition, // ✅ Use edited condition
            images: images, // ✅ Use ALL images from Keepa
            aspects: aspects // Includes all enhanced aspects from Keepa
          })

          results.push({
            id: listing.id,
            sku: listing.sku,
            title: listing.listingTitle,
            success: true,
            result: result
          })
        } catch (error) {
          results.push({
            id: listing.id,
            sku: listing.sku,
            title: listing.listingTitle,
            success: false,
            error: error.message || 'Unknown error'
          })
        }
      }

      return results
    },
    {
      onSuccess: (results) => {
        const successful = results.filter(r => r.success).length
        const failed = results.filter(r => !r.success).length

        setCreationResults(results)

        if (failed === 0) {
          showNotification('success', `Successfully created all ${successful} eBay listings!`)
        } else {
          showNotification('warning', `Created ${successful} listings, ${failed} failed. See details below.`)
        }
      },
      onError: (error) => {
        showNotification('error', `Failed to create listings: ${error.message}`)
      }
    }
  )

  // Update price for a specific item
  const handlePriceChange = (itemId, newPrice) => {
    setEditablePrices(prev => ({
      ...prev,
      [itemId]: parseFloat(newPrice)
    }))
  }

  // Update title for a specific item
  const handleTitleChange = (itemId, newTitle) => {
    setEditableTitles(prev => ({
      ...prev,
      [itemId]: newTitle
    }))
  }

  // Update quantity for a specific item
  const handleQuantityChange = (itemId, newQuantity) => {
    setEditableQuantities(prev => ({
      ...prev,
      [itemId]: parseInt(newQuantity, 10)
    }))
  }

  // Update condition for a specific item
  const handleConditionChange = (itemId, newCondition) => {
    setEditableConditions(prev => ({
      ...prev,
      [itemId]: newCondition
    }))
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-theme-primary">Auto-List</h1>
        <p className="text-theme-secondary mt-2">
          Create eBay listings automatically using file uploads, manual ASIN entry, or Google Sheets integration
        </p>
      </div>

      {/* Progress Steps */}
      <div className="bg-theme-surface rounded-lg border border-theme p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row items-center sm:justify-between gap-4">
          {[
            { num: 1, label: 'Select Method' },
            { num: 2, label: 'Input Data' },
            { num: 3, label: 'Review & Select' },
            { num: 4, label: 'Create Listings' }
          ].map((s, idx) => (
            <div key={s.num} className="flex items-center w-full sm:w-auto">
              <div className={`flex items-center justify-center w-10 h-10 rounded-full flex-shrink-0 ${
                step >= s.num ? 'bg-accent text-white' : 'bg-gray-200 dark:bg-gray-700 text-theme-secondary'
              }`}>
                {step > s.num ? '✓' : s.num}
              </div>
              <div className={`ml-3 text-sm sm:text-base ${step >= s.num ? 'text-theme-primary' : 'text-theme-tertiary'}`}>
                {s.label}
              </div>
              {idx < 3 && (
                <div className={`ml-4 w-full sm:w-20 h-1 hidden sm:block ${
                  step > s.num ? 'bg-accent' : 'bg-gray-200 dark:bg-gray-700'
                }`} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Notification */}
      {notification && (
        <div className={`rounded-lg p-3 ${
          notification.type === 'success'
            ? 'bg-success/10 border border-success/30 text-success'
            : 'bg-error/10 border border-error/30 text-error'
        }`}>
          {notification.message}
        </div>
      )}

      {/* Step 1: Select Input Method */}
      {step === 1 && (
        <div className="bg-theme-surface rounded-lg border border-theme">
          <div className="p-6">
            <h2 className="text-lg font-medium text-theme-primary mb-6">
              Choose Your Input Method
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

              {/* File Upload Option */}
              <div
                onClick={() => {
                  setInputMethod('file')
                  setStep(2)
                }}
                className="border-2 border-theme rounded-lg p-6 hover:border-orange-500 hover:bg-accent/10 cursor-pointer transition-colors"
              >
                <div className="text-center">
                  <svg className="mx-auto h-12 w-12 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  <h3 className="text-lg font-medium text-theme-primary mt-4">File Upload</h3>
                  <p className="text-sm text-theme-tertiary mt-2">
                    Upload Excel/CSV files with product data
                  </p>
                  <div className="mt-4 text-xs text-theme-tertiary">
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
                className="border-2 border-theme rounded-lg p-6 hover:border-green-500 hover:bg-success/10 cursor-pointer transition-colors"
              >
                <div className="text-center">
                  <svg className="mx-auto h-12 w-12 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  <h3 className="text-lg font-medium text-theme-primary mt-4">Manual Entry</h3>
                  <p className="text-sm text-theme-tertiary mt-2">
                    Enter ASINs manually for quick listing
                  </p>
                  <div className="mt-4 text-xs text-theme-tertiary">
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
                className="border-2 border-theme rounded-lg p-6 hover:border-purple-500 hover:bg-purple-50 cursor-pointer transition-colors"
              >
                <div className="text-center">
                  <svg className="mx-auto h-12 w-12 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                  <h3 className="text-lg font-medium text-theme-primary mt-4">Google Sheets</h3>
                  <p className="text-sm text-theme-tertiary mt-2">
                    Connect to your Google Sheets
                  </p>
                  <div className="mt-4 text-xs text-theme-tertiary">
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
        <div className="bg-theme-surface rounded-lg border border-theme">
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-medium text-theme-primary">
                {inputMethod === 'file' && 'Upload File'}
                {inputMethod === 'manual' && 'Enter ASINs Manually'}
                {inputMethod === 'sheets' && 'Connect Google Sheets'}
              </h2>
              <button
                onClick={() => {
                  setStep(1)
                  setInputMethod(null)
                }}
                className="text-sm text-theme-tertiary hover:text-theme-secondary"
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
                    isDragActive ? 'border-orange-500 bg-accent/10' : 'border-theme hover:border-gray-400'
                  }`}
                >
                  <input {...getInputProps()} />
                  <svg className="mx-auto h-12 w-12 text-theme-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  <p className="mt-2 text-sm text-theme-secondary">
                    {isDragActive
                      ? 'Drop your Excel file here...'
                      : 'Drag and drop your Excel file here, or click to browse'
                    }
                  </p>
                  <p className="mt-1 text-xs text-theme-tertiary">
                    Supports .xls, .xlsx, and .csv files
                  </p>
                </div>

                <div className="mt-6 border-t pt-6">
                  <h3 className="text-sm font-medium text-theme-primary mb-2">
                    Expected Excel Columns:
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-theme-secondary">
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
                  <label className="block text-sm font-medium text-theme-secondary mb-2">
                    Enter ASINs (one per line)
                  </label>
                  <textarea
                    rows={8}
                    value={manualAsins}
                    onChange={(e) => setManualAsins(e.target.value)}
                    className="w-full border border-theme rounded-lg p-3 focus:ring-orange-500 focus:border-orange-500"
                    placeholder="B0123456789
B0987654321
B0555666777

Enter multiple ASINs, one per line"
                  />
                </div>
                <div className="bg-accent/10 p-4 rounded-lg">
                  <h4 className="text-sm font-medium text-blue-900 mb-2">How it works:</h4>
                  <ul className="text-sm text-accent space-y-1">
                    <li>• Enter Amazon ASINs (10-character product IDs)</li>
                    <li>• Product data will be fetched from Keepa API</li>
                    <li>• Pricing will be calculated automatically</li>
                    <li>• eBay categories will be determined via taxonomy</li>
                  </ul>
                </div>
                <button
                  className="w-full bg-green-600 text-white py-2 px-4 rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
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
                  <label className="block text-sm font-medium text-theme-secondary mb-2">
                    Google Sheets URL
                  </label>
                  <input
                    type="url"
                    value={sheetsUrl}
                    onChange={(e) => setSheetsUrl(e.target.value)}
                    className="w-full border border-theme rounded-lg p-3 focus:ring-purple-500 focus:border-purple-500"
                    placeholder="https://docs.google.com/spreadsheets/d/..."
                  />
                </div>
                <div className="bg-purple-50 p-4 rounded-lg">
                  <h4 className="text-sm font-medium text-purple-900 mb-2">Setup Instructions:</h4>
                  <ol className="text-sm text-purple-800 space-y-1 list-decimal list-inside">
                    <li>Make your Google Sheet publicly viewable</li>
                    <li>Ensure column headers match our expected format</li>
                    <li>Paste the shareable link above</li>
                    <li>Click "Connect Sheet" to import data</li>
                  </ol>
                </div>
                <div className="bg-amber-50 p-4 rounded-lg">
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
                  className="w-full bg-purple-600 text-white py-2 px-4 rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors"
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
        <div className="bg-theme-surface rounded-lg border border-theme">
          <div className="p-6">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-4">
              <h2 className="text-lg font-medium text-theme-primary">
                Review Items ({excelData.length} total, {selectedItems.size} selected)
              </h2>
              <div className="flex gap-2">
                <button
                  onClick={selectAll}
                  className="px-3 py-1 text-sm bg-theme-hover text-theme-secondary rounded hover:bg-gray-200 dark:bg-gray-700"
                >
                  Select All
                </button>
                <button
                  onClick={deselectAll}
                  className="px-3 py-1 text-sm bg-theme-hover text-theme-secondary rounded hover:bg-gray-200 dark:bg-gray-700"
                >
                  Deselect All
                </button>
              </div>
            </div>

            {/* Compact Card View with Images (All Devices) */}
            <div className="space-y-3 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 350px)' }}>
              {excelData.map((item) => {
                // Get primary image from Keepa
                const primaryImage = item.ebayDraft?.images?.[0] ||
                                    item.imageUrl?.split(',')[0] ||
                                    (item.imageUrl ? `https://images-na.ssl-images-amazon.com/images/I/${item.imageUrl.trim()}` : null);

                return (
                  <div key={item.id} className="border rounded-lg p-3 bg-theme-primary hover:bg-theme-hover transition-colors">
                    <div className="flex gap-3">
                      {/* Checkbox */}
                      <div className="flex-shrink-0 flex items-start pt-1">
                        <input
                          type="checkbox"
                          checked={selectedItems.has(item.id)}
                          onChange={() => toggleSelection(item.id)}
                          className="rounded border-theme w-4 h-4"
                        />
                      </div>

                      {/* Product Image */}
                      <div className="flex-shrink-0">
                        {primaryImage ? (
                          <img
                            src={primaryImage}
                            alt={item.title}
                            className="w-20 h-20 object-cover rounded border border-theme"
                            onError={(e) => {
                              e.target.style.display = 'none';
                            }}
                          />
                        ) : (
                          <div className="w-20 h-20 bg-gray-200 dark:bg-gray-700 rounded border border-theme flex items-center justify-center">
                            <span className="text-theme-tertiary text-xs">No image</span>
                          </div>
                        )}
                      </div>

                      {/* Product Details */}
                      <div className="flex-1 min-w-0">
                        {/* Title and SKU */}
                        <div className="mb-2">
                          <h3 className="font-medium text-sm text-theme-primary truncate" title={item.title}>
                            {item.title}
                          </h3>
                          <div className="flex gap-3 text-xs text-theme-tertiary mt-0.5">
                            <span>SKU: {item.sku}</span>
                            {item.asin && <span>ASIN: {item.asin}</span>}
                          </div>
                        </div>

                        {/* Product Info Grid */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
                          <div>
                            <span className="text-xs text-theme-tertiary">Qty:</span>{' '}
                            <span className="font-medium">{item.quantity}</span>
                          </div>
                          <div>
                            <span className={`px-2 py-0.5 text-xs rounded-full ${
                              item.condition === 'New' || item.condition === 'NEW'
                                ? 'bg-success/10 text-success'
                                : 'bg-yellow-100 text-yellow-800'
                            }`}>
                              {item.condition}
                            </span>
                          </div>
                          <div>
                            <span className="text-xs text-theme-tertiary">Original:</span>{' '}
                            <span className="font-medium">${item.originalPrice}</span>
                          </div>
                          <div>
                            <span className="text-xs text-theme-tertiary">eBay:</span>{' '}
                            {item.originalPrice > 0 ? (
                              <span className="text-success font-semibold">
                                ${calculateEbayPrice(item.originalPrice, item.condition)}
                              </span>
                            ) : (
                              <span className="text-amber-600 text-xs flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3" /> No price
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-6 flex flex-col sm:flex-row sm:justify-between gap-3">
              <button
                onClick={() => setStep(2)}
                className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-theme-secondary rounded hover:bg-gray-300 w-full sm:w-auto"
              >
                Back
              </button>
              <button
                onClick={processForEbay}
                disabled={selectedItems.size === 0 || processing}
                className="px-6 py-2 bg-accent text-white rounded hover:bg-accent-hover disabled:opacity-50 w-full sm:w-auto"
              >
                {processing ? 'Processing...' : `Process ${selectedItems.size} Items`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step 4: Create Listings */}
      {step === 4 && (
        <div className="bg-theme-surface rounded-lg border border-theme">
          <div className="p-6">
            <h2 className="text-lg font-medium text-theme-primary mb-4">
              Review eBay Listings ({processedData.length} items)
            </h2>

            {!creationResults && (
              <div className="space-y-3 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 300px)' }}>
                {processedData.map((item) => {
                  // Get primary image from Keepa
                  const primaryImage = item.ebayDraft?.images?.[0] ||
                                      item.imageUrl?.split(',')[0] ||
                                      (item.imageUrl ? `https://images-na.ssl-images-amazon.com/images/I/${item.imageUrl.trim()}` : null);

                  return (
                    <div key={item.id} className="border rounded-lg p-3 bg-theme-primary hover:bg-theme-hover transition-colors">
                      <div className="flex gap-3">
                        {/* Product Image */}
                        <div className="flex-shrink-0">
                          {primaryImage ? (
                            <img
                              src={primaryImage}
                              alt={item.title}
                              className="w-20 h-20 object-cover rounded border border-theme"
                              onError={(e) => {
                                e.target.style.display = 'none';
                              }}
                            />
                          ) : (
                            <div className="w-20 h-20 bg-gray-200 dark:bg-gray-700 rounded border border-theme flex items-center justify-center">
                              <span className="text-theme-tertiary text-xs">No image</span>
                            </div>
                          )}
                        </div>

                        {/* Listing Details - Compact Layout */}
                        <div className="flex-1 min-w-0">
                          {/* Row 1: Title */}
                          <div className="mb-2">
                            <input
                              type="text"
                              maxLength="80"
                              defaultValue={item.listingTitle}
                              onChange={(e) => handleTitleChange(item.id, e.target.value)}
                              className="w-full px-2 py-1 text-sm border border-theme rounded focus:ring-1 focus:ring-orange-500 focus:border-orange-500"
                              placeholder="Enter listing title"
                            />
                            <div className="flex justify-between items-center mt-0.5">
                              <span className="text-xs text-theme-tertiary">SKU: {item.sku}</span>
                              <span className="text-xs text-theme-tertiary">
                                {editableTitles[item.id]?.length || item.listingTitle.length}/80
                              </span>
                            </div>
                          </div>

                          {/* Row 2: Editable Fields - All in one line */}
                          <div className="grid grid-cols-4 gap-2">
                            {/* Quantity */}
                            <div>
                              <label className="block text-xs text-theme-secondary mb-0.5">Qty</label>
                              <input
                                type="number"
                                min="1"
                                max="10000"
                                defaultValue={item.quantity}
                                onChange={(e) => handleQuantityChange(item.id, e.target.value)}
                                className="w-full px-2 py-1 text-sm border border-theme rounded focus:ring-1 focus:ring-orange-500 focus:border-orange-500"
                              />
                            </div>

                            {/* Condition */}
                            <div className="col-span-2">
                              <label className="block text-xs text-theme-secondary mb-0.5">Condition</label>
                              <select
                                defaultValue="NEW_OTHER"
                                onChange={(e) => handleConditionChange(item.id, e.target.value)}
                                className="w-full px-2 py-1 text-sm border border-theme rounded focus:ring-1 focus:ring-orange-500 focus:border-orange-500"
                              >
                                {ebayConditions.map((condition) => (
                                  <option key={condition.value} value={condition.value}>
                                    {condition.label}
                                  </option>
                                ))}
                              </select>
                            </div>

                            {/* Price */}
                            <div>
                              <label className="block text-xs text-theme-secondary mb-0.5">Price</label>
                              <div className="relative">
                                <span className="absolute left-2 top-1/2 transform -translate-y-1/2 text-theme-tertiary text-sm">$</span>
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  defaultValue={item.suggestedPrice}
                                  onChange={(e) => handlePriceChange(item.id, e.target.value)}
                                  className="w-full pl-6 pr-2 py-1 text-sm border border-theme rounded focus:ring-1 focus:ring-orange-500 focus:border-orange-500"
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Creation Results */}
            {creationResults && (
              <div className="space-y-4 max-h-96 overflow-y-auto">
                <div className="bg-accent/10 border border-accent/30 rounded-lg p-4 mb-4">
                  <h3 className="font-medium text-blue-900 mb-2">Creation Summary</h3>
                  <p className="text-sm text-orange-700">
                    <span className="flex items-center gap-1"><CheckCircle className="w-4 h-4 text-success" /> Successful: {creationResults.filter(r => r.success).length} listings</span>
                    <span className="flex items-center gap-1"><XCircle className="w-4 h-4 text-error" /> Failed: {creationResults.filter(r => !r.success).length} listings</span>
                  </p>
                </div>

                {creationResults.map((result) => (
                  <div key={result.id} className={`border rounded-lg p-4 ${
                    result.success ? 'bg-success/10 border-success/30' : 'bg-error/10 border-error/30'
                  }`}>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          {result.success ? (
                            <span className="text-success font-bold">✓</span>
                          ) : (
                            <span className="text-error font-bold">✗</span>
                          )}
                          <h3 className={`font-medium ${result.success ? 'text-green-900' : 'text-red-900'}`}>
                            {result.title}
                          </h3>
                        </div>
                        <p className={`text-sm mt-1 ${result.success ? 'text-green-700' : 'text-red-700'}`}>
                          SKU: {result.sku}
                        </p>
                        {!result.success && (
                          <p className="text-sm text-red-700 mt-2 bg-error/10 p-2 rounded">
                            Error: {result.error}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-6 flex flex-col sm:flex-row sm:justify-between gap-3">
              {!creationResults ? (
                <>
                  <button
                    onClick={() => setStep(3)}
                    disabled={createListingsMutation.isLoading}
                    className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-theme-secondary rounded hover:bg-gray-300 disabled:opacity-50 w-full sm:w-auto"
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
                </>
              ) : (
                <button
                  onClick={() => {
                    setCreationResults(null)
                    setEditablePrices({})
                    setEditableTitles({})
                    setEditableQuantities({})
                    setEditableConditions({})
                    setExcelData([])
                    setProcessedData([])
                    setSelectedItems(new Set())
                    setStep(1)
                  }}
                  className="px-6 py-2 bg-accent text-white rounded hover:bg-accent-hover w-full sm:w-auto"
                >
                  Start Over
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
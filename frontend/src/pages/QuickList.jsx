import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

/**
 * Story 7A & 7B: Simplified Single-ASIN Listing Component
 * Story 10: Dynamic condition validation by category
 * Story 11: User-configurable Quick List settings
 * 
 * Simple UI for creating eBay listings from Amazon ASINs.
 * Users must configure settings before using the feature.
 */

// Progress steps for visual feedback
const STEPS = [
  { id: 'auth', label: 'Authenticating' },
  { id: 'keepa', label: 'Fetching product data' },
  { id: 'category', label: 'Detecting category' },
  { id: 'content', label: 'Generating optimized title' },
  { id: 'inventory', label: 'Creating inventory item' },
  { id: 'offer', label: 'Creating offer' },
  { id: 'publish', label: 'Publishing listing' }
]

// Default conditions (fallback if validation fails)
const DEFAULT_CONDITIONS = [
  { value: 'NEW', label: 'Brand New' },
  { value: 'NEW_OTHER', label: 'New (Open Box)' },
  { value: 'LIKE_NEW', label: 'Like New' },
  { value: 'VERY_GOOD', label: 'Very Good' },
  { value: 'GOOD', label: 'Good' },
  { value: 'ACCEPTABLE', label: 'Acceptable' },
  { value: 'USED', label: 'Used' }
]

// Tab components
const TAB_LIST = 'list'
const TAB_SETTINGS = 'settings'

export default function QuickList() {
  const [activeTab, setActiveTab] = useState(TAB_LIST)
  
  // Settings state
  const [settings, setSettings] = useState(null)
  const [isConfigured, setIsConfigured] = useState(false)
  const [locations, setLocations] = useState([])
  const [locationError, setLocationError] = useState(null)
  const [settingsLoading, setSettingsLoading] = useState(true)
  const [settingsSaving, setSettingsSaving] = useState(false)
  const [settingsError, setSettingsError] = useState(null)
  const [settingsSuccess, setSettingsSuccess] = useState(null)
  
  // Form state for settings
  const [formSettings, setFormSettings] = useState({
    fulfillment_policy_id: '',
    payment_policy_id: '',
    return_policy_id: '',
    merchant_location_key: '',
    sku_prefix: 'ql_',
    description_note: ''
  })
  
  // Listing form state
  const [asin, setAsin] = useState('')
  const [price, setPrice] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [condition, setCondition] = useState('NEW')
  
  // Product validation state (Story 10)
  const [productInfo, setProductInfo] = useState(null)
  const [validConditions, setValidConditions] = useState(DEFAULT_CONDITIONS)
  const [isValidating, setIsValidating] = useState(false)
  
  // UI state
  const [isLoading, setIsLoading] = useState(false)
  const [currentStep, setCurrentStep] = useState(null)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  // Validation
  const isValidAsin = /^B[0-9A-Z]{9}$/.test(asin)
  const isValidPrice = price && !isNaN(parseFloat(price)) && parseFloat(price) > 0
  const canSubmit = isValidAsin && isValidPrice && !isLoading && !isValidating && isConfigured

  // Load settings on mount
  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    setSettingsLoading(true)
    setSettingsError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const response = await fetch('/.netlify/functions/quick-list-settings', {
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      })

      const data = await response.json()
      
      if (data.success) {
        setSettings(data.settings)
        setIsConfigured(data.isConfigured)
        setLocations(data.locations || [])
        setLocationError(data.locationError || null)
        
        // Populate form with existing settings or defaults
        if (data.settings) {
          setFormSettings({
            fulfillment_policy_id: data.settings.fulfillment_policy_id || '',
            payment_policy_id: data.settings.payment_policy_id || '',
            return_policy_id: data.settings.return_policy_id || '',
            merchant_location_key: data.settings.merchant_location_key || '',
            sku_prefix: data.settings.sku_prefix || 'ql_',
            description_note: data.settings.description_note || ''
          })
        } else {
          // No settings yet - auto-select primary location if available
          if (data.primaryLocationKey) {
            setFormSettings(s => ({ ...s, merchant_location_key: data.primaryLocationKey }))
          }
        }
        
        // If not configured, switch to settings tab
        if (!data.isConfigured) {
          setActiveTab(TAB_SETTINGS)
        }
      }
    } catch (err) {
      console.error('Failed to load settings:', err)
      setSettingsError('Failed to load settings')
    } finally {
      setSettingsLoading(false)
    }
  }

  const saveSettings = async (e) => {
    e.preventDefault()
    setSettingsSaving(true)
    setSettingsError(null)
    setSettingsSuccess(null)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not authenticated')

      const response = await fetch('/.netlify/functions/quick-list-settings', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formSettings)
      })

      const data = await response.json()
      
      if (!response.ok) {
        throw new Error(data.error || data.message || 'Failed to save settings')
      }

      setSettings(data.settings)
      setIsConfigured(true)
      setSettingsSuccess('Settings saved successfully!')
      
      // Auto-switch to list tab after successful save
      setTimeout(() => {
        setActiveTab(TAB_LIST)
        setSettingsSuccess(null)
      }, 1500)

    } catch (err) {
      setSettingsError(err.message)
    } finally {
      setSettingsSaving(false)
    }
  }

  // Validate ASIN and get category info (Story 10)
  const validateAsin = useCallback(async (asinToValidate) => {
    if (!asinToValidate || !/^B[0-9A-Z]{9}$/.test(asinToValidate)) {
      setProductInfo(null)
      setValidConditions(DEFAULT_CONDITIONS)
      return
    }

    setIsValidating(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const response = await fetch('/.netlify/functions/validate-asin', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ asin: asinToValidate })
      })

      const data = await response.json()

      if (data.success) {
        setProductInfo({
          title: data.title,
          imageUrl: data.imageUrl,
          categoryId: data.categoryId,
          categoryName: data.categoryName
        })
        setValidConditions(data.validConditions || DEFAULT_CONDITIONS)
        // Reset condition to first valid option if current is invalid
        const validValues = (data.validConditions || DEFAULT_CONDITIONS).map(c => c.value)
        if (!validValues.includes(condition)) {
          setCondition(data.defaultCondition || validValues[0])
        }
      } else {
        setProductInfo(null)
        setValidConditions(DEFAULT_CONDITIONS)
      }
    } catch (err) {
      console.error('ASIN validation error:', err)
      setValidConditions(DEFAULT_CONDITIONS)
    } finally {
      setIsValidating(false)
    }
  }, [condition])

  // Debounced ASIN validation
  useEffect(() => {
    if (!isValidAsin) {
      setProductInfo(null)
      return
    }

    const timer = setTimeout(() => {
      validateAsin(asin)
    }, 500) // 500ms debounce

    return () => clearTimeout(timer)
  }, [asin, isValidAsin, validateAsin])

  // Simulate progress through steps (since backend doesn't stream updates)
  const simulateProgress = async () => {
    for (let i = 0; i < STEPS.length; i++) {
      setCurrentStep(i)
      // Variable delay to make it feel realistic
      const delay = STEPS[i].id === 'content' ? 2000 : 
                    STEPS[i].id === 'publish' ? 1500 : 800
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    setIsLoading(true)
    setError(null)
    setResult(null)
    setCurrentStep(0)

    try {
      // Get auth token
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        throw new Error('Please log in to create listings')
      }

      // Start progress simulation (runs in parallel with API call)
      const progressPromise = simulateProgress()

      // Call auto-list-single endpoint
      const response = await fetch('/.netlify/functions/auto-list-single', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          asin,
          price: parseFloat(price),
          quantity: parseInt(quantity),
          condition,
          publish: true
        })
      })

      const data = await response.json()

      // Wait for progress animation to finish
      await progressPromise

      if (!response.ok) {
        // Check if settings are required
        if (data.settingsRequired) {
          setActiveTab(TAB_SETTINGS)
          throw new Error('Please configure your Quick List settings first')
        }
        throw new Error(data.message || data.error || 'Failed to create listing')
      }

      setResult(data)
      setCurrentStep(STEPS.length) // All complete

    } catch (err) {
      console.error('Listing creation error:', err)
      setError(err.message)
      setCurrentStep(null)
    } finally {
      setIsLoading(false)
    }
  }

  const handleReset = () => {
    setAsin('')
    setPrice('')
    setQuantity(1)
    setCondition('NEW')
    setProductInfo(null)
    setValidConditions(DEFAULT_CONDITIONS)
    setResult(null)
    setError(null)
    setCurrentStep(null)
  }

  // Render settings tab content
  const renderSettingsTab = () => (
    <div className="space-y-6">
      {/* Settings Form */}
      <form onSubmit={saveSettings} className="space-y-6">
        {/* Info Box */}
        <div className="p-4 bg-accent/10 border border-accent/30 rounded-lg">
          <p className="text-sm text-theme-secondary">
            <strong>Where to find these IDs:</strong> Go to eBay Seller Hub → Account Settings → Business Policies. 
            Click on each policy to see its ID in the URL or policy details.
          </p>
        </div>

        {/* Business Policies Section */}
        <div className="space-y-4">
          <h3 className="font-medium text-theme-primary flex items-center gap-2">
            <span className="text-lg">📋</span> Business Policies
            <span className="text-xs text-error">*Required</span>
          </h3>
          
          {/* Fulfillment Policy */}
          <div>
            <label className="block text-sm font-medium text-theme-secondary mb-1">
              Shipping / Fulfillment Policy ID
            </label>
            <input
              type="text"
              value={formSettings.fulfillment_policy_id}
              onChange={(e) => setFormSettings(s => ({ ...s, fulfillment_policy_id: e.target.value.trim() }))}
              placeholder="e.g., 107540197026"
              className="w-full px-4 py-3 bg-theme-primary border border-theme rounded-lg focus:ring-2 focus:ring-accent focus:border-accent"
              required
            />
          </div>

          {/* Payment Policy */}
          <div>
            <label className="block text-sm font-medium text-theme-secondary mb-1">
              Payment Policy ID
            </label>
            <input
              type="text"
              value={formSettings.payment_policy_id}
              onChange={(e) => setFormSettings(s => ({ ...s, payment_policy_id: e.target.value.trim() }))}
              placeholder="e.g., 243561626026"
              className="w-full px-4 py-3 bg-theme-primary border border-theme rounded-lg focus:ring-2 focus:ring-accent focus:border-accent"
              required
            />
          </div>

          {/* Return Policy */}
          <div>
            <label className="block text-sm font-medium text-theme-secondary mb-1">
              Return Policy ID
            </label>
            <input
              type="text"
              value={formSettings.return_policy_id}
              onChange={(e) => setFormSettings(s => ({ ...s, return_policy_id: e.target.value.trim() }))}
              placeholder="e.g., 243561625026"
              className="w-full px-4 py-3 bg-theme-primary border border-theme rounded-lg focus:ring-2 focus:ring-accent focus:border-accent"
              required
            />
          </div>
        </div>

        {/* Location Section */}
        <div className="space-y-4">
          <h3 className="font-medium text-theme-primary flex items-center gap-2">
            <span className="text-lg">📍</span> Merchant Location
            <span className="text-xs text-error">*Required</span>
          </h3>
          
          {locationError ? (
            <div className="p-4 bg-error/10 border border-error/30 rounded-lg">
              <p className="text-sm text-error">
                Failed to load locations: {locationError}
              </p>
              <p className="text-xs text-theme-tertiary mt-2">
                You can still enter a location key manually below.
              </p>
              <input
                type="text"
                value={formSettings.merchant_location_key}
                onChange={(e) => setFormSettings(s => ({ ...s, merchant_location_key: e.target.value.trim() }))}
                placeholder="e.g., loc-94e1f3a0-6e1b-4d23-befc-750fe183"
                className="w-full mt-2 px-4 py-3 bg-theme-primary border border-theme rounded-lg focus:ring-2 focus:ring-accent focus:border-accent"
                required
              />
            </div>
          ) : locations.length === 0 ? (
            <div className="p-4 bg-warning/10 border border-warning/30 rounded-lg">
              <p className="text-sm text-warning">
                No merchant locations found. Please ensure your eBay account is connected and has at least one location configured.
              </p>
              <input
                type="text"
                value={formSettings.merchant_location_key}
                onChange={(e) => setFormSettings(s => ({ ...s, merchant_location_key: e.target.value.trim() }))}
                placeholder="Enter location key manually"
                className="w-full mt-2 px-4 py-3 bg-theme-primary border border-theme rounded-lg focus:ring-2 focus:ring-accent focus:border-accent"
                required
              />
            </div>
          ) : (
            <div>
              <select
                value={formSettings.merchant_location_key}
                onChange={(e) => setFormSettings(s => ({ ...s, merchant_location_key: e.target.value }))}
                className="w-full px-4 py-3 bg-theme-primary border border-theme rounded-lg focus:ring-2 focus:ring-accent focus:border-accent"
                required
              >
                <option value="">Select a location...</option>
                {locations.map(l => (
                  <option key={l.key} value={l.key}>
                    {l.name}{l.isPrimary ? ' ⭐' : ''} - {l.address || l.type}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-theme-tertiary">
                {locations.length} location{locations.length !== 1 ? 's' : ''} found • ⭐ = Primary
              </p>
            </div>
          )}
        </div>

        {/* SKU Settings */}
        <div className="space-y-4">
          <h3 className="font-medium text-theme-primary flex items-center gap-2">
            <span className="text-lg">🏷️</span> SKU Settings
          </h3>
          
          <div>
            <label className="block text-sm font-medium text-theme-secondary mb-1">
              SKU Prefix
            </label>
            <input
              type="text"
              value={formSettings.sku_prefix}
              onChange={(e) => setFormSettings(s => ({ ...s, sku_prefix: e.target.value.replace(/[^a-zA-Z0-9_]/g, '').substring(0, 10) }))}
              placeholder="ql_"
              maxLength={10}
              className="w-full px-4 py-3 bg-theme-primary border border-theme rounded-lg focus:ring-2 focus:ring-accent focus:border-accent"
            />
            <p className="mt-1 text-xs text-theme-tertiary">
              All SKUs will start with this prefix (e.g., {formSettings.sku_prefix || 'ql_'}B01KJEOCDW)
            </p>
          </div>
        </div>

        {/* Description Note */}
        <div className="space-y-4">
          <h3 className="font-medium text-theme-primary flex items-center gap-2">
            <span className="text-lg">📝</span> Custom Description Note
          </h3>
          
          <div>
            <label className="block text-sm font-medium text-theme-secondary mb-1">
              Note to append to all listings (optional)
            </label>
            <textarea
              value={formSettings.description_note}
              onChange={(e) => setFormSettings(s => ({ ...s, description_note: e.target.value.substring(0, 1000) }))}
              placeholder="e.g., Ships from Wisconsin. Contact us with any questions!"
              rows={3}
              maxLength={1000}
              className="w-full px-4 py-3 bg-theme-primary border border-theme rounded-lg focus:ring-2 focus:ring-accent focus:border-accent"
            />
            <p className="mt-1 text-xs text-theme-tertiary">
              {formSettings.description_note.length}/1000 characters
            </p>
          </div>
        </div>

        {/* Error/Success Messages */}
        {settingsError && (
          <div className="p-4 bg-error/10 border border-error/30 rounded-lg">
            <p className="text-sm text-error">{settingsError}</p>
          </div>
        )}
        {settingsSuccess && (
          <div className="p-4 bg-success/10 border border-success/30 rounded-lg">
            <p className="text-sm text-success">{settingsSuccess}</p>
          </div>
        )}

        {/* Save Button */}
        <button
          type="submit"
          disabled={settingsSaving}
          className={`w-full py-3 px-6 rounded-lg font-medium transition-colors ${
            settingsSaving
              ? 'bg-gray-200 dark:bg-gray-700 text-theme-tertiary cursor-not-allowed'
              : 'bg-accent text-white hover:bg-accent-hover'
          }`}
        >
          {settingsSaving ? 'Saving...' : 'Save Settings'}
        </button>
      </form>
    </div>
  )

  // Render listing tab content
  const renderListingTab = () => (
    <div className="space-y-6">
      {/* Not Configured Warning */}
      {!isConfigured && (
        <div className="p-4 bg-warning/10 border border-warning/30 rounded-lg">
          <div className="flex items-start gap-3">
            <div className="text-warning text-2xl">⚠️</div>
            <div>
              <h3 className="font-semibold text-warning">Setup Required</h3>
              <p className="text-sm text-theme-secondary mt-1">
                Please configure your Quick List settings before creating listings.
              </p>
              <button
                onClick={() => setActiveTab(TAB_SETTINGS)}
                className="mt-2 text-sm text-accent hover:underline"
              >
                Go to Settings →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Success Result */}
      {result && (
        <div className="p-4 bg-success/10 border border-success/30 rounded-lg">
          <div className="flex items-start gap-3">
            <div className="text-success text-2xl">✓</div>
            <div className="flex-1">
              <h3 className="font-semibold text-success">Listing Created!</h3>
              <p className="text-sm text-theme-secondary mt-1">{result.title}</p>
              
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-theme-tertiary">SKU:</span>{' '}
                  <span className="font-mono">{result.sku}</span>
                </div>
                <div>
                  <span className="text-theme-tertiary">Category:</span>{' '}
                  <span>{result.categoryName}</span>
                </div>
                <div>
                  <span className="text-theme-tertiary">Price:</span>{' '}
                  <span className="text-success font-semibold">${result.price}</span>
                </div>
                <div>
                  <span className="text-theme-tertiary">Time:</span>{' '}
                  <span>{(result.elapsedMs / 1000).toFixed(1)}s</span>
                </div>
              </div>

              {result.listingUrl && (
                <a
                  href={result.listingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors"
                >
                  View on eBay →
                </a>
              )}

              <button
                onClick={handleReset}
                className="mt-4 ml-3 px-4 py-2 text-theme-secondary hover:text-theme-primary transition-colors"
              >
                Create Another
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="p-4 bg-error/10 border border-error/30 rounded-lg">
          <div className="flex items-start gap-3">
            <div className="text-error text-2xl">✗</div>
            <div>
              <h3 className="font-semibold text-error">Failed to Create Listing</h3>
              <p className="text-sm text-theme-secondary mt-1">{error}</p>
              <button
                onClick={() => setError(null)}
                className="mt-2 text-sm text-accent hover:underline"
              >
                Try Again
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Progress Display */}
      {isLoading && currentStep !== null && (
        <div className="p-4 bg-theme-primary rounded-lg">
          <h3 className="font-medium text-theme-primary mb-3">Creating listing...</h3>
          <div className="space-y-2">
            {STEPS.map((step, idx) => (
              <div key={step.id} className="flex items-center gap-3">
                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${
                  idx < currentStep 
                    ? 'bg-success text-white' 
                    : idx === currentStep 
                      ? 'bg-accent text-white animate-pulse' 
                      : 'bg-gray-200 dark:bg-gray-700 text-theme-tertiary'
                }`}>
                  {idx < currentStep ? '✓' : idx === currentStep ? '...' : idx + 1}
                </div>
                <span className={idx <= currentStep ? 'text-theme-primary' : 'text-theme-tertiary'}>
                  {step.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Form */}
      {!result && (
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* ASIN Input */}
          <div>
            <label className="block text-sm font-medium text-theme-secondary mb-1">
              Amazon ASIN
            </label>
            <div className="relative">
              <input
                type="text"
                value={asin}
                onChange={(e) => setAsin(e.target.value.toUpperCase())}
                placeholder="B01KJEOCDW"
                maxLength={10}
                className={`w-full px-4 py-3 bg-theme-primary border rounded-lg focus:ring-2 focus:ring-accent focus:border-accent transition-colors ${
                  asin && !isValidAsin ? 'border-error' : 'border-theme'
                }`}
                disabled={isLoading || !isConfigured}
              />
              {isValidating && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin"></div>
                </div>
              )}
            </div>
            {asin && !isValidAsin && (
              <p className="mt-1 text-sm text-error">
                ASIN must start with B followed by 9 alphanumeric characters
              </p>
            )}
          </div>

          {/* Product Preview (Story 10) */}
          {productInfo && (
            <div className="p-3 bg-theme-primary rounded-lg border border-theme">
              <div className="flex gap-3">
                {productInfo.imageUrl && (
                  <img 
                    src={productInfo.imageUrl} 
                    alt={productInfo.title}
                    className="w-16 h-16 object-contain rounded"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-theme-primary font-medium truncate">
                    {productInfo.title}
                  </p>
                  <p className="text-xs text-theme-tertiary mt-1">
                    Category: {productInfo.categoryName}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Price Input */}
          <div>
            <label className="block text-sm font-medium text-theme-secondary mb-1">
              Listing Price (USD)
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-theme-tertiary">$</span>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="24.99"
                className="w-full pl-8 pr-4 py-3 bg-theme-primary border border-theme rounded-lg focus:ring-2 focus:ring-accent focus:border-accent transition-colors"
                disabled={isLoading || !isConfigured}
              />
            </div>
          </div>

          {/* Quantity & Condition Row */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-theme-secondary mb-1">
                Quantity
              </label>
              <input
                type="number"
                min="1"
                max="10000"
                value={quantity}
                onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                className="w-full px-4 py-3 bg-theme-primary border border-theme rounded-lg focus:ring-2 focus:ring-accent focus:border-accent transition-colors"
                disabled={isLoading || !isConfigured}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-theme-secondary mb-1">
                Condition
                {productInfo && (
                  <span className="ml-2 text-xs text-theme-tertiary font-normal">
                    ({validConditions.length} options for this category)
                  </span>
                )}
              </label>
              <select
                value={condition}
                onChange={(e) => setCondition(e.target.value)}
                className="w-full px-4 py-3 bg-theme-primary border border-theme rounded-lg focus:ring-2 focus:ring-accent focus:border-accent transition-colors"
                disabled={isLoading || isValidating || !isConfigured}
              >
                {validConditions.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Current Settings Preview */}
          {isConfigured && settings && (
            <div className="p-3 bg-theme-primary rounded-lg border border-theme text-xs text-theme-tertiary">
              <span className="font-medium">Using:</span>{' '}
              SKU prefix "<span className="font-mono">{settings.sku_prefix}</span>"
              <button
                type="button"
                onClick={() => setActiveTab(TAB_SETTINGS)}
                className="ml-2 text-accent hover:underline"
              >
                View/Change Settings
              </button>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={!canSubmit}
            className={`w-full py-3 px-6 rounded-lg font-medium transition-colors ${
              canSubmit
                ? 'bg-accent text-white hover:bg-accent-hover'
                : 'bg-gray-200 dark:bg-gray-700 text-theme-tertiary cursor-not-allowed'
            }`}
          >
            {isLoading ? 'Creating Listing...' : !isConfigured ? 'Configure Settings First' : 'Create eBay Listing'}
          </button>
        </form>
      )}
    </div>
  )

  if (settingsLoading) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-theme-surface rounded-lg border border-theme p-6">
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin"></div>
            <span className="text-theme-secondary">Loading settings...</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-theme-primary">Quick List</h1>
        <p className="text-theme-secondary mt-1">
          Create an eBay listing from an Amazon ASIN in seconds
        </p>
      </div>

      {/* Tab Navigation */}
      <div className="flex border-b border-theme">
        <button
          onClick={() => setActiveTab(TAB_LIST)}
          className={`px-6 py-3 font-medium border-b-2 transition-colors ${
            activeTab === TAB_LIST
              ? 'text-accent border-accent'
              : 'text-theme-tertiary border-transparent hover:text-theme-secondary'
          }`}
        >
          📦 Create Listing
        </button>
        <button
          onClick={() => setActiveTab(TAB_SETTINGS)}
          className={`px-6 py-3 font-medium border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === TAB_SETTINGS
              ? 'text-accent border-accent'
              : 'text-theme-tertiary border-transparent hover:text-theme-secondary'
          }`}
        >
          ⚙️ Settings
          {!isConfigured && (
            <span className="w-2 h-2 bg-error rounded-full"></span>
          )}
        </button>
      </div>

      {/* Main Card */}
      <div className="bg-theme-surface rounded-lg border border-theme p-6">
        {activeTab === TAB_LIST ? renderListingTab() : renderSettingsTab()}
      </div>

      {/* Info Box - only show on list tab when configured */}
      {activeTab === TAB_LIST && isConfigured && (
        <div className="bg-theme-surface rounded-lg border border-theme p-4">
          <h3 className="font-medium text-theme-primary mb-2">How it works</h3>
          <ol className="text-sm text-theme-secondary space-y-1 list-decimal list-inside">
            <li>Enter an Amazon ASIN and your desired price</li>
            <li>We fetch product data from Keepa</li>
            <li>AI generates an optimized 80-character title</li>
            <li>eBay category is auto-detected</li>
            <li>Listing is created and published instantly</li>
          </ol>
        </div>
      )}
    </div>
  )
}

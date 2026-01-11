import { useState } from 'react'
import { supabase } from '../lib/supabase'

/**
 * Story 7A & 7B: Simplified Single-ASIN Listing Component
 * 
 * Simple UI for creating eBay listings from Amazon ASINs.
 * Uses the auto-list-single endpoint that handles the full pipeline.
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

export default function QuickList() {
  // Form state
  const [asin, setAsin] = useState('')
  const [price, setPrice] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [condition, setCondition] = useState('NEW')
  
  // UI state
  const [isLoading, setIsLoading] = useState(false)
  const [currentStep, setCurrentStep] = useState(null)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  // Validation
  const isValidAsin = /^B[0-9A-Z]{9}$/.test(asin)
  const isValidPrice = price && !isNaN(parseFloat(price)) && parseFloat(price) > 0
  const canSubmit = isValidAsin && isValidPrice && !isLoading

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
    setResult(null)
    setError(null)
    setCurrentStep(null)
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Quick List</h1>
        <p className="text-text-secondary mt-1">
          Create an eBay listing from an Amazon ASIN in seconds
        </p>
      </div>

      {/* Main Card */}
      <div className="bg-dark-surface rounded-lg border border-dark-border p-6">
        
        {/* Success Result */}
        {result && (
          <div className="mb-6 p-4 bg-success/10 border border-success/30 rounded-lg">
            <div className="flex items-start gap-3">
              <div className="text-success text-2xl">✓</div>
              <div className="flex-1">
                <h3 className="font-semibold text-success">Listing Created!</h3>
                <p className="text-sm text-text-secondary mt-1">{result.title}</p>
                
                <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-text-tertiary">SKU:</span>{' '}
                    <span className="font-mono">{result.sku}</span>
                  </div>
                  <div>
                    <span className="text-text-tertiary">Category:</span>{' '}
                    <span>{result.categoryName}</span>
                  </div>
                  <div>
                    <span className="text-text-tertiary">Price:</span>{' '}
                    <span className="text-success font-semibold">${result.price}</span>
                  </div>
                  <div>
                    <span className="text-text-tertiary">Time:</span>{' '}
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
                  className="mt-4 ml-3 px-4 py-2 text-text-secondary hover:text-text-primary transition-colors"
                >
                  Create Another
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="mb-6 p-4 bg-error/10 border border-error/30 rounded-lg">
            <div className="flex items-start gap-3">
              <div className="text-error text-2xl">✗</div>
              <div>
                <h3 className="font-semibold text-error">Failed to Create Listing</h3>
                <p className="text-sm text-text-secondary mt-1">{error}</p>
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
          <div className="mb-6 p-4 bg-dark-bg rounded-lg">
            <h3 className="font-medium text-text-primary mb-3">Creating listing...</h3>
            <div className="space-y-2">
              {STEPS.map((step, idx) => (
                <div key={step.id} className="flex items-center gap-3">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${
                    idx < currentStep 
                      ? 'bg-success text-white' 
                      : idx === currentStep 
                        ? 'bg-accent text-white animate-pulse' 
                        : 'bg-dark-border text-text-tertiary'
                  }`}>
                    {idx < currentStep ? '✓' : idx === currentStep ? '...' : idx + 1}
                  </div>
                  <span className={idx <= currentStep ? 'text-text-primary' : 'text-text-tertiary'}>
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
              <label className="block text-sm font-medium text-text-secondary mb-1">
                Amazon ASIN
              </label>
              <input
                type="text"
                value={asin}
                onChange={(e) => setAsin(e.target.value.toUpperCase())}
                placeholder="B01KJEOCDW"
                maxLength={10}
                className={`w-full px-4 py-3 bg-dark-bg border rounded-lg focus:ring-2 focus:ring-accent focus:border-accent transition-colors ${
                  asin && !isValidAsin ? 'border-error' : 'border-dark-border'
                }`}
                disabled={isLoading}
              />
              {asin && !isValidAsin && (
                <p className="mt-1 text-sm text-error">
                  ASIN must start with B followed by 9 alphanumeric characters
                </p>
              )}
            </div>

            {/* Price Input */}
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">
                Listing Price (USD)
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-text-tertiary">$</span>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="24.99"
                  className="w-full pl-8 pr-4 py-3 bg-dark-bg border border-dark-border rounded-lg focus:ring-2 focus:ring-accent focus:border-accent transition-colors"
                  disabled={isLoading}
                />
              </div>
            </div>

            {/* Quantity & Condition Row */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">
                  Quantity
                </label>
                <input
                  type="number"
                  min="1"
                  max="10000"
                  value={quantity}
                  onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                  className="w-full px-4 py-3 bg-dark-bg border border-dark-border rounded-lg focus:ring-2 focus:ring-accent focus:border-accent transition-colors"
                  disabled={isLoading}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">
                  Condition
                </label>
                <select
                  value={condition}
                  onChange={(e) => setCondition(e.target.value)}
                  className="w-full px-4 py-3 bg-dark-bg border border-dark-border rounded-lg focus:ring-2 focus:ring-accent focus:border-accent transition-colors"
                  disabled={isLoading}
                >
                  <option value="NEW">Brand New</option>
                  <option value="NEW_OTHER">New - Open Box</option>
                  <option value="LIKE_NEW">Like New</option>
                  <option value="VERY_GOOD">Very Good</option>
                  <option value="GOOD">Good</option>
                  <option value="ACCEPTABLE">Acceptable</option>
                </select>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={!canSubmit}
              className={`w-full py-3 px-6 rounded-lg font-medium transition-colors ${
                canSubmit
                  ? 'bg-accent text-white hover:bg-accent-hover'
                  : 'bg-dark-border text-text-tertiary cursor-not-allowed'
              }`}
            >
              {isLoading ? 'Creating Listing...' : 'Create eBay Listing'}
            </button>
          </form>
        )}
      </div>

      {/* Info Box */}
      <div className="bg-dark-surface rounded-lg border border-dark-border p-4">
        <h3 className="font-medium text-text-primary mb-2">How it works</h3>
        <ol className="text-sm text-text-secondary space-y-1 list-decimal list-inside">
          <li>Enter an Amazon ASIN and your desired price</li>
          <li>We fetch product data from Keepa</li>
          <li>AI generates an optimized 80-character title</li>
          <li>eBay category is auto-detected</li>
          <li>Listing is created and published instantly</li>
        </ol>
      </div>
    </div>
  )
}

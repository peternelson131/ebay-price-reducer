import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

export default function CreateListing() {
  const { session } = useAuth();
  const [asin, setAsin] = useState('');
  const [price, setPrice] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [condition, setCondition] = useState('NEW');
  const [publish, setPublish] = useState(false);
  
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!asin || !/^B[0-9A-Z]{9}$/.test(asin)) {
      setError('Please enter a valid Amazon ASIN (e.g., B0088PUEPK)');
      return;
    }

    if (!price || parseFloat(price) <= 0) {
      setError('Please enter a valid price');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch('/.netlify/functions/auto-list-single', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`
        },
        body: JSON.stringify({
          asin,
          price: parseFloat(price).toFixed(2),
          quantity: parseInt(quantity),
          condition,
          publish
        })
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.error === 'Missing required aspects') {
          setError(`⏳ System is learning this category. Missing: ${data.details?.missingAspects?.join(', ')}. Try again in 10 minutes.`);
        } else {
          setError(data.message || data.error || 'Failed to create listing');
        }
        return;
      }

      setResult(data);
      // Clear form on success
      setAsin('');
      setPrice('');
      setQuantity('1');

    } catch (err) {
      setError(err.message || 'Network error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-text-primary mb-6">Create eBay Listing</h1>
      
      <div className="bg-dark-surface border border-dark-border rounded-xl p-6">
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* ASIN */}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              Amazon ASIN
            </label>
            <input
              type="text"
              value={asin}
              onChange={(e) => setAsin(e.target.value.toUpperCase())}
              placeholder="B0088PUEPK"
              maxLength="10"
              className="w-full bg-dark-bg border border-dark-border rounded-lg px-4 py-3 text-text-primary placeholder-text-tertiary focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
            />
            <p className="text-xs text-text-tertiary mt-1">
              Product data fetched from Keepa, category from eBay Taxonomy API
            </p>
          </div>

          {/* Price & Quantity */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                Price (USD)
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="29.99"
                className="w-full bg-dark-bg border border-dark-border rounded-lg px-4 py-3 text-text-primary placeholder-text-tertiary focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                Quantity
              </label>
              <input
                type="number"
                min="1"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="w-full bg-dark-bg border border-dark-border rounded-lg px-4 py-3 text-text-primary placeholder-text-tertiary focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
              />
            </div>
          </div>

          {/* Condition */}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              Condition
            </label>
            <select
              value={condition}
              onChange={(e) => setCondition(e.target.value)}
              className="w-full bg-dark-bg border border-dark-border rounded-lg px-4 py-3 text-text-primary focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
            >
              <option value="NEW">New</option>
              <option value="NEW_OTHER">New (Open Box)</option>
              <option value="NEW_WITH_DEFECTS">New (With Defects)</option>
              <option value="LIKE_NEW">Like New</option>
              <option value="USED_EXCELLENT">Used - Excellent</option>
              <option value="USED_VERY_GOOD">Used - Very Good</option>
              <option value="USED_GOOD">Used - Good</option>
              <option value="USED_ACCEPTABLE">Used - Acceptable</option>
            </select>
          </div>

          {/* Publish Toggle */}
          <div className="flex items-center justify-between py-3 px-4 bg-dark-bg rounded-lg border border-dark-border">
            <div>
              <div className="text-sm font-medium text-text-primary">Publish Immediately</div>
              <div className="text-xs text-text-tertiary">If off, creates draft offer only</div>
            </div>
            <button
              type="button"
              onClick={() => setPublish(!publish)}
              className={`relative w-12 h-6 rounded-full transition-colors ${publish ? 'bg-accent' : 'bg-dark-border'}`}
            >
              <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${publish ? 'left-7' : 'left-1'}`} />
            </button>
          </div>

          {/* Error */}
          {error && (
            <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading || !asin || !price}
            className="w-full bg-accent hover:bg-accent-hover disabled:bg-dark-border disabled:text-text-tertiary text-white font-semibold py-3 px-4 rounded-lg transition-colors"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Creating...
              </span>
            ) : (
              'Create Listing'
            )}
          </button>
        </form>

        {/* Result */}
        {result && (
          <div className="mt-6 p-4 bg-green-500/10 border border-green-500/30 rounded-lg">
            <h3 className="text-green-400 font-semibold mb-3">✅ {result.published ? 'Listing Published!' : 'Offer Created!'}</h3>
            
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-text-tertiary">Title:</span>
                <span className="text-text-primary truncate max-w-xs">{result.title}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-tertiary">Category:</span>
                <span className="text-text-primary">{result.category?.name} ({result.category?.id})</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-tertiary">SKU:</span>
                <span className="text-text-primary font-mono">{result.sku}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-tertiary">Offer ID:</span>
                <span className="text-text-primary font-mono">{result.offerId}</span>
              </div>
              {result.listingUrl && (
                <div className="pt-2">
                  <a 
                    href={result.listingUrl} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-accent hover:underline"
                  >
                    View on eBay →
                  </a>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Info Box */}
      <div className="mt-6 p-4 bg-dark-surface border border-dark-border rounded-xl">
        <h3 className="text-sm font-semibold text-text-primary mb-2">How it works</h3>
        <ol className="text-xs text-text-tertiary space-y-1 list-decimal list-inside">
          <li>Enter an Amazon ASIN and your desired price</li>
          <li>We fetch product data from Keepa (title, images, specs)</li>
          <li>eBay Taxonomy API determines the best category</li>
          <li>Keyword patterns fill in required item specifics</li>
          <li>Listing created via eBay Inventory API</li>
        </ol>
      </div>
    </div>
  );
}

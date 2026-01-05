import { useState } from 'react';
import apiService, { handleApiError } from '../services/api';

export default function InfluencerAsinCorrelation() {
  const [asin, setAsin] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);

  // Validate ASIN format (client-side)
  const isValidAsin = (value) => {
    return /^B[0-9A-Z]{9}$/i.test(value);
  };

  const handleSearch = async (e) => {
    e.preventDefault();

    if (!asin.trim()) {
      setError('Please enter an ASIN');
      return;
    }

    if (!isValidAsin(asin)) {
      setError('Invalid ASIN format. Must be B followed by 9 alphanumeric characters (e.g., B07XJ8C8F5)');
      return;
    }

    setLoading(true);
    setError(null);
    setResults(null);

    try {
      const data = await apiService.triggerAsinCorrelation(asin.toUpperCase());
      setResults(data);
    } catch (err) {
      setError(handleApiError(err, 'Failed to analyze ASIN'));
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setAsin('');
    setResults(null);
    setError(null);
  };

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Influencer ASIN Correlation</h1>
        <p className="text-gray-600 mt-1">
          Search for an Amazon ASIN to find similar and correlated products
        </p>
      </div>

      {/* Search Form */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <form onSubmit={handleSearch} className="space-y-4">
          <div>
            <label htmlFor="asin" className="block text-sm font-medium text-gray-700 mb-1">
              Amazon ASIN
            </label>
            <div className="flex gap-3">
              <input
                type="text"
                id="asin"
                value={asin}
                onChange={(e) => setAsin(e.target.value.toUpperCase())}
                placeholder="e.g., B07XJ8C8F5"
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                maxLength={10}
                disabled={loading}
              />
              <button
                type="submit"
                disabled={loading || !asin.trim()}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Searching...
                  </span>
                ) : (
                  'Search'
                )}
              </button>
              {(results || error) && (
                <button
                  type="button"
                  onClick={handleClear}
                  className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Clear
                </button>
              )}
            </div>
            <p className="mt-1 text-xs text-gray-500">
              Enter a 10-character Amazon ASIN starting with B
            </p>
          </div>
        </form>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <div className="flex items-center">
            <svg className="w-5 h-5 text-red-600 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-red-800">{error}</span>
          </div>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="bg-white rounded-lg shadow p-8 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Analyzing ASIN and finding correlations...</p>
          <p className="mt-1 text-sm text-gray-500">This may take a few moments</p>
        </div>
      )}

      {/* Results Display */}
      {results && !loading && (
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
            <h2 className="text-lg font-semibold">
              Results for ASIN: <span className="text-blue-600">{results.asin}</span>
            </h2>
            {results.correlations && Array.isArray(results.correlations) && (
              <span className="text-sm text-gray-500">
                {results.correlations.length} result{results.correlations.length !== 1 ? 's' : ''} found
              </span>
            )}
          </div>
          <div className="p-6">
            {/* Render correlation results - structure depends on n8n response */}
            {results.correlations && Array.isArray(results.correlations) && results.correlations.length > 0 ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {results.correlations.map((item, index) => (
                  <div key={item.asin || index} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                    {item.imageUrl && (
                      <img
                        src={item.imageUrl}
                        alt={item.title || 'Product'}
                        className="w-full h-32 object-contain mb-3 bg-gray-50 rounded"
                        onError={(e) => {
                          e.target.style.display = 'none';
                        }}
                      />
                    )}
                    <h3 className="font-medium text-sm line-clamp-2 min-h-[2.5rem]">
                      {item.title || 'Untitled Product'}
                    </h3>
                    {item.price !== undefined && item.price !== null && (
                      <p className="text-green-600 font-bold mt-2">
                        ${typeof item.price === 'number' ? item.price.toFixed(2) : item.price}
                      </p>
                    )}
                    {item.asin && (
                      <p className="text-xs text-gray-500 mt-1">ASIN: {item.asin}</p>
                    )}
                    {item.category && (
                      <p className="text-xs text-gray-500 mt-1 truncate" title={item.category}>
                        {item.category}
                      </p>
                    )}
                    {item.correlationScore !== undefined && (
                      <div className="mt-2">
                        <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                          {Math.round(item.correlationScore * 100)}% match
                        </span>
                      </div>
                    )}
                    {item.url && (
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-3 text-xs text-blue-600 hover:underline inline-block"
                      >
                        View on Amazon
                      </a>
                    )}
                  </div>
                ))}
              </div>
            ) : results.correlations && typeof results.correlations === 'object' && !Array.isArray(results.correlations) ? (
              // Handle case where n8n returns an object instead of array
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="font-medium mb-2">Correlation Data</h3>
                <pre className="text-sm text-gray-700 overflow-auto max-h-96">
                  {JSON.stringify(results.correlations, null, 2)}
                </pre>
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <svg className="w-12 h-12 text-gray-400 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p>No correlations found for this ASIN</p>
                <p className="text-sm mt-1">Try a different product ASIN</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Empty State - Before Search */}
      {!results && !loading && !error && (
        <div className="bg-gray-50 rounded-lg p-8 text-center">
          <svg className="w-16 h-16 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <h3 className="text-lg font-medium text-gray-700">Enter an ASIN to get started</h3>
          <p className="text-gray-500 mt-1">Find products similar to any Amazon listing</p>
          <div className="mt-4 text-sm text-gray-500">
            <p>Tip: You can find an ASIN on any Amazon product page</p>
            <p>Look in the product details section or the URL</p>
          </div>
        </div>
      )}
    </div>
  );
}

import { useState } from 'react';
import apiService, { handleApiError } from '../services/api';

export default function InfluencerAsinCorrelation() {
  const [asin, setAsin] = useState('');
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [pendingAsin, setPendingAsin] = useState(null);

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
    setShowConfirmDialog(false);

    try {
      // First, check if ASIN exists in database
      const data = await apiService.checkAsinCorrelation(asin.toUpperCase());

      if (data.exists && data.correlations && data.correlations.length > 0) {
        // ASIN exists - display the data
        setResults(data);
      } else {
        // ASIN not found - show confirmation dialog
        setPendingAsin(asin.toUpperCase());
        setShowConfirmDialog(true);
      }
    } catch (err) {
      setError(handleApiError(err, 'Failed to check ASIN'));
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmSync = async () => {
    if (!pendingAsin) return;

    setShowConfirmDialog(false);
    setSyncing(true);
    setError(null);

    try {
      const data = await apiService.syncAsinCorrelation(pendingAsin);
      setResults(data);
    } catch (err) {
      setError(handleApiError(err, 'Failed to sync ASIN'));
    } finally {
      setSyncing(false);
      setPendingAsin(null);
    }
  };

  const handleCancelSync = () => {
    setShowConfirmDialog(false);
    setPendingAsin(null);
  };

  const handleResync = async () => {
    if (!results?.asin) return;

    setSyncing(true);
    setError(null);

    try {
      const data = await apiService.syncAsinCorrelation(results.asin);
      setResults(data);
    } catch (err) {
      setError(handleApiError(err, 'Failed to re-sync ASIN'));
    } finally {
      setSyncing(false);
    }
  };

  const handleClear = () => {
    setAsin('');
    setResults(null);
    setError(null);
    setShowConfirmDialog(false);
    setPendingAsin(null);
  };

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Influencer Central</h1>
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
                disabled={loading || syncing}
              />
              <button
                type="submit"
                disabled={loading || syncing || !asin.trim()}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Checking...
                  </span>
                ) : (
                  'Search'
                )}
              </button>
              {(results || error) && (
                <button
                  type="button"
                  onClick={handleClear}
                  disabled={loading || syncing}
                  className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
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

      {/* Confirmation Dialog */}
      {showConfirmDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-md mx-4">
            <div className="flex items-center mb-4">
              <svg className="w-6 h-6 text-blue-600 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <h3 className="text-lg font-semibold text-gray-900">ASIN Not Found</h3>
            </div>
            <p className="text-gray-600 mb-6">
              The ASIN <span className="font-mono font-semibold text-blue-600">{pendingAsin}</span> was not found in our database. Would you like to sync this ASIN?
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={handleCancelSync}
                className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                No
              </button>
              <button
                onClick={handleConfirmSync}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Yes, Sync ASIN
              </button>
            </div>
          </div>
        </div>
      )}

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

      {/* Syncing State */}
      {syncing && (
        <div className="bg-white rounded-lg shadow p-8 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Syncing ASIN and finding correlations...</p>
          <p className="mt-1 text-sm text-gray-500">This may take a few moments</p>
        </div>
      )}

      {/* Results Display */}
      {results && !loading && !syncing && (
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200 flex flex-wrap justify-between items-center gap-3">
            <div>
              <h2 className="text-lg font-semibold">
                Results for ASIN: <span className="text-blue-600">{results.asin}</span>
              </h2>
              {results.correlations && Array.isArray(results.correlations) && (
                <span className="text-sm text-gray-500">
                  {results.correlations.length} result{results.correlations.length !== 1 ? 's' : ''} found
                </span>
              )}
            </div>
            <button
              onClick={handleResync}
              disabled={syncing}
              className="px-4 py-2 text-sm bg-gray-100 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-200 transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Re-sync
            </button>
          </div>
          <div className="p-6">
            {/* Render correlation results */}
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
                    {item.asin && (
                      <p className="text-xs text-gray-500 mt-1">ASIN: {item.asin}</p>
                    )}
                    {item.suggestedType && (
                      <span className={`inline-block mt-2 text-xs px-2 py-1 rounded ${
                        item.suggestedType === 'variation'
                          ? 'bg-purple-100 text-purple-800'
                          : 'bg-green-100 text-green-800'
                      }`}>
                        {item.suggestedType}
                      </span>
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
            ) : (
              <div className="text-center py-8 text-gray-500">
                <svg className="w-12 h-12 text-gray-400 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p>No correlations found for this ASIN</p>
                <p className="text-sm mt-1">Try syncing to fetch the latest data</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Empty State - Before Search */}
      {!results && !loading && !syncing && !error && !showConfirmDialog && (
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

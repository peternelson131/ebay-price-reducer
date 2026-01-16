import { useState, useRef, useCallback, useEffect } from 'react';
import apiService, { handleApiError } from '../services/api';
import { userAPI } from '../lib/supabase';
import { AlertCircle, CheckCircle, ExternalLink, Loader } from 'lucide-react';

// Marketplace flags and info
const MARKETPLACES = {
  US: { name: 'United States', flag: '🇺🇸', domain: 'amazon.com' },
  CA: { name: 'Canada', flag: '🇨🇦', domain: 'amazon.ca' },
  UK: { name: 'United Kingdom', flag: '🇬🇧', domain: 'amazon.co.uk' },
  DE: { name: 'Germany', flag: '🇩🇪', domain: 'amazon.de' }
};

export default function InfluencerAsinCorrelation() {
  const [asin, setAsin] = useState('');
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState('');
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [pendingAsin, setPendingAsin] = useState(null);
  const pollingRef = useRef(null);
  const pollCountRef = useRef(0);
  
  // Feedback state
  const [feedback, setFeedback] = useState({}); // { [candidateAsin]: { decision, uploaded_usa } }
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [savingFeedback, setSavingFeedback] = useState({});
  const [markingUploaded, setMarkingUploaded] = useState({});
  
  // Tasks state
  const [tasks, setTasks] = useState([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [pendingTaskCount, setPendingTaskCount] = useState(0);

  // Load tasks on mount
  useEffect(() => {
    loadTasks();
  }, []);

  // Load influencer tasks
  const loadTasks = async () => {
    setTasksLoading(true);
    try {
      const token = await userAPI.getAuthToken();
      const response = await fetch('/.netlify/functions/influencer-tasks', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      if (data.success) {
        setTasks(data.tasks || []);
        setPendingTaskCount(data.pendingCount || 0);
      }
    } catch (err) {
      console.error('Failed to load tasks:', err);
    } finally {
      setTasksLoading(false);
    }
  };

  // Mark task as complete
  const completeTask = async (taskId) => {
    try {
      const token = await userAPI.getAuthToken();
      await fetch('/.netlify/functions/influencer-tasks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ taskId, action: 'complete' })
      });
      loadTasks(); // Reload tasks
    } catch (err) {
      console.error('Failed to complete task:', err);
    }
  };
  
  // Loading state for checking availability (per ASIN)
  const [checkingAvailability, setCheckingAvailability] = useState({});

  // Save feedback to database
  const saveFeedback = async (candidateAsin, decision) => {
    if (!results?.asin) return;
    
    setSavingFeedback(prev => ({ ...prev, [candidateAsin]: true }));
    // Also show checking availability indicator for accepts
    if (decision === 'accepted') {
      setCheckingAvailability(prev => ({ ...prev, [candidateAsin]: true }));
    }
    
    try {
      const token = await userAPI.getAuthToken();
      const response = await fetch('/.netlify/functions/correlation-feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          action: 'save',
          search_asin: results.asin,
          candidate_asin: candidateAsin,
          decision
        })
      });
      
      const data = await response.json();
      if (data.success) {
        // Include availability data if returned (for accepts)
        const feedbackData = { decision };
        if (data.availability) {
          feedbackData.available_us = data.availability.US;
          feedbackData.available_ca = data.availability.CA;
          feedbackData.available_de = data.availability.DE;
          feedbackData.available_uk = data.availability.UK;
        }
        setFeedback(prev => ({
          ...prev,
          [candidateAsin]: { ...prev[candidateAsin], ...feedbackData }
        }));
        
        // Reload tasks if accepted (tasks are created)
        if (decision === 'accepted' && data.tasksCreated > 0) {
          loadTasks();
        }
      } else {
        throw new Error(data.error || 'Failed to save');
      }
    } catch (err) {
      console.error('Failed to save feedback:', err);
      alert('Failed to save feedback. Please try again.');
    } finally {
      setSavingFeedback(prev => ({ ...prev, [candidateAsin]: false }));
      setCheckingAvailability(prev => ({ ...prev, [candidateAsin]: false }));
    }
  };

  // Load existing feedback for search ASIN
  const loadExistingFeedback = async (searchAsin) => {
    setFeedbackLoading(true);
    try {
      const token = await userAPI.getAuthToken();
      const response = await fetch(`/.netlify/functions/correlation-feedback?action=get&search_asin=${searchAsin}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      if (data.success && data.feedback) {
        const feedbackMap = {};
        data.feedback.forEach(f => {
          feedbackMap[f.similar_asin] = { 
            decision: f.decision,
            uploaded_usa: f.uploaded_usa,
            uploaded_ca: f.uploaded_ca,
            uploaded_de: f.uploaded_de,
            uploaded_uk: f.uploaded_uk,
            available_us: f.available_us,
            available_ca: f.available_ca,
            available_de: f.available_de,
            available_uk: f.available_uk
          };
        });
        setFeedback(feedbackMap);
      }
    } catch (err) {
      console.error('Failed to load feedback:', err);
    } finally {
      setFeedbackLoading(false);
    }
  };

  const handleAccept = (item) => {
    saveFeedback(item.asin, 'accepted');
  };

  const handleDecline = (item) => {
    saveFeedback(item.asin, 'declined');
  };

  // Handle Amazon upload button click
  const handleAmazonUpload = async (item) => {
    if (!results?.asin) return;
    
    // Open Amazon creator hub manage page in new tab
    window.open('https://www.amazon.com/creatorhub/manage', '_blank');
    
    // Mark as uploaded in database
    setMarkingUploaded(prev => ({ ...prev, [item.asin]: true }));
    
    try {
      const token = await userAPI.getAuthToken();
      const response = await fetch('/.netlify/functions/correlation-feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          action: 'mark_uploaded',
          search_asin: results.asin,
          candidate_asin: item.asin
        })
      });
      
      const data = await response.json();
      if (data.success) {
        setFeedback(prev => ({
          ...prev,
          [item.asin]: { ...prev[item.asin], uploaded_usa: true }
        }));
      } else {
        throw new Error(data.error || 'Failed to mark as uploaded');
      }
    } catch (err) {
      console.error('Failed to mark as uploaded:', err);
    } finally {
      setMarkingUploaded(prev => ({ ...prev, [item.asin]: false }));
    }
  };

  const handleUndo = async (item) => {
    if (!results?.asin) return;
    
    setSavingFeedback(prev => ({ ...prev, [item.asin]: true }));
    
    try {
      const token = await userAPI.getAuthToken();
      const response = await fetch('/.netlify/functions/correlation-feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          action: 'undo',
          search_asin: results.asin,
          candidate_asin: item.asin
        })
      });
      
      const data = await response.json();
      if (data.success) {
        setFeedback(prev => {
          const updated = { ...prev };
          delete updated[item.asin];
          return updated;
        });
      } else {
        throw new Error(data.error || 'Failed to undo');
      }
    } catch (err) {
      console.error('Failed to undo:', err);
      alert('Failed to undo. Please try again.');
    } finally {
      setSavingFeedback(prev => ({ ...prev, [item.asin]: false }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmedAsin = asin.trim().toUpperCase();

    if (!trimmedAsin) {
      setError('Please enter an ASIN');
      return;
    }

    if (!/^B[0-9A-Z]{9}$/i.test(trimmedAsin)) {
      setError('Invalid ASIN format. Should be B followed by 9 characters (e.g., B08N5WRWNW)');
      return;
    }

    setLoading(true);
    setError(null);
    setResults(null);
    setFeedback({});

    try {
      const data = await apiService.checkAsinCorrelation(trimmedAsin);

      if (data.exists && data.correlations && data.correlations.length > 0) {
        setResults(data);
        loadExistingFeedback(trimmedAsin);
      } else {
        setPendingAsin(trimmedAsin);
        setShowConfirmDialog(true);
      }
    } catch (err) {
      setError(handleApiError(err, 'Failed to check ASIN'));
    } finally {
      setLoading(false);
    }
  };

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    pollCountRef.current = 0;
  }, []);

  const startPolling = useCallback((targetAsin) => {
    stopPolling();
    pollCountRef.current = 0;
    const maxSeconds = 600;
    const startTime = Date.now();
    let lastApiCheck = 0;

    pollingRef.current = setInterval(async () => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      pollCountRef.current = elapsed;
      const minutes = Math.floor(elapsed / 60);
      const seconds = elapsed % 60;
      const timeStr = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
      setSyncProgress(`Checking for results... (${timeStr})`);
      
      if (elapsed - lastApiCheck < 5) return;
      lastApiCheck = elapsed;

      try {
        const data = await apiService.checkAsinCorrelation(targetAsin);

        if (data.exists && data.correlations && data.correlations.length > 0) {
          stopPolling();
          setResults(data);
          loadExistingFeedback(targetAsin);
          setSyncing(false);
          setSyncProgress('');
        } else if (elapsed >= maxSeconds) {
          stopPolling();
          setSyncing(false);
          setSyncProgress('');
          setError('Sync timed out after 10 minutes. The workflow may still be running - try searching again in a few minutes.');
        }
      } catch (err) {
        console.error('Polling error:', err);
        if (elapsed >= maxSeconds) {
          stopPolling();
          setSyncing(false);
          setSyncProgress('');
          setError('Failed to check sync status. Please try again.');
        }
      }
    }, 1000);
  }, [stopPolling]);

  const handleConfirmSync = async () => {
    if (!pendingAsin) return;

    setShowConfirmDialog(false);
    setSyncing(true);
    setError(null);
    setSyncProgress('Starting sync...');

    try {
      apiService.syncAsinCorrelation(pendingAsin).catch(err => {
        console.log('Sync request completed or timed out:', err?.message || 'ok');
      });

      setSyncProgress('Sync started. Checking for results...');
      startPolling(pendingAsin);
    } catch (err) {
      setError(handleApiError(err, 'Failed to start sync'));
      setSyncing(false);
      setSyncProgress('');
    } finally {
      setPendingAsin(null);
    }
  };

  const handleCancelSync = () => {
    setShowConfirmDialog(false);
    setPendingAsin(null);
    stopPolling();
  };

  const handleResync = async () => {
    if (!results?.asin) return;
    
    setSyncing(true);
    setError(null);
    setSyncProgress('Starting re-sync...');

    try {
      apiService.syncAsinCorrelation(results.asin).catch(err => {
        console.log('Re-sync request completed or timed out:', err?.message || 'ok');
      });

      setSyncProgress('Re-sync started. Checking for results...');
      startPolling(results.asin);
    } catch (err) {
      setError(handleApiError(err, 'Failed to start re-sync'));
      setSyncing(false);
      setSyncProgress('');
    }
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-theme-primary">ASIN Correlation Finder</h1>
        <p className="text-theme-secondary mt-1">Find similar and related Amazon products</p>
      </div>

      {/* Search Form */}
      <form onSubmit={handleSubmit} className="mb-6">
        <div className="flex gap-3">
          <input
            type="text"
            value={asin}
            onChange={(e) => setAsin(e.target.value.toUpperCase())}
            placeholder="Enter ASIN (e.g., B08N5WRWNW)"
            className="flex-1 px-4 py-2 bg-theme-surface border border-theme rounded-lg text-theme-primary placeholder-text-tertiary focus:outline-none focus:border-accent"
            disabled={loading || syncing}
          />
          <button
            type="submit"
            disabled={loading || syncing}
            className="px-6 py-2 bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Checking...' : 'Search'}
          </button>
        </div>
      </form>

      {/* Confirmation Dialog */}
      {showConfirmDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-theme-surface rounded-lg border border-theme-xl p-6 max-w-md mx-4">
            <div className="flex items-center mb-4">
              <svg className="w-6 h-6 text-accent mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <h3 className="text-lg font-semibold text-theme-primary">ASIN Not Found</h3>
            </div>
            <p className="text-theme-secondary mb-6">
              The ASIN <span className="font-mono font-semibold text-accent">{pendingAsin}</span> was not found in our database. Would you like to sync this ASIN?
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={handleCancelSync}
                className="px-4 py-2 text-theme-secondary border border-theme rounded-lg hover:bg-theme-primary transition-colors"
              >
                No
              </button>
              <button
                onClick={handleConfirmSync}
                className="px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors"
              >
                Yes, Sync ASIN
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="bg-error/10 border border-error/30 rounded-lg p-4 mb-6">
          <div className="flex items-center">
            <svg className="w-5 h-5 text-error mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-error">{error}</span>
          </div>
        </div>
      )}

      {/* Syncing State */}
      {syncing && (
        <div className="bg-theme-surface rounded-lg border border-theme p-8 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-theme-secondary">Syncing ASIN and finding correlations...</p>
          <p className="mt-2 text-sm text-accent font-medium">{syncProgress}</p>
          <p className="mt-1 text-xs text-theme-tertiary">The workflow is running in the background. Results will appear automatically.</p>
          <button
            onClick={() => { stopPolling(); setSyncing(false); setSyncProgress(''); }}
            className="mt-4 px-4 py-2 text-sm text-theme-secondary border border-theme rounded-lg hover:bg-theme-primary transition-colors"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Results Display */}
      {results && !loading && !syncing && (
        <div className="bg-theme-surface rounded-lg border border-theme">
          <div className="px-6 py-4 border-b border-theme flex flex-wrap justify-between items-center gap-3">
            <div>
              <h2 className="text-lg font-semibold">
                Results for ASIN: <span className="text-accent">{results.asin}</span>
              </h2>
              {results.correlations && Array.isArray(results.correlations) && (
                <span className="text-sm text-theme-tertiary">
                  {results.correlations.length} result{results.correlations.length !== 1 ? 's' : ''} found
                </span>
              )}
            </div>
            <button
              onClick={handleResync}
              disabled={syncing}
              className="px-4 py-2 text-sm bg-theme-hover text-theme-secondary border border-theme rounded-lg hover:bg-gray-200 dark:bg-gray-700 transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Re-sync
            </button>
          </div>
          <div className="p-6">
            {results.correlations && Array.isArray(results.correlations) && results.correlations.length > 0 ? (
              <div>
                {/* Table Header with Flags */}
                <div className="flex items-center gap-4 py-2 border-b border-theme mb-2 text-xs text-theme-tertiary font-medium">
                  <div className="w-16 flex-shrink-0"></div>
                  <div className="flex-1 min-w-0">Product</div>
                  <div className="w-24 flex-shrink-0 text-center">ASIN</div>
                  <div className="w-40 flex-shrink-0 text-center">Actions</div>
                  {/* Marketplace Flags Header */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <img src="https://hatscripts.github.io/circle-flags/flags/us.svg" alt="US" className="w-6 h-6" title="United States" />
                    <img src="https://hatscripts.github.io/circle-flags/flags/ca.svg" alt="CA" className="w-6 h-6" title="Canada" />
                    <img src="https://hatscripts.github.io/circle-flags/flags/de.svg" alt="DE" className="w-6 h-6" title="Germany" />
                    <img src="https://hatscripts.github.io/circle-flags/flags/gb.svg" alt="UK" className="w-6 h-6" title="United Kingdom" />
                  </div>
                </div>
                
                <div className="divide-y divide-gray-200 dark:divide-gray-700/50">
                {[...results.correlations]
                  .sort((a, b) => {
                    if (a.suggestedType === 'variation' && b.suggestedType !== 'variation') return -1;
                    if (a.suggestedType !== 'variation' && b.suggestedType === 'variation') return 1;
                    return 0;
                  })
                  .map((item, index) => {
                  const productImage = item.imageUrl || null;
                  const itemFeedback = feedback[item.asin] || {};
                  const isCheckingAvail = checkingAvailability[item.asin];

                  return (
                  <div key={item.asin || index} className="flex items-center gap-4 py-3 hover:bg-theme-primary transition-colors">
                    {/* Image */}
                    <div className="flex-shrink-0 w-16 h-16">
                      {productImage ? (
                        <img
                          src={productImage}
                          alt={item.title || 'Product'}
                          className="w-16 h-16 object-contain bg-theme-primary rounded"
                          onError={(e) => {
                            e.target.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23ccc"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>';
                          }}
                        />
                      ) : (
                        <div className="w-16 h-16 bg-theme-hover rounded flex items-center justify-center">
                          <svg className="w-8 h-8 text-theme-tertiary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                        </div>
                      )}
                    </div>

                    {/* Title & Type */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-theme-primary truncate">
                        {item.title || 'Untitled Product'}
                      </p>
                      {item.suggestedType && (
                        <span className={`inline-block mt-1 text-xs px-2 py-0.5 rounded ${
                          item.suggestedType === 'variation'
                            ? 'bg-purple-100 text-purple-800'
                            : 'bg-success/10 text-success'
                        }`}>
                          {item.suggestedType}
                        </span>
                      )}
                    </div>

                    {/* ASIN & Link */}
                    <div className="flex-shrink-0 w-24 text-center">
                      <p className="text-sm font-mono text-theme-secondary">{item.asin || 'N/A'}</p>
                      {item.url && (
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-accent hover:underline"
                        >
                          View
                        </a>
                      )}
                    </div>

                    {/* Feedback Buttons */}
                    <div className="flex-shrink-0 w-40 flex items-center justify-center gap-2">
                      {feedbackLoading ? (
                        <span className="text-xs text-theme-tertiary">Loading...</span>
                      ) : feedback[item.asin]?.decision ? (
                        <div className="flex items-center gap-1">
                          <span className={`text-xs px-2 py-1 rounded-full ${
                            feedback[item.asin].decision === 'accepted'
                              ? 'bg-success/20 text-success'
                              : 'bg-error/20 text-error'
                          }`}>
                            {feedback[item.asin].decision === 'accepted' ? '✓ Accepted' : '✗ Declined'}
                          </span>
                          <button
                            onClick={() => handleUndo(item)}
                            disabled={savingFeedback[item.asin]}
                            className="text-xs px-1 py-1 text-theme-tertiary hover:text-theme-secondary hover:bg-theme-hover rounded transition-colors disabled:opacity-50"
                            title="Undo decision"
                          >
                            {savingFeedback[item.asin] ? '...' : '↩'}
                          </button>
                        </div>
                      ) : (
                        <div className="flex gap-1">
                          <button
                            onClick={() => handleAccept(item)}
                            disabled={savingFeedback[item.asin]}
                            className="text-xs px-3 py-1.5 bg-success/20 text-success rounded-full hover:bg-success/30 transition-colors disabled:opacity-50"
                          >
                            {savingFeedback[item.asin] ? '...' : '✓ Accept'}
                          </button>
                          <button
                            onClick={() => handleDecline(item)}
                            disabled={savingFeedback[item.asin]}
                            className="text-xs px-3 py-1.5 bg-error/20 text-error rounded-full hover:bg-error/30 transition-colors disabled:opacity-50"
                          >
                            {savingFeedback[item.asin] ? '...' : '✗ Decline'}
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Marketplace Availability Flags - only shown after Accept */}
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {isCheckingAvail ? (
                        <>
                          <span className="w-8 text-center text-theme-tertiary text-xs">...</span>
                          <span className="w-8 text-center text-theme-tertiary text-xs">...</span>
                          <span className="w-8 text-center text-theme-tertiary text-xs">...</span>
                          <span className="w-8 text-center text-theme-tertiary text-xs">...</span>
                        </>
                      ) : itemFeedback.decision === 'accepted' ? (
                        <>
                          {/* US */}
                          {itemFeedback.available_us === true ? (
                            <a href={`https://www.amazon.com/dp/${item.asin}`} target="_blank" rel="noopener noreferrer" className="hover:scale-110 transition-transform" title="View on Amazon.com">
                              <img src="https://hatscripts.github.io/circle-flags/flags/us.svg" alt="US" className="w-6 h-6" />
                            </a>
                          ) : (
                            <span className="w-6 h-6"></span>
                          )}
                          {/* CA */}
                          {itemFeedback.available_ca === true ? (
                            <a href={`https://www.amazon.ca/dp/${item.asin}`} target="_blank" rel="noopener noreferrer" className="hover:scale-110 transition-transform" title="View on Amazon.ca">
                              <img src="https://hatscripts.github.io/circle-flags/flags/ca.svg" alt="CA" className="w-6 h-6" />
                            </a>
                          ) : (
                            <span className="w-6 h-6"></span>
                          )}
                          {/* DE */}
                          {itemFeedback.available_de === true ? (
                            <a href={`https://www.amazon.de/dp/${item.asin}`} target="_blank" rel="noopener noreferrer" className="hover:scale-110 transition-transform" title="View on Amazon.de">
                              <img src="https://hatscripts.github.io/circle-flags/flags/de.svg" alt="DE" className="w-6 h-6" />
                            </a>
                          ) : (
                            <span className="w-6 h-6"></span>
                          )}
                          {/* UK */}
                          {itemFeedback.available_uk === true ? (
                            <a href={`https://www.amazon.co.uk/dp/${item.asin}`} target="_blank" rel="noopener noreferrer" className="hover:scale-110 transition-transform" title="View on Amazon.co.uk">
                              <img src="https://hatscripts.github.io/circle-flags/flags/gb.svg" alt="UK" className="w-6 h-6" />
                            </a>
                          ) : (
                            <span className="w-6 h-6"></span>
                          )}
                        </>
                      ) : (
                        <>
                          <span className="w-8 text-center text-theme-tertiary">—</span>
                          <span className="w-8 text-center text-theme-tertiary">—</span>
                          <span className="w-8 text-center text-theme-tertiary">—</span>
                          <span className="w-8 text-center text-theme-tertiary">—</span>
                        </>
                      )}
                    </div>
                  </div>
                  );
                })}
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-theme-tertiary">
                <svg className="w-12 h-12 text-theme-tertiary mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p>No correlations found for this ASIN</p>
                <p className="text-sm mt-1">Try syncing to fetch the latest data</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Empty State */}
      {!results && !loading && !syncing && !error && !showConfirmDialog && (
        <div className="bg-theme-primary rounded-lg p-8 text-center">
          <svg className="w-16 h-16 text-theme-tertiary mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <h3 className="text-lg font-medium text-theme-secondary">Enter an ASIN to get started</h3>
          <p className="text-theme-tertiary mt-1">Find products similar to any Amazon listing</p>
          <div className="mt-4 text-sm text-theme-tertiary">
            <p>Tip: You can find an ASIN on any Amazon product page</p>
            <p>Look in the product details section or the URL</p>
          </div>
        </div>
      )}

      {/* Task Sidebar */}
      <div className="mt-8 bg-theme-surface rounded-lg border border-theme p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-theme-primary flex items-center gap-2">
            📋 Influencer Upload Tasks
            {pendingTaskCount > 0 && (
              <span className="px-2 py-0.5 bg-error text-white text-xs font-bold rounded-full animate-pulse">
                {pendingTaskCount}
              </span>
            )}
          </h2>
          <button
            onClick={loadTasks}
            disabled={tasksLoading}
            className="text-sm text-accent hover:text-accent-hover transition-colors"
          >
            {tasksLoading ? <Loader className="w-4 h-4 animate-spin" /> : 'Refresh'}
          </button>
        </div>

        {tasksLoading && tasks.length === 0 ? (
          <div className="text-center py-6 text-theme-tertiary">
            <Loader className="w-6 h-6 animate-spin mx-auto mb-2" />
            Loading tasks...
          </div>
        ) : tasks.length === 0 ? (
          <div className="text-center py-6 text-theme-tertiary">
            <p>No tasks yet</p>
            <p className="text-sm mt-1">Accept ASIN correlations to create upload tasks</p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Pending Tasks */}
            {tasks.filter(t => t.status === 'pending').length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-theme-secondary mb-2 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-error" />
                  Pending ({tasks.filter(t => t.status === 'pending').length})
                </h3>
                <div className="space-y-2">
                  {tasks.filter(t => t.status === 'pending').map(task => (
                    <div
                      key={task.id}
                      className="flex items-center justify-between p-3 bg-error/5 border border-error/20 rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-xl">{MARKETPLACES[task.marketplace]?.flag}</span>
                        <div>
                          <p className="font-mono text-sm text-theme-primary">{task.asin}</p>
                          <p className="text-xs text-theme-tertiary">{MARKETPLACES[task.marketplace]?.name}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <a
                          href={task.amazon_upload_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-1.5 bg-accent text-white text-sm rounded-lg hover:bg-accent-hover transition-colors flex items-center gap-1"
                        >
                          Open <ExternalLink className="w-3 h-3" />
                        </a>
                        <button
                          onClick={() => completeTask(task.id)}
                          className="px-3 py-1.5 bg-success/10 text-success text-sm rounded-lg hover:bg-success/20 transition-colors"
                        >
                          Done
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Completed Tasks */}
            {tasks.filter(t => t.status === 'completed').length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-theme-secondary mb-2 flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-success" />
                  Completed ({tasks.filter(t => t.status === 'completed').length})
                </h3>
                <div className="space-y-2">
                  {tasks.filter(t => t.status === 'completed').slice(0, 5).map(task => (
                    <div
                      key={task.id}
                      className="flex items-center justify-between p-3 bg-success/5 border border-success/20 rounded-lg opacity-60"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-xl">{MARKETPLACES[task.marketplace]?.flag}</span>
                        <div>
                          <p className="font-mono text-sm text-theme-primary line-through">{task.asin}</p>
                          <p className="text-xs text-theme-tertiary">{MARKETPLACES[task.marketplace]?.name}</p>
                        </div>
                      </div>
                      <CheckCircle className="w-5 h-5 text-success" />
                    </div>
                  ))}
                  {tasks.filter(t => t.status === 'completed').length > 5 && (
                    <p className="text-xs text-theme-tertiary text-center">
                      +{tasks.filter(t => t.status === 'completed').length - 5} more completed
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

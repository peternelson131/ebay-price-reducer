/**
 * ProductCRM Component
 * 
 * Product Sourcing CRM for tracking sourced products from ASIN to listing.
 * Supports multi-owner collaboration, shipping tracking, and quick listing.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useDropzone } from 'react-dropzone';
import * as XLSX from 'xlsx';
import { userAPI, supabase } from '../lib/supabase';

import CustomizableDropdown from '../components/crm/CustomizableDropdown';
import OwnerSelector from '../components/crm/OwnerSelector';
import {
  Package,
  Search,
  Plus,
  Filter,
  ChevronRight,
  ChevronDown,
  ExternalLink,
  Users,
  Truck,
  CheckCircle,
  Clock,
  AlertCircle,
  X,
  RefreshCw,
  MoreVertical,
  Edit,
  Trash2,
  ShoppingBag,
  Zap,
  ThumbsUp,
  ThumbsDown,
  Eye,
  Inbox,
  Loader,
  ListTodo,
  Check,
  MessageSquare,
  GripVertical,
  Upload,
  Construction,
  Download
} from 'lucide-react';

// Status configuration with colors matching the database seed
const STATUS_CONFIG = {
  'Sourcing': { color: '#3B82F6', bgClass: 'bg-blue-100 dark:bg-blue-900/30', textClass: 'text-blue-700 dark:text-blue-300' },
  'Review': { color: '#8B5CF6', bgClass: 'bg-purple-100 dark:bg-purple-900/30', textClass: 'text-purple-700 dark:text-purple-300' },
  'Negotiating': { color: '#F97316', bgClass: 'bg-orange-100 dark:bg-orange-900/30', textClass: 'text-orange-700 dark:text-orange-300' },
  'Committed': { color: '#06B6D4', bgClass: 'bg-cyan-100 dark:bg-cyan-900/30', textClass: 'text-cyan-700 dark:text-cyan-300' },
  'Ordered': { color: '#6366F1', bgClass: 'bg-indigo-100 dark:bg-indigo-900/30', textClass: 'text-indigo-700 dark:text-indigo-300' },
  'Shipped': { color: '#EAB308', bgClass: 'bg-yellow-100 dark:bg-yellow-900/30', textClass: 'text-yellow-700 dark:text-yellow-300' },
  'In Transit': { color: '#FBBF24', bgClass: 'bg-amber-100 dark:bg-amber-900/30', textClass: 'text-amber-700 dark:text-amber-300' },
  'Delivered': { color: '#10B981', bgClass: 'bg-emerald-100 dark:bg-emerald-900/30', textClass: 'text-emerald-700 dark:text-emerald-300' },
  'To Receive': { color: '#F97316', bgClass: 'bg-orange-100 dark:bg-orange-900/30', textClass: 'text-orange-700 dark:text-orange-300' },
  'Completed': { color: '#22C55E', bgClass: 'bg-green-100 dark:bg-green-900/30', textClass: 'text-green-700 dark:text-green-300' },
  'Returned': { color: '#EF4444', bgClass: 'bg-red-100 dark:bg-red-900/30', textClass: 'text-red-700 dark:text-red-300' },
  'Cancelled': { color: '#9CA3AF', bgClass: 'bg-gray-100 dark:bg-gray-700/30', textClass: 'text-gray-700 dark:text-gray-300' },
  'Problem': { color: '#DC2626', bgClass: 'bg-red-100 dark:bg-red-900/30', textClass: 'text-red-700 dark:text-red-300' }
};

// Shipping status configuration
const SHIPPING_STATUS_CONFIG = {
  'pending': { icon: Clock, label: 'Pending', color: 'text-gray-500' },
  'label_created': { icon: Package, label: 'Label Created', color: 'text-blue-500' },
  'picked_up': { icon: Truck, label: 'Picked Up', color: 'text-blue-500' },
  'in_transit': { icon: Truck, label: 'In Transit', color: 'text-yellow-500' },
  'out_for_delivery': { icon: Truck, label: 'Out for Delivery', color: 'text-orange-500' },
  'delivered': { icon: CheckCircle, label: 'Delivered', color: 'text-green-500' },
  'exception': { icon: AlertCircle, label: 'Exception', color: 'text-red-500' },
  'returned': { icon: Package, label: 'Returned', color: 'text-red-500' }
};

// Status Badge Component
const StatusBadge = ({ status }) => {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG['Sourcing'];
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.bgClass} ${config.textClass}`}>
      {status}
    </span>
  );
};

// Shipping Status Badge
const ShippingBadge = ({ status }) => {
  const config = SHIPPING_STATUS_CONFIG[status] || SHIPPING_STATUS_CONFIG['pending'];
  const Icon = config.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-xs ${config.color}`}>
      <Icon className="w-3 h-3" />
      {config.label}
    </span>
  );
};

// Owner Avatars Component
const OwnerAvatars = ({ owners, max = 3 }) => {
  if (!owners || owners.length === 0) return <span className="text-gray-400 text-sm">No owner</span>;
  
  const displayed = owners.slice(0, max);
  const remaining = owners.length - max;
  
  return (
    <div className="flex items-center -space-x-2">
      {displayed.map((owner, i) => (
        <div
          key={owner.id || i}
          className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white text-xs font-medium border-2 border-white dark:border-gray-800"
          title={owner.name || owner.email}
        >
          {(owner.name || owner.email || '?')[0].toUpperCase()}
        </div>
      ))}
      {remaining > 0 && (
        <div className="w-7 h-7 rounded-full bg-gray-200 dark:bg-gray-600 flex items-center justify-center text-gray-600 dark:text-gray-300 text-xs font-medium border-2 border-white dark:border-gray-800">
          +{remaining}
        </div>
      )}
    </div>
  );
};

// Default conditions for Quick List
const DEFAULT_CONDITIONS = [
  { value: 'NEW', label: 'Brand New' },
  { value: 'NEW_OTHER', label: 'New (Open Box)' },
  { value: 'LIKE_NEW', label: 'Like New' },
  { value: 'VERY_GOOD', label: 'Very Good' },
  { value: 'GOOD', label: 'Good' },
  { value: 'ACCEPTABLE', label: 'Acceptable' }
];

// Progress steps for Quick List
const QUICK_LIST_STEPS = [
  { id: 'auth', label: 'Authenticating' },
  { id: 'keepa', label: 'Fetching data' },
  { id: 'category', label: 'Detecting category' },
  { id: 'content', label: 'Generating title' },
  { id: 'inventory', label: 'Creating item' },
  { id: 'offer', label: 'Creating offer' },
  { id: 'publish', label: 'Publishing' }
];

// ASIN Correlation Panel - Appears to the RIGHT of the detail panel
// Similar pattern to QuickListPanel - opens as a side panel
// Uses the same working API as InfluencerAsinCorrelation page (trigger-asin-correlation-v2 + polling)
const ASINCorrelationPanel = ({ product, isOpen, onClose }) => {
  // Local state - same pattern as working InfluencerAsinCorrelation page
  const [displayCorrelations, setDisplayCorrelations] = useState([]);
  const [acfFeedback, setAcfFeedback] = useState({});
  const [acfSavingFeedback, setAcfSavingFeedback] = useState({});
  const [toastMessage, setToastMessage] = useState(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [syncProgress, setSyncProgress] = useState('');
  const pollingRef = useRef(null);
  const pollCountRef = useRef(0);

  // Show toast notification
  const showToast = (message, type = 'success') => {
    setToastMessage({ message, type });
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Stop polling
  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    pollCountRef.current = 0;
  }, []);

  // Start polling for results (same as working page)
  const startPolling = useCallback((targetAsin) => {
    stopPolling();
    pollCountRef.current = 0;
    const maxSeconds = 300; // 5 minutes max
    const startTime = Date.now();
    let lastApiCheck = 0;

    pollingRef.current = setInterval(async () => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      pollCountRef.current = elapsed;
      const minutes = Math.floor(elapsed / 60);
      const seconds = elapsed % 60;
      const timeStr = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
      setSyncProgress(`Finding correlations... (${timeStr})`);
      
      // Only check API every 5 seconds to avoid hammering
      if (elapsed - lastApiCheck < 5) return;
      lastApiCheck = elapsed;

      try {
        const token = await userAPI.getAuthToken();
        const response = await fetch('/.netlify/functions/trigger-asin-correlation-v2', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}` 
          },
          body: JSON.stringify({ asin: targetAsin, action: 'check' })
        });
        const data = await response.json();

        if (data.exists && data.correlations && data.correlations.length > 0) {
          stopPolling();
          setDisplayCorrelations(data.correlations);
          setIsLoading(false);
          setSyncProgress('');
        } else if (elapsed >= maxSeconds) {
          stopPolling();
          setIsLoading(false);
          setSyncProgress('');
          showToast('Sync timed out. Try again or check the full ASIN Correlation page.', 'error');
        }
      } catch (err) {
        console.error('Polling error:', err);
      }
    }, 1000);
  }, [stopPolling]);

  // Reset state when product changes
  useEffect(() => {
    if (isOpen && product?.asin) {
      setDisplayCorrelations([]);
      setAcfFeedback({});
      setHasSearched(false);
      setIsLoading(false);
      setSyncProgress('');
      stopPolling();
    }
    return () => stopPolling();
  }, [isOpen, product?.asin, stopPolling]);

  // Handle ESC key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // ACF: Run correlation search - CHECK DATABASE FIRST, sync only if needed
  const handleFindCorrelations = async () => {
    if (!product?.asin) return;
    
    setHasSearched(true);
    setDisplayCorrelations([]);
    setIsLoading(true);
    setSyncProgress('Checking database...');
    
    try {
      const token = await userAPI.getAuthToken();
      
      // STEP 1: Check if correlations already exist in database
      const checkResponse = await fetch('/.netlify/functions/trigger-asin-correlation-v2', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ asin: product.asin, action: 'check' })
      });
      
      const checkData = await checkResponse.json();
      
      // If data exists, show it immediately (no expensive sync needed!)
      if (checkData.exists && checkData.correlations?.length > 0) {
        setDisplayCorrelations(checkData.correlations);
        setIsLoading(false);
        setSyncProgress('');
        showToast(`Found ${checkData.correlations.length} correlations from database`);
        return;
      }
      
      // STEP 2: No data exists - run expensive sync
      setSyncProgress('No cached data. Starting sync...');
      fetch('/.netlify/functions/trigger-asin-correlation-v2', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ asin: product.asin, action: 'sync' })
      }).catch(err => {
        console.log('Sync request completed or timed out:', err?.message || 'ok');
      });

      setSyncProgress('Sync started. Checking for results...');
      startPolling(product.asin);
    } catch (err) {
      console.error('Failed to find correlations:', err);
      showToast('Failed - ' + (err.message || 'Unknown error'), 'error');
      setIsLoading(false);
      setSyncProgress('');
    }
  };

  // ACF: Accept correlation - saves to correlation-feedback
  const handleAcceptCorrelation = async (correlation) => {
    if (!product?.asin) return;
    
    setAcfSavingFeedback(prev => ({ ...prev, [correlation.asin]: true }));
    
    try {
      // Save to correlation feedback for tracking
      const token = await userAPI.getAuthToken();
      const response = await fetch('/.netlify/functions/correlation-feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          action: 'save',
          search_asin: product.asin,
          candidate_asin: correlation.asin,
          decision: 'accepted'
        })
      });
      
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to save');
      }
      
      setAcfFeedback(prev => ({
        ...prev,
        [correlation.asin]: { decision: 'accepted' }
      }));
      
      // Remove from correlations list
      setDisplayCorrelations(prev => prev.filter(c => c.asin !== correlation.asin));
      
      showToast('Correlation accepted!');
    } catch (err) {
      console.error('Failed to accept correlation:', err);
      showToast('Failed to save - ' + (err.message || 'Unknown error'), 'error');
    } finally {
      setAcfSavingFeedback(prev => ({ ...prev, [correlation.asin]: false }));
    }
  };

  // ACF: Decline correlation - saves to correlation-feedback
  const handleDeclineCorrelation = async (correlation) => {
    if (!product?.asin) return;
    
    setAcfSavingFeedback(prev => ({ ...prev, [correlation.asin]: true }));
    
    try {
      // Save to correlation feedback for tracking
      const token = await userAPI.getAuthToken();
      const response = await fetch('/.netlify/functions/correlation-feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          action: 'save',
          search_asin: product.asin,
          candidate_asin: correlation.asin,
          decision: 'declined'
        })
      });
      
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to save');
      }
      
      setAcfFeedback(prev => ({
        ...prev,
        [correlation.asin]: { decision: 'declined' }
      }));
      
      // Remove from correlations list
      setDisplayCorrelations(prev => prev.filter(c => c.asin !== correlation.asin));
      
      showToast('Correlation declined');
    } catch (err) {
      console.error('Failed to decline correlation:', err);
      showToast('Failed to save decline', 'error');
    } finally {
      setAcfSavingFeedback(prev => ({ ...prev, [correlation.asin]: false }));
    }
  };

  if (!isOpen || !product) return null;

  return (
    <div className="fixed inset-y-0 right-0 w-[480px] bg-gray-900 shadow-2xl border-l border-gray-700 z-50 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 bg-purple-600 text-white">
        <div className="flex items-center gap-3">
          <Zap className="w-6 h-6" />
          <div>
            <h3 className="font-bold text-lg">ASIN Correlation Finder</h3>
            <p className="text-purple-100 text-sm">Find similar products</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-2 hover:bg-purple-700 rounded-lg transition-colors"
          title="Close (ESC)"
        >
          <X className="w-6 h-6" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Product Card */}
        <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden shadow-sm">
          <div className="flex gap-4 p-4">
            <div className="w-20 h-20 rounded-lg bg-gray-700 flex-shrink-0 flex items-center justify-center overflow-hidden">
              {product.image_url ? (
                <img src={product.image_url} alt={product.asin} className="w-full h-full object-contain" />
              ) : (
                <Package className="w-8 h-8 text-gray-500" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <span className="font-mono text-sm bg-gray-700 text-gray-200 px-2 py-1 rounded">{product.asin}</span>
                <a
                  href={`https://amazon.com/dp/${product.asin}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>
              {product.title && (
                <p className="text-sm text-gray-300 line-clamp-2">{product.title}</p>
              )}
            </div>
          </div>
        </div>

        {/* Find Correlations Button */}
        <button
          onClick={handleFindCorrelations}
          disabled={isLoading}
          className="w-full px-4 py-3 bg-purple-600 text-white rounded-xl hover:bg-purple-700 disabled:opacity-50 flex items-center justify-center gap-2 font-medium shadow-lg shadow-purple-600/30"
        >
          {isLoading ? (
            <>
              <Loader className="w-5 h-5 animate-spin" />
              {syncProgress || "Finding correlations..."}
            </>
          ) : (
            <>
              <Zap className="w-5 h-5" />
              ASIN Correlation Finder
            </>
          )}
        </button>

        {/* Results */}
        {(hasSearched && !isLoading) && (
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-gray-200">
              {displayCorrelations.length === 0 
                ? 'No Correlations Found' 
                : `Found ${displayCorrelations.length} Correlations`}
            </h4>
            
            {displayCorrelations.length === 0 ? (
              <div className="bg-gray-800 rounded-xl border border-gray-700 p-6 text-center">
                <Search className="w-10 h-10 mx-auto text-gray-500 mb-3" />
                <p className="text-sm text-gray-400">No correlations found for this ASIN.</p>
                <p className="text-xs text-gray-500 mt-1">Try syncing from the full ACF page for fresh data.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {displayCorrelations.map((item, idx) => (
                  <div 
                    key={item.asin || idx} 
                    className="bg-gray-800 rounded-xl border border-gray-700 p-4 flex items-center gap-3"
                  >
                    {/* Thumbnail */}
                    <div className="w-14 h-14 flex-shrink-0 rounded-lg overflow-hidden bg-gray-700">
                      {item.imageUrl ? (
                        <img src={item.imageUrl} alt="" className="w-full h-full object-contain" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Package className="w-6 h-6 text-gray-500" />
                        </div>
                      )}
                    </div>
                    
                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-mono text-gray-300">{item.asin}</p>
                      <p className="text-xs text-gray-500 line-clamp-1">{item.title || 'No title'}</p>
                      {item.suggestedType && (
                        <span className={`inline-block mt-1 text-xs px-2 py-0.5 rounded-full ${
                          item.suggestedType === 'variation'
                            ? 'bg-purple-900/50 text-purple-300'
                            : 'bg-green-900/50 text-green-300'
                        }`}>
                          {item.suggestedType}
                        </span>
                      )}
                    </div>
                    
                    {/* Actions */}
                    <div className="flex items-center gap-2">
                      {acfFeedback[item.asin]?.decision ? (
                        <span className={`text-xs px-3 py-1.5 rounded-full font-medium ${
                          acfFeedback[item.asin].decision === 'accepted'
                            ? 'bg-green-900/50 text-green-300'
                            : 'bg-red-900/50 text-red-300'
                        }`}>
                          {acfFeedback[item.asin].decision === 'accepted' ? '✓ Accepted' : '✗ Declined'}
                        </span>
                      ) : (
                        <>
                          <button
                            onClick={() => handleAcceptCorrelation(item)}
                            disabled={acfSavingFeedback[item.asin]}
                            className="p-2 bg-green-900/30 text-green-400 rounded-lg hover:bg-green-900/50 disabled:opacity-50"
                            title="Accept"
                          >
                            {acfSavingFeedback[item.asin] ? (
                              <Loader className="w-4 h-4 animate-spin" />
                            ) : (
                              <ThumbsUp className="w-4 h-4" />
                            )}
                          </button>
                          <button
                            onClick={() => handleDeclineCorrelation(item)}
                            disabled={acfSavingFeedback[item.asin]}
                            className="p-2 bg-red-900/30 text-red-400 rounded-lg hover:bg-red-900/50 disabled:opacity-50"
                            title="Decline"
                          >
                            {acfSavingFeedback[item.asin] ? (
                              <Loader className="w-4 h-4 animate-spin" />
                            ) : (
                              <ThumbsDown className="w-4 h-4" />
                            )}
                          </button>
                        </>
                      )}
                      <a
                        href={`https://amazon.com/dp/${item.asin}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 text-gray-400 hover:text-blue-400 rounded-lg"
                        title="View on Amazon"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>

      {/* Footer */}
      <div className="border-t border-gray-700 px-6 py-4 bg-gray-800">
        <a
          href={`/asin-lookup?asin=${product.asin}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-gray-400 hover:text-gray-200 flex items-center justify-center gap-2"
        >
          Open full ACF page <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>

      {/* Toast Notification */}
      {toastMessage && (
        <div className={`fixed bottom-4 right-4 z-[60] px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 ${
          toastMessage.type === 'error' 
            ? 'bg-red-600 text-white' 
            : 'bg-green-600 text-white'
        }`}>
          {toastMessage.type === 'error' ? (
            <AlertCircle className="w-4 h-4" />
          ) : (
            <CheckCircle className="w-4 h-4" />
          )}
          {toastMessage.message}
        </div>
      )}
    </div>
  );
};

// Quick List Panel - Appears to the RIGHT of the detail panel
// When open, the detail panel shifts left to make room
const QuickListPanel = ({ product, isOpen, onClose }) => {
  const [price, setPrice] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [condition, setCondition] = useState('NEW');
  const [isLoading, setIsLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [isConfigured, setIsConfigured] = useState(true);
  const [settingsChecked, setSettingsChecked] = useState(false);

  // Check if Quick List is configured
  useEffect(() => {
    const checkSettings = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        
        const response = await fetch('/.netlify/functions/quick-list-settings', {
          headers: { 'Authorization': `Bearer ${session.access_token}` }
        });
        const data = await response.json();
        setIsConfigured(data.isConfigured || false);
        setSettingsChecked(true);
      } catch (err) {
        console.error('Failed to check Quick List settings:', err);
        setSettingsChecked(true);
      }
    };
    
    if (isOpen && !settingsChecked) {
      checkSettings();
    }
  }, [isOpen, settingsChecked]);

  // Reset form when panel opens with new product
  useEffect(() => {
    if (isOpen) {
      setPrice('');
      setQuantity(1);
      setCondition('NEW');
      setResult(null);
      setError(null);
      setCurrentStep(null);
    }
  }, [isOpen, product?.asin]);

  // Handle ESC key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!price || isLoading) return;

    setIsLoading(true);
    setError(null);
    setResult(null);
    setCurrentStep(0);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      // Call the same function as the Quick List page
      const response = await fetch('/.netlify/functions/auto-list-single', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          asin: product.asin,
          price: parseFloat(price),
          quantity: parseInt(quantity),
          condition: condition
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || data.error || 'Failed to create listing');
      }

      setResult(data);
      setCurrentStep(QUICK_LIST_STEPS.length);

    } catch (err) {
      console.error('Quick List error:', err);
      setError(err.message);
      setCurrentStep(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setPrice('');
    setQuantity(1);
    setCondition('NEW');
    setResult(null);
    setError(null);
    setCurrentStep(null);
  };

  if (!isOpen || !product) return null;

  return (
    <div 
      className="fixed inset-y-0 right-0 w-[480px] bg-gray-900 shadow-2xl border-l border-gray-700 z-50 flex flex-col"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 bg-green-600 text-white">
        <div className="flex items-center gap-3">
          <ShoppingBag className="w-6 h-6" />
          <div>
            <h3 className="font-bold text-lg">Quick List to eBay</h3>
            <p className="text-green-100 text-sm">Create listing in seconds</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-2 hover:bg-green-700 rounded-lg transition-colors"
          title="Close (ESC)"
        >
          <X className="w-6 h-6" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Settings Warning */}
        {settingsChecked && !isConfigured && (
          <div className="p-4 bg-yellow-900/50 border border-yellow-700 rounded-xl">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-yellow-200">Quick List not configured</p>
                <a href="/quick-list" className="text-sm text-yellow-300 underline">Configure settings first →</a>
              </div>
            </div>
          </div>
        )}

        {/* Product Card */}
        <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden shadow-sm">
          <div className="flex gap-4 p-4">
            <div className="w-24 h-24 rounded-lg bg-gray-700 flex-shrink-0 flex items-center justify-center overflow-hidden">
              {product.image_url ? (
                <img src={product.image_url} alt={product.asin} className="w-full h-full object-contain" />
              ) : (
                <Package className="w-10 h-10 text-gray-500" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <span className="font-mono text-sm bg-gray-700 text-gray-200 px-2 py-1 rounded">{product.asin}</span>
                <a
                  href={`https://amazon.com/dp/${product.asin}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>
              {product.title && (
                <p className="text-sm text-gray-300 line-clamp-3">{product.title}</p>
              )}
            </div>
          </div>
        </div>

        {/* Success Result */}
        {result && (
          <div className="bg-green-100 dark:bg-green-800/30 border border-green-300 dark:border-green-700 rounded-xl p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-green-500 rounded-full flex items-center justify-center">
                <CheckCircle className="w-7 h-7 text-white" />
              </div>
              <div>
                <h4 className="font-bold text-green-800 dark:text-green-200 text-lg">Success!</h4>
                <p className="text-green-600 dark:text-green-400 text-sm">Listing created on eBay</p>
              </div>
            </div>
            
            <p className="text-sm text-green-800 dark:text-green-200 mb-4">{result.title}</p>
            
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="bg-white/50 dark:bg-gray-800/50 rounded-lg p-3">
                <p className="text-xs text-green-600 dark:text-green-400 mb-1">SKU</p>
                <p className="font-mono text-sm">{result.sku}</p>
              </div>
              <div className="bg-white/50 dark:bg-gray-800/50 rounded-lg p-3">
                <p className="text-xs text-green-600 dark:text-green-400 mb-1">Price</p>
                <p className="font-bold text-lg">${result.price}</p>
              </div>
            </div>

            {result.listingUrl && (
              <a
                href={result.listingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 text-center font-medium mb-3"
              >
                View on eBay →
              </a>
            )}

            <button
              onClick={handleReset}
              className="block w-full px-4 py-2 border border-green-300 dark:border-green-700 text-green-700 dark:text-green-300 rounded-lg hover:bg-green-50 dark:hover:bg-green-900/30 text-center"
            >
              Create Another Listing
            </button>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700 rounded-xl p-5">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-6 h-6 text-red-600 flex-shrink-0" />
              <div className="flex-1">
                <h4 className="font-bold text-red-800 dark:text-red-200">Error</h4>
                <p className="text-sm text-red-700 dark:text-red-300 mt-1">{error}</p>
                <button
                  onClick={() => setError(null)}
                  className="mt-3 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm"
                >
                  Try Again
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Progress */}
        {isLoading && (
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-5">
            <h4 className="font-medium text-blue-800 dark:text-blue-200 mb-4">Creating listing...</h4>
            <div className="space-y-3">
              {QUICK_LIST_STEPS.map((step, index) => (
                <div key={step.id} className="flex items-center gap-3">
                  {index < (currentStep || 0) ? (
                    <CheckCircle className="w-5 h-5 text-green-500" />
                  ) : index === currentStep ? (
                    <Loader className="w-5 h-5 text-blue-500 animate-spin" />
                  ) : (
                    <div className="w-5 h-5 rounded-full border-2 border-gray-300 dark:border-gray-600" />
                  )}
                  <span className={`text-sm ${index <= (currentStep || 0) ? 'text-gray-800 dark:text-gray-200' : 'text-gray-400'}`}>
                    {step.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Form */}
        {!isLoading && !result && (
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Price */}
            <div>
              <label className="block text-sm font-semibold text-gray-200 mb-2">
                Listing Price *
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-lg font-medium">$</span>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="0.00"
                  className="w-full pl-10 pr-4 py-4 text-xl font-medium bg-gray-800 text-white border-2 border-gray-600 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 placeholder-gray-500"
                  required
                  disabled={!isConfigured}
                  autoFocus
                />
              </div>
            </div>

            {/* Quantity & Condition */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-200 mb-2">
                  Quantity
                </label>
                <input
                  type="number"
                  min="1"
                  max="10000"
                  value={quantity}
                  onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                  className="w-full px-4 py-3 bg-gray-800 text-white border-2 border-gray-600 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500"
                  disabled={!isConfigured}
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-200 mb-2">
                  Condition
                </label>
                <select
                  value={condition}
                  onChange={(e) => setCondition(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-800 text-white border-2 border-gray-600 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500"
                  disabled={!isConfigured}
                >
                  {DEFAULT_CONDITIONS.map(c => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={!price || !isConfigured || isLoading}
              className="w-full px-6 py-4 bg-green-600 text-white rounded-xl hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 font-bold text-lg shadow-lg shadow-green-600/30"
            >
              <ShoppingBag className="w-6 h-6" />
              Create eBay Listing
            </button>
          </form>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-gray-700 px-6 py-4 bg-gray-800">
        <a
          href={`/auto-list?asin=${product.asin}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-gray-400 hover:text-gray-200 flex items-center justify-center gap-2"
        >
          Open full Quick List page <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>
    </div>
  );
};

// Product Row Component
const ProductRow = ({ product, isSelected, isChecked, onCheck, onSelect, onEdit }) => {
  const amazonUrl = `https://amazon.com/dp/${product.asin}`;
  
  return (
    <tr 
      className={`border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer transition-colors ${
        isSelected ? 'bg-blue-50 dark:bg-blue-900/20' : ''
      } ${isChecked ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''}`}
      onClick={() => onSelect(product)}
    >
      {/* Checkbox */}
      <td className="py-3 px-3" onClick={e => e.stopPropagation()}>
        <input
          type="checkbox"
          checked={isChecked}
          onChange={(e) => onCheck(e.target.checked)}
          className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
        />
      </td>
      {/* Image */}
      <td className="py-3 px-4">
        <div className="w-12 h-12 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
          {product.image_url ? (
            <img src={product.image_url} alt={product.asin} className="w-full h-full object-cover" />
          ) : (
            <Package className="w-6 h-6 text-gray-400" />
          )}
        </div>
      </td>
      
      {/* ASIN */}
      <td className="py-3 px-4">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm">{product.asin}</span>
          <a
            href={amazonUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            className="text-gray-400 hover:text-blue-500"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
        {product.title && (
          <p className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-xs mt-0.5">
            {product.title}
          </p>
        )}
      </td>
      
      {/* Status */}
      <td className="py-3 px-4">
        <StatusBadge status={product.status?.name || 'Sourcing'} />
      </td>
      
      {/* Owners */}
      <td className="py-3 px-4">
        <OwnerAvatars owners={product.owners} />
      </td>
      
      {/* Decision */}
      <td className="py-3 px-4">
        <span className={`text-sm ${product.decision === 'sell' ? 'text-green-600' : product.decision === 'keep' ? 'text-blue-600' : 'text-gray-400'}`}>
          {product.decision ? product.decision.charAt(0).toUpperCase() + product.decision.slice(1) : '-'}
        </span>
      </td>
      
      {/* Important Date */}
      <td className="py-3 px-4">
        {product.important_date ? (
          <div className="text-sm">
            <span className={`${new Date(product.important_date) < new Date() ? 'text-red-500' : 'text-gray-600 dark:text-gray-300'}`}>
              {new Date(product.important_date).toLocaleDateString()}
            </span>
            {product.important_date_comment && (
              <p className="text-xs text-gray-400 truncate max-w-[100px]" title={product.important_date_comment}>
                {product.important_date_comment}
              </p>
            )}
          </div>
        ) : (
          <span className="text-gray-400 text-sm">-</span>
        )}
      </td>
      
      {/* Shipping */}
      <td className="py-3 px-4">
        {product.tracking_number ? (
          <ShippingBadge status={product.shipping_status} />
        ) : (
          <span className="text-gray-400 text-sm">-</span>
        )}
      </td>
      
      {/* Actions */}
      <td className="py-3 px-4">
        <button
          onClick={e => { e.stopPropagation(); onEdit(product); }}
          className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
        >
          <MoreVertical className="w-4 h-4" />
        </button>
      </td>
    </tr>
  );
};

// Import Modal - CSV Import with Column Mapping
const ImportModal = ({ isOpen, onClose, onImport, statuses }) => {
  const [csvData, setCsvData] = useState('');
  const [parsedRows, setParsedRows] = useState([]);
  const [headers, setHeaders] = useState([]);
  const [columnMapping, setColumnMapping] = useState({});
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState(1); // 1: paste CSV, 2: map columns, 3: preview
  const [validationWarnings, setValidationWarnings] = useState([]); // Track invalid values

  // Import fields - all map directly to database columns
  // Note: Keepa will auto-fill title, brand, category, image after import
  // Note: Owners can be assigned after import (uses separate junction table)
  const availableFields = [
    { key: 'asin', label: 'ASIN', required: true, dbColumn: 'asin' },
    { key: 'status', label: 'Status', configurable: true, dbColumn: 'status_id (lookup)' },
    { key: 'requirements', label: 'Requirements', dbColumn: 'requirements' },
    { key: 'decision', label: 'Decision', validValues: ['sell', 'keep'], dbColumn: 'decision' },
    { key: 'notes', label: 'Notes', dbColumn: 'notes' },
    { key: 'important_date', label: 'Important Date', dbColumn: 'important_date' },
    { key: 'important_date_comment', label: 'Date Comment', dbColumn: 'important_date_comment' },
  ];

  // Download template CSV
  const downloadTemplate = () => {
    const headers = availableFields.map(f => f.key).join(',');
    const exampleRow = 'B01EXAMPLE,Initial Contact,Must have this item,sell,Additional notes,2026-02-01,Deadline for purchase';
    const csv = headers + '\n' + exampleRow + '\n';
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'product-import-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  // Validate row values against user's configured options
  const validateRows = (rows, mapping) => {
    const warnings = [];
    const validStatusNames = statuses?.map(s => s.name.toLowerCase()) || [];
    const validDecisions = ['sell', 'keep'];

    rows.forEach((row, rowIndex) => {
      Object.entries(mapping).forEach(([colIndex, fieldKey]) => {
        const value = row[colIndex]?.trim();
        if (!value) return;

        // Validate status
        if (fieldKey === 'status' && !validStatusNames.includes(value.toLowerCase())) {
          warnings.push({
            rowIndex,
            field: 'status',
            value,
            message: `Status "${value}" not found - will be left blank`
          });
        }

        // Validate decision
        if (fieldKey === 'decision' && !validDecisions.includes(value.toLowerCase())) {
          warnings.push({
            rowIndex,
            field: 'decision',
            value,
            message: `Decision must be "sell" or "keep" - will be left blank`
          });
        }
      });
    });

    return warnings;
  };

  const resetModal = () => {
    setCsvData('');
    setParsedRows([]);
    setHeaders([]);
    setColumnMapping({});
    setError('');
    setStep(1);
    setValidationWarnings([]);
  };

  const handleClose = () => {
    resetModal();
    onClose();
  };

  const parseCSV = (text) => {
    const lines = text.trim().split('\n');
    if (lines.length < 2) {
      setError('CSV must have at least a header row and one data row');
      return;
    }
    
    // Parse header
    const headerRow = lines[0].split(/[,\t]/).map(h => h.trim().replace(/^"|"$/g, ''));
    setHeaders(headerRow);
    
    // Auto-map columns by name matching
    const autoMapping = {};
    headerRow.forEach((header, index) => {
      const lowerHeader = header.toLowerCase();
      availableFields.forEach(field => {
        if (lowerHeader.includes(field.key.toLowerCase()) || 
            lowerHeader.includes(field.label.toLowerCase())) {
          autoMapping[index] = field.key;
        }
      });
    });
    setColumnMapping(autoMapping);
    
    // Parse data rows
    const rows = lines.slice(1).map(line => {
      const values = line.split(/[,\t]/).map(v => v.trim().replace(/^"|"$/g, ''));
      return values;
    }).filter(row => row.some(cell => cell)); // Filter empty rows
    
    setParsedRows(rows);
    setError('');
    setStep(2);
  };

  // Handle file upload (CSV or XLSX)
  const handleFileDrop = useCallback((acceptedFiles) => {
    const file = acceptedFiles[0];
    if (!file) return;

    setError('');
    const reader = new FileReader();

    if (file.name.endsWith('.csv') || file.name.endsWith('.txt')) {
      // Handle CSV/TXT files
      reader.onload = (e) => {
        const text = e.target.result;
        parseCSV(text);
      };
      reader.readAsText(file);
    } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
      // Handle Excel files
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });
          
          if (jsonData.length < 2) {
            setError('File must have at least a header row and one data row');
            return;
          }

          // First row is headers
          const headerRow = jsonData[0].map(h => (h || '').toString().trim());
          setHeaders(headerRow);

          // Auto-map columns
          const autoMapping = {};
          headerRow.forEach((header, index) => {
            const lowerHeader = header.toLowerCase();
            availableFields.forEach(field => {
              if (lowerHeader.includes(field.key.toLowerCase()) || 
                  lowerHeader.includes(field.label.toLowerCase())) {
                autoMapping[index] = field.key;
              }
            });
          });
          setColumnMapping(autoMapping);

          // Rest are data rows
          const rows = jsonData.slice(1)
            .map(row => row.map(cell => (cell || '').toString().trim()))
            .filter(row => row.some(cell => cell));
          
          setParsedRows(rows);
          setStep(2);
        } catch (err) {
          setError('Failed to parse Excel file: ' + err.message);
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      setError('Please upload a CSV or Excel file (.csv, .xlsx, .xls)');
    }
  }, [availableFields]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: handleFileDrop,
    accept: {
      'text/csv': ['.csv'],
      'text/plain': ['.txt'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls']
    },
    multiple: false
  });

  // Move to step 3 with validation
  const goToPreview = () => {
    const warnings = validateRows(parsedRows, columnMapping);
    setValidationWarnings(warnings);
    setStep(3);
  };

  const handleImport = async () => {
    // Check if ASIN is mapped
    const asinMapped = Object.values(columnMapping).includes('asin');
    if (!asinMapped) {
      setError('ASIN column is required');
      return;
    }
    
    setIsImporting(true);
    setError('');
    
    try {
      // Get sets of invalid values by row for quick lookup
      const invalidByRow = {};
      validationWarnings.forEach(w => {
        if (!invalidByRow[w.rowIndex]) invalidByRow[w.rowIndex] = new Set();
        invalidByRow[w.rowIndex].add(w.field);
      });

      // Valid status and decision values for filtering
      const validStatusNames = statuses?.map(s => s.name.toLowerCase()) || [];
      const validDecisions = ['sell', 'keep'];

      // Transform rows based on mapping, filtering invalid values
      const products = parsedRows.map((row, rowIndex) => {
        const product = {};
        Object.entries(columnMapping).forEach(([colIndex, fieldKey]) => {
          const value = row[colIndex]?.trim();
          if (!fieldKey || !value) return;

          // Skip invalid configurable values
          if (fieldKey === 'status' && !validStatusNames.includes(value.toLowerCase())) {
            return; // Leave blank
          }
          if (fieldKey === 'decision' && !validDecisions.includes(value.toLowerCase())) {
            return; // Leave blank
          }

          product[fieldKey] = value;
        });
        return product;
      }).filter(p => p.asin); // Only include rows with ASIN
      
      await onImport(products);
      handleClose();
    } catch (err) {
      setError('Import failed: ' + (err.message || 'Unknown error'));
    } finally {
      setIsImporting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            Import Products {step > 1 && `- Step ${step} of 3`}
          </h2>
          <button onClick={handleClose} className="text-gray-500 hover:text-gray-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[60vh]">
          {error && (
            <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg">
              {error}
            </div>
          )}

          {/* Step 1: Upload File or Paste CSV */}
          {step === 1 && (
            <div className="space-y-4">
              {/* Accepted columns info */}
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-blue-800 dark:text-blue-200 mb-1">
                      Accepted Columns:
                    </p>
                    <p className="text-xs text-blue-600 dark:text-blue-300">
                      <strong>ASIN</strong> (required), Status*, Requirements, Decision*, Notes, Important Date, Date Comment
                    </p>
                    <p className="text-xs text-blue-500 dark:text-blue-400 mt-1 italic">
                      * Status must match your configured statuses. Decision must be "sell" or "keep".
                    </p>
                    <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                      📦 Product details (title, brand, category, image) auto-filled by Keepa. Owners can be assigned after import.
                    </p>
                  </div>
                  <button
                    onClick={downloadTemplate}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"
                  >
                    <Download className="w-4 h-4" />
                    Template
                  </button>
                </div>
              </div>

              {/* File Upload Dropzone */}
              <div
                {...getRootProps()}
                className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                  isDragActive 
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' 
                    : 'border-gray-300 dark:border-gray-600 hover:border-blue-400 dark:hover:border-blue-500'
                }`}
              >
                <input {...getInputProps()} />
                <Upload className={`w-10 h-10 mx-auto mb-3 ${isDragActive ? 'text-blue-500' : 'text-gray-400'}`} />
                {isDragActive ? (
                  <p className="text-blue-600 dark:text-blue-400 font-medium">Drop the file here...</p>
                ) : (
                  <>
                    <p className="text-gray-600 dark:text-gray-300 font-medium">
                      Drag & drop a CSV or Excel file here
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                      or click to browse (.csv, .xlsx, .xls)
                    </p>
                  </>
                )}
              </div>

              {/* Divider */}
              <div className="flex items-center gap-4">
                <div className="flex-1 border-t border-gray-300 dark:border-gray-600"></div>
                <span className="text-sm text-gray-500 dark:text-gray-400">OR</span>
                <div className="flex-1 border-t border-gray-300 dark:border-gray-600"></div>
              </div>

              {/* Paste CSV */}
              <div>
                <p className="text-gray-600 dark:text-gray-300 mb-2">
                  Paste your CSV or tab-separated data below:
                </p>
                <textarea
                  value={csvData}
                  onChange={e => setCsvData(e.target.value)}
                  placeholder="asin,status,requirements&#10;B00ABC123,Initial Contact,Must source this&#10;B01XYZ789,Committed,High priority item&#10;..."
                  rows={8}
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono text-sm"
                />
              </div>
            </div>
          )}

          {/* Step 2: Map Columns */}
          {step === 2 && (
            <div className="space-y-4">
              <p className="text-gray-600 dark:text-gray-300">
                Map your CSV columns to product fields. ASIN is required.
              </p>
              <div className="grid grid-cols-2 gap-4">
                {headers.map((header, index) => (
                  <div key={index} className="flex items-center gap-3">
                    <span className="text-sm text-gray-600 dark:text-gray-400 w-32 truncate" title={header}>
                      {header}
                    </span>
                    <span className="text-gray-400">→</span>
                    <select
                      value={columnMapping[index] || ''}
                      onChange={e => setColumnMapping(prev => ({ ...prev, [index]: e.target.value }))}
                      className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                    >
                      <option value="">-- Skip --</option>
                      {availableFields.map(field => (
                        <option key={field.key} value={field.key}>
                          {field.label} {field.required && '*'}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Step 3: Preview */}
          {step === 3 && (
            <div className="space-y-4">
              <p className="text-gray-600 dark:text-gray-300">
                Preview: {parsedRows.length} products will be imported
              </p>

              {/* Validation Warnings */}
              {validationWarnings.length > 0 && (
                <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200 mb-2">
                        {validationWarnings.length} value(s) will be left blank:
                      </p>
                      <ul className="text-xs text-yellow-700 dark:text-yellow-300 space-y-1 max-h-24 overflow-y-auto">
                        {validationWarnings.slice(0, 10).map((warning, i) => (
                          <li key={i}>
                            Row {warning.rowIndex + 1}: {warning.message}
                          </li>
                        ))}
                        {validationWarnings.length > 10 && (
                          <li className="italic">...and {validationWarnings.length - 10} more</li>
                        )}
                      </ul>
                    </div>
                  </div>
                </div>
              )}

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-100 dark:bg-gray-700">
                      {Object.entries(columnMapping)
                        .filter(([_, field]) => field)
                        .map(([colIndex, field]) => (
                          <th key={colIndex} className="px-3 py-2 text-left">
                            {availableFields.find(f => f.key === field)?.label || field}
                          </th>
                        ))}
                    </tr>
                  </thead>
                  <tbody>
                    {parsedRows.slice(0, 5).map((row, rowIndex) => {
                      const rowWarnings = validationWarnings.filter(w => w.rowIndex === rowIndex);
                      return (
                        <tr key={rowIndex} className={`border-b dark:border-gray-600 ${rowWarnings.length > 0 ? 'bg-yellow-50 dark:bg-yellow-900/10' : ''}`}>
                          {Object.entries(columnMapping)
                            .filter(([_, field]) => field)
                            .map(([colIndex, fieldKey]) => {
                              const hasWarning = rowWarnings.some(w => w.field === fieldKey);
                              return (
                                <td key={colIndex} className={`px-3 py-2 truncate max-w-[150px] ${hasWarning ? 'text-yellow-600 dark:text-yellow-400' : ''}`}>
                                  {hasWarning && <AlertCircle className="w-3 h-3 inline mr-1" />}
                                  {row[colIndex] || '-'}
                                </td>
                              );
                            })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {parsedRows.length > 5 && (
                  <p className="text-sm text-gray-500 mt-2">
                    ...and {parsedRows.length - 5} more rows
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-between">
          <button
            onClick={step === 1 ? handleClose : () => setStep(step - 1)}
            className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
          >
            {step === 1 ? 'Cancel' : 'Back'}
          </button>
          <button
            onClick={() => {
              if (step === 1) parseCSV(csvData);
              else if (step === 2) goToPreview();
              else handleImport();
            }}
            disabled={isImporting || (step === 1 && !csvData.trim())}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isImporting ? (
              <>
                <Loader className="w-4 h-4 animate-spin" />
                Importing...
              </>
            ) : step === 3 ? (
              'Import Products'
            ) : (
              'Next'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

// Add Product Modal
const AddProductModal = ({ isOpen, onClose, onAdd, statuses }) => {
  const [asin, setAsin] = useState('');
  const [statusId, setStatusId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (statuses?.length && !statusId) {
      // Default to "Initial Contact" (first status in the list)
      const defaultStatus = statuses.find(s => s.name === 'Initial Contact') || statuses[0];
      if (defaultStatus) setStatusId(defaultStatus.id);
    }
  }, [statuses, statusId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    
    // Validate ASIN
    const cleanAsin = asin.trim().toUpperCase();
    if (!/^B[0-9A-Z]{9}$/.test(cleanAsin)) {
      setError('Invalid ASIN format. Should be like B0XXXXXXXXX');
      return;
    }
    
    setIsSubmitting(true);
    try {
      await onAdd({ asin: cleanAsin, status_id: statusId });
      setAsin('');
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to add product');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Add Product</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                ASIN
              </label>
              <input
                type="text"
                value={asin}
                onChange={e => setAsin(e.target.value)}
                placeholder="B0XXXXXXXXX"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Initial Status
              </label>
              <select
                value={statusId}
                onChange={e => setStatusId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                {statuses?.map(status => (
                  <option key={status.id} value={status.id}>{status.name}</option>
                ))}
              </select>
            </div>
            
            {error && (
              <p className="text-red-500 text-sm">{error}</p>
            )}
          </div>
          
          <div className="flex justify-end gap-3 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
            >
              {isSubmitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Add Product
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Decline Task Dialog
const DeclineTaskDialog = ({ isOpen, onClose, onConfirm, isSubmitting }) => {
  const [reason, setReason] = useState('');
  
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-sm p-5 mx-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Decline Task</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Optionally provide a reason for declining this task.
          </p>
          <textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="Reason (optional)..."
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white resize-none"
          />
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(reason)}
            disabled={isSubmitting}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center gap-2"
          >
            {isSubmitting ? <Loader className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
            Decline
          </button>
        </div>
      </div>
    </div>
  );
};

// Bulk Edit Modal
const BulkEditModal = ({ isOpen, onClose, selectedCount, statuses, availableOwners, onApply }) => {
  const [changes, setChanges] = useState({
    status_id: '',
    decision: '',
    ownerAction: '',
    ownerIds: []
  });

  const handleApply = () => {
    const changesObj = {};
    if (changes.status_id) changesObj.status_id = changes.status_id;
    if (changes.decision) changesObj.decision = changes.decision;
    if (changes.ownerAction) {
      changesObj.ownerAction = changes.ownerAction;
      changesObj.ownerIds = changes.ownerIds;
    }
    onApply(changesObj);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md p-6 mx-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Edit {selectedCount} Products
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-5">
          {/* Status */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Status
            </label>
            <select
              value={changes.status_id}
              onChange={(e) => setChanges(prev => ({ ...prev, status_id: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              <option value="">— Don't change —</option>
              {statuses.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          {/* Decision */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Decision
            </label>
            <select
              value={changes.decision}
              onChange={(e) => setChanges(prev => ({ ...prev, decision: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              <option value="">— Don't change —</option>
              <option value="sell">Sell</option>
              <option value="keep">Keep</option>
              <option value="clear">Clear (remove decision)</option>
            </select>
          </div>

          {/* Owners */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Owners
            </label>
            <select
              value={changes.ownerAction}
              onChange={(e) => setChanges(prev => ({ ...prev, ownerAction: e.target.value, ownerIds: [] }))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              <option value="">— Don't change —</option>
              <option value="add">Add owners</option>
              <option value="remove">Remove owners</option>
              <option value="set">Set owners (replace existing)</option>
            </select>
            
            {changes.ownerAction && (
              <div className="mt-3 space-y-2">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {changes.ownerAction === 'add' && 'Select owners to add:'}
                  {changes.ownerAction === 'remove' && 'Select owners to remove:'}
                  {changes.ownerAction === 'set' && 'Select owners to assign:'}
                </p>
                <div className="max-h-32 overflow-y-auto border border-gray-200 dark:border-gray-600 rounded-lg">
                  {availableOwners?.map(owner => (
                    <label key={owner.id} className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={changes.ownerIds.includes(owner.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setChanges(prev => ({ ...prev, ownerIds: [...prev.ownerIds, owner.id] }));
                          } else {
                            setChanges(prev => ({ ...prev, ownerIds: prev.ownerIds.filter(id => id !== owner.id) }));
                          }
                        }}
                        className="w-4 h-4 rounded border-gray-300"
                      />
                      <span className="text-sm text-gray-700 dark:text-gray-300">{owner.name || owner.email}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            disabled={!changes.status_id && !changes.decision && !changes.ownerAction}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Apply to {selectedCount} Products
          </button>
        </div>
      </div>
    </div>
  );
};

// Product Detail Panel
const ProductDetailPanel = ({ product, onClose, onUpdate, onDelete, onOwnersChange, statuses, collaborationTypes, contactSources, marketplaces }) => {
  // Resizable panel state
  const [panelWidth, setPanelWidth] = useState(() => {
    const saved = localStorage.getItem('crm-panel-width');
    return saved ? parseInt(saved, 10) : 672; // 672px = max-w-2xl default
  });
  const [isResizing, setIsResizing] = useState(false);
  const panelRef = useRef(null);
  
  // Side panel states (separate panels to the right)
  const [showQuickList, setShowQuickList] = useState(false);
  const [showACFPanel, setShowACFPanel] = useState(false);
  
  // Handle panel resize
  useEffect(() => {
    if (!isResizing) return;
    
    const handleMouseMove = (e) => {
      const newWidth = window.innerWidth - e.clientX;
      const clampedWidth = Math.min(800, Math.max(400, newWidth));
      setPanelWidth(clampedWidth);
    };
    
    const handleMouseUp = () => {
      setIsResizing(false);
      localStorage.setItem('crm-panel-width', panelWidth.toString());
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, panelWidth]);
  
  // Handle ESC key to close panel
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && product) {
        onClose();
      }
    };
    
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [product, onClose]);
  
  // Close ACF panel when product changes
  useEffect(() => {
    if (product?.asin) {
      setShowACFPanel(false);
    }
  }, [product?.asin]);
  
  if (!product) return null;

  const amazonUrl = `https://amazon.com/dp/${product.asin}`;

  return (
    <>
      {/* Overlay for click-outside-to-close */}
      <div 
        className="fixed inset-0 bg-black/30 z-30"
        onClick={onClose}
      />
      
      <div 
        ref={panelRef}
        style={{ 
          width: `${panelWidth}px`,
          right: (showQuickList || showACFPanel) ? '480px' : '0px',
          transition: 'right 0.3s ease-in-out'
        }}
        className="fixed top-16 bottom-0 bg-white dark:bg-gray-800 shadow-xl border-l border-gray-200 dark:border-gray-700 overflow-y-auto z-40"
      >
        {/* Drag handle for resizing */}
        <div
          className="absolute left-0 top-0 bottom-0 w-1.5 cursor-ew-resize bg-transparent hover:bg-blue-500/30 transition-colors z-50"
          onMouseDown={(e) => {
            e.preventDefault();
            setIsResizing(true);
          }}
        >
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-12 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
            <GripVertical className="w-3 h-3 text-gray-400" />
          </div>
        </div>
        
        {/* Header with prominent close button */}
        <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between z-10">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Product Details</h3>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => {
                if (window.confirm('Are you sure you want to delete this product? This cannot be undone.')) {
                  onDelete(product.id);
                }
              }} 
              className="w-8 h-8 flex items-center justify-center text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
              title="Delete product"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <button 
              onClick={onClose} 
              className="w-8 h-8 flex items-center justify-center text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              title="Close panel (ESC)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      
      <div className="p-6 space-y-5">
        {/* Compact Product Info Row - Image + ASIN side by side */}
        <div className="flex gap-4 items-start">
          {/* Small Image */}
          <div className="w-24 h-24 flex-shrink-0 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-700">
            {product.image_url ? (
              <img src={product.image_url} alt={product.asin} className="w-full h-full object-contain" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Package className="w-8 h-8 text-gray-400" />
              </div>
            )}
          </div>
          
          {/* ASIN Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-mono text-sm font-medium">{product.asin}</span>
              <a
                href={amazonUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-700"
                title="View on Amazon"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>
            {product.title && (
              <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">{product.title}</p>
            )}
          </div>
        </div>
        
        {/* Status */}
        <CustomizableDropdown
          table="crm_statuses"
          value={product.status_id}
          onChange={id => onUpdate({ status_id: id })}
          label="Status"
          showColor={true}
          placeholder="Select status..."
        />
        
        {/* Decision */}
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">Decision</h4>
          <select
            value={product.decision || ''}
            onChange={e => onUpdate({ decision: e.target.value || null })}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          >
            <option value="">Undecided</option>
            <option value="keep">Keep</option>
            <option value="sell">Sell</option>
          </select>
        </div>
        
        {/* Marketplace (when Sell) */}
        {product.decision === 'sell' && (
          <div className="space-y-4">
            <CustomizableDropdown
              table="crm_marketplaces"
              value={product.marketplace_id}
              onChange={id => onUpdate({ marketplace_id: id })}
              label="Marketplace"
              placeholder="Select marketplace..."
            />
            {/* Quick List Button - Shows when eBay is selected */}
            {(() => {
              // Check if marketplace is eBay (by name from loaded data or by lookup)
              const selectedMarketplace = marketplaces?.find(m => m.id === product.marketplace_id);
              const marketplaceName = product.marketplace?.name || selectedMarketplace?.name;
              return marketplaceName === 'eBay' ? (
                <button
                  onClick={() => {
                    setShowACFPanel(false); // Close ACF if open (mutual exclusion)
                    setShowQuickList(true);
                  }}
                  className="w-full px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center justify-center gap-2 font-medium shadow-lg shadow-green-600/20"
                >
                  <ShoppingBag className="w-5 h-5" />
                  Quick List to eBay
                </button>
              ) : null;
            })()}
          </div>
        )}
        
        {/* Task Review Section - Shows for Delivered products */}
        {product.status?.name === 'Delivered' && !product.decision && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
              📬 Product Delivered - Take Action
            </h4>
            <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-lg p-4 space-y-3">
              <p className="text-sm text-emerald-800 dark:text-emerald-200">
                This product has been delivered! What would you like to do with it?
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => onUpdate({ decision: 'sell' })}
                  className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center justify-center gap-2"
                >
                  <ThumbsUp className="w-4 h-4" />
                  Sell It
                </button>
                <button
                  onClick={() => onUpdate({ decision: 'keep' })}
                  className="flex-1 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 flex items-center justify-center gap-2"
                >
                  <Eye className="w-4 h-4" />
                  Keep It
                </button>
              </div>
            </div>
          </div>
        )}
        
        {/* Owners */}
        <OwnerSelector
          selectedOwners={product.owners?.map(o => ({ owner_id: o.id, is_primary: o.is_primary })) || []}
          onChange={(newOwners) => onOwnersChange(product.id, newOwners)}
        />
        
        {/* Collaboration Type */}
        <CustomizableDropdown
          table="crm_collaboration_types"
          value={product.collaboration_type_id}
          onChange={id => onUpdate({ collaboration_type_id: id })}
          label="Collaboration Type"
          placeholder="Select type..."
        />
        
        {/* Contact Source */}
        <CustomizableDropdown
          table="crm_contact_sources"
          value={product.contact_source_id}
          onChange={id => onUpdate({ contact_source_id: id })}
          label="Contact Source"
          placeholder="Select source..."
        />
        
        {/* Requirements */}
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">Requirements</h4>
          <textarea
            value={product.requirements || ''}
            onChange={e => onUpdate({ requirements: e.target.value })}
            placeholder="Enter brand requirements, notes..."
            rows={4}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white resize-none"
          />
        </div>
        
        {/* Important Date Date & Comment */}
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">Important Date</h4>
          <div className="flex gap-3">
            <input
              type="date"
              value={product.important_date || ''}
              onChange={e => onUpdate({ important_date: e.target.value || null })}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
          </div>
          <textarea
            value={product.important_date_comment || ''}
            onChange={e => onUpdate({ important_date_comment: e.target.value })}
            placeholder="Add important date notes..."
            rows={2}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white resize-none"
          />
        </div>
        
        {/* Shipping */}
        {product.tracking_number && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">Shipping</h4>
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">Tracking</span>
                <span className="font-mono text-sm">{product.tracking_number}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">Carrier</span>
                <span className="text-sm uppercase">{product.carrier || 'Auto-detect'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">Status</span>
                <ShippingBadge status={product.shipping_status} />
              </div>
              {product.shipping_eta && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">ETA</span>
                  <span className="text-sm">{new Date(product.shipping_eta).toLocaleDateString()}</span>
                </div>
              )}
            </div>
          </div>
        )}
        
        {/* Add Tracking (if no tracking) */}
        {!product.tracking_number && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">Shipping</h4>
            <button className="w-full px-4 py-2 border border-dashed border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 rounded-lg hover:border-gray-400 hover:text-gray-700 flex items-center justify-center gap-2">
              <Truck className="w-4 h-4" />
              Add Tracking Number
            </button>
          </div>
        )}
        
        {/* ASIN Correlation Finder - Opens Side Panel */}
        <div className="space-y-2 pt-4 border-t border-gray-200 dark:border-gray-700">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">ASIN Correlation Finder</h4>
          <button
            onClick={() => {
              setShowQuickList(false); // Close Quick List if open (mutual exclusion)
              setShowACFPanel(true);
            }}
            className="w-full px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 flex items-center justify-center gap-2"
          >
            <Zap className="w-4 h-4" />
            Find Similar Products
          </button>
        </div>
        
        {/* Done button at bottom */}
        <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors font-medium"
          >
            Done
          </button>
        </div>
      </div>
      
    </div>
    
    {/* Quick List Panel - Separate panel to the RIGHT of detail panel */}
    <QuickListPanel
      product={product}
      isOpen={showQuickList}
      onClose={() => setShowQuickList(false)}
    />
    
    {/* ASIN Correlation Panel - Separate panel to the RIGHT of detail panel */}
    <ASINCorrelationPanel
      product={product}
      isOpen={showACFPanel}
      onClose={() => setShowACFPanel(false)}
    />
    </>
  );
};

// Main ProductCRM Component
export default function ProductCRM() {
  const [searchParams] = useSearchParams();
  const [products, setProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState(new Set()); // Multi-select: Set of status IDs
  const [statusFilterOpen, setStatusFilterOpen] = useState(false);
  const [ownerFilter, setOwnerFilter] = useState('');
  const [availableOwners, setAvailableOwners] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  
  // Bulk selection state
  const [selectedProducts, setSelectedProducts] = useState(new Set());
  const [showBulkEditModal, setShowBulkEditModal] = useState(false);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);
  
  // View mode: 'all' or 'delivered'
  const [viewMode, setViewMode] = useState(searchParams.get('view') === 'delivered' ? 'delivered' : searchParams.get('view') === 'all' ? 'all' : 'open');
  
  // Lookup data
  const [statuses, setStatuses] = useState([]);
  const [collaborationTypes, setCollaborationTypes] = useState([]);
  const [contactSources, setContactSources] = useState([]);
  const [marketplaces, setMarketplaces] = useState([]);

  // Fetch products
  const fetchProducts = useCallback(async () => {
    try {
      setIsLoading(true);
      
      // Build query - fetch products with basic relations (skip owner join due to schema cache)
      let query = supabase
        .from('sourced_products')
        .select(`
          *,
          status:crm_statuses(id, name, color),
          collaboration_type:crm_collaboration_types(id, name),
          contact_source:crm_contact_sources(id, name),
          marketplace:crm_marketplaces(id, name, has_quick_list),
          owners:product_owners(owner_id, is_primary)
        `)
        .order('created_at', { ascending: false });
      
      if (searchQuery) {
        query = query.ilike('asin', `%${searchQuery}%`);
      }
      
      // Note: Status filter is applied client-side for multi-select support
      
      const { data, error } = await query;
      
      if (error) throw error;
      
      // Fetch all crm_owners for the current user to resolve owner details
      const { data: allOwners } = await supabase
        .from('crm_owners')
        .select('id, name, email, avatar_color');
      
      // Store available owners for filter dropdown
      setAvailableOwners(allOwners || []);
      
      const ownerMap = new Map((allOwners || []).map(o => [o.id, o]));
      
      // Transform owners data - map owner_id to owner details
      const transformedData = data?.map(product => ({
        ...product,
        owners: product.owners?.map(po => {
          const owner = ownerMap.get(po.owner_id);
          return {
            id: po.owner_id,
            is_primary: po.is_primary,
            name: owner?.name || 'Unknown',
            email: owner?.email,
            avatar_color: owner?.avatar_color || '#3B82F6'
          };
        }) || []
      }));
      
      setProducts(transformedData || []);
    } catch (err) {
      console.error('Error fetching products:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [searchQuery]);

  // Fetch lookup data
  const fetchLookups = useCallback(async () => {
    try {
      const [statusRes, collabRes, sourceRes, marketRes] = await Promise.all([
        supabase.from('crm_statuses').select('*').order('sort_order'),
        supabase.from('crm_collaboration_types').select('*').order('name'),
        supabase.from('crm_contact_sources').select('*').order('name'),
        supabase.from('crm_marketplaces').select('*').order('name')
      ]);
      
      setStatuses(statusRes.data || []);
      setCollaborationTypes(collabRes.data || []);
      setContactSources(sourceRes.data || []);
      setMarketplaces(marketRes.data || []);
    } catch (err) {
      console.error('Error fetching lookups:', err);
    }
  }, []);

  useEffect(() => {
    fetchProducts();
    fetchLookups();
  }, [fetchProducts, fetchLookups]);

  // Initialize status filter with all statuses except Delivered and Completed
  useEffect(() => {
    if (statuses.length > 0 && statusFilter.size === 0) {
      const defaultStatuses = new Set(
        statuses
          .filter(s => s.name !== 'Delivered' && s.name !== 'Completed')
          .map(s => s.id)
      );
      setStatusFilter(defaultStatuses);
    }
  }, [statuses]);

  // Fetch product data from Keepa (with fallback to direct image URL)
  const fetchKeepaData = async (asin) => {
    try {
      const token = await userAPI.getAuthToken();
      const response = await fetch(`/.netlify/functions/keepa-lookup?asin=${asin}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      // Check if response is JSON (not HTML error page)
      const contentType = response.headers.get('content-type');
      if (!response.ok || !contentType?.includes('application/json')) {
        console.log('Keepa function unavailable, using direct image URL');
        return null;
      }
      const data = await response.json();
      return data;
    } catch (err) {
      console.log('Keepa fetch failed, using direct image URL:', err.message);
      return null;
    }
  };

  // Add product
  const handleAddProduct = async (productData) => {
    const { data: userData } = await supabase.auth.getUser();
    
    // Try to fetch Keepa data for image and title (falls back to direct Keepa URL)
    const keepaData = await fetchKeepaData(productData.asin);
    
    // Use Keepa's direct image URL - works without API call
    // Format: https://images.keepa.com/600/{ASIN}.jpg
    const enrichedData = {
      ...productData,
      user_id: userData.user.id,
      image_url: keepaData?.imageUrl || `https://images.keepa.com/600/${productData.asin}.jpg`,
      title: keepaData?.title || null
    };
    
    const { data, error } = await supabase
      .from('sourced_products')
      .insert(enrichedData)
      .select()
      .single();
    
    if (error) throw error;
    
    // Note: Owners are intentionally left empty - user can add owners manually
    
    fetchProducts();
  };

  // Update product - saves to DB and updates local state (NO full refresh to avoid losing focus/text)
  const handleUpdateProduct = async (updates) => {
    if (!selectedProduct) return;
    
    const { error } = await supabase
      .from('sourced_products')
      .update(updates)
      .eq('id', selectedProduct.id);
    
    if (error) {
      console.error('Error updating product:', error);
      return;
    }
    
    // Resolve lookup fields so UI updates immediately
    const resolvedUpdates = { ...updates };
    if (updates.status_id) {
      resolvedUpdates.status = statuses.find(s => s.id === updates.status_id) || null;
    }
    if (updates.collaboration_type_id) {
      resolvedUpdates.collaboration_type = collaborationTypes.find(c => c.id === updates.collaboration_type_id) || null;
    }
    if (updates.contact_source_id) {
      resolvedUpdates.contact_source = contactSources.find(c => c.id === updates.contact_source_id) || null;
    }
    if (updates.marketplace_id) {
      resolvedUpdates.marketplace = marketplaces.find(m => m.id === updates.marketplace_id) || null;
    }
    
    // Update local state for both selected product AND products list
    setSelectedProduct(prev => ({ ...prev, ...resolvedUpdates }));
    setProducts(prev => prev.map(p => 
      p.id === selectedProduct.id ? { ...p, ...resolvedUpdates } : p
    ));
    // NOTE: Removed fetchProducts() - it was causing refresh that lost text input focus
  };

  // Delete product
  const handleDeleteProduct = async (productId) => {
    const { error } = await supabase
      .from('sourced_products')
      .delete()
      .eq('id', productId);
    
    if (error) {
      console.error('Error deleting product:', error);
      alert('Failed to delete product: ' + error.message);
      return;
    }
    
    // Remove from local state and close panel
    setProducts(prev => prev.filter(p => p.id !== productId));
    setSelectedProduct(null);
  };

  // Bulk delete products
  const handleBulkDelete = async () => {
    const productIds = Array.from(selectedProducts);
    
    try {
      // Delete from product_owners first (foreign key constraint)
      await supabase.from('product_owners').delete().in('product_id', productIds);
      
      // Delete products
      const { error } = await supabase.from('sourced_products').delete().in('id', productIds);
      
      if (error) throw error;
      
      setSelectedProducts(new Set());
      setShowBulkDeleteConfirm(false);
      fetchProducts();
    } catch (err) {
      console.error('Bulk delete error:', err);
      alert('Failed to delete products: ' + err.message);
    }
  };

  // Bulk edit products
  const handleBulkEdit = async (changes) => {
    const productIds = Array.from(selectedProducts);
    
    try {
      // Build update object (only include changed fields)
      const updates = {};
      if (changes.status_id) updates.status_id = changes.status_id;
      if (changes.decision === 'clear') updates.decision = null;
      else if (changes.decision) updates.decision = changes.decision;
      
      // Update products if there are field changes
      if (Object.keys(updates).length > 0) {
        const { error } = await supabase.from('sourced_products').update(updates).in('id', productIds);
        if (error) throw error;
      }
      
      // Handle owner changes
      if (changes.ownerAction === 'set') {
        // Delete all existing owners, add new ones
        await supabase.from('product_owners').delete().in('product_id', productIds);
        if (changes.ownerIds?.length > 0) {
          const ownerInserts = productIds.flatMap(pid => 
            changes.ownerIds.map(oid => ({ product_id: pid, owner_id: oid, is_primary: false }))
          );
          await supabase.from('product_owners').insert(ownerInserts);
        }
      } else if (changes.ownerAction === 'add' && changes.ownerIds?.length > 0) {
        // Add owners (ignore duplicates)
        const ownerInserts = productIds.flatMap(pid => 
          changes.ownerIds.map(oid => ({ product_id: pid, owner_id: oid, is_primary: false }))
        );
        await supabase.from('product_owners').upsert(ownerInserts, { 
          onConflict: 'product_id,owner_id',
          ignoreDuplicates: true 
        });
      } else if (changes.ownerAction === 'remove' && changes.ownerIds?.length > 0) {
        // Remove specific owners from selected products
        for (const oid of changes.ownerIds) {
          await supabase.from('product_owners').delete()
            .in('product_id', productIds)
            .eq('owner_id', oid);
        }
      }
      
      setSelectedProducts(new Set());
      setShowBulkEditModal(false);
      fetchProducts();
    } catch (err) {
      console.error('Bulk edit error:', err);
      alert('Failed to update products: ' + err.message);
    }
  };

  // Import products from CSV
  // Enrich product with Keepa data
  const enrichProductWithKeepa = async (productId, asin) => {
    try {
      const response = await fetch(`/.netlify/functions/keepa-lookup?asin=${asin}`);
      if (!response.ok) return null;
      
      const keepaData = await response.json();
      if (!keepaData || keepaData.error) return null;
      
      // Update product with Keepa data
      const { error } = await supabase
        .from('sourced_products')
        .update({
          title: keepaData.title,
          image_url: keepaData.imageUrl,
          brand: keepaData.brand,
          category: keepaData.category,
        })
        .eq('id', productId);
      
      if (error) console.error('Error updating product with Keepa data:', error);
      return keepaData;
    } catch (err) {
      console.error('Keepa enrichment failed for', asin, err);
      return null;
    }
  };

  const handleImportProducts = async (products) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // Find status by name if provided, otherwise use default
    const getStatusId = (statusName) => {
      if (!statusName) return statuses.find(s => s.name === 'Initial Contact')?.id || statuses[0]?.id;
      const found = statuses.find(s => s.name.toLowerCase() === statusName.toLowerCase());
      return found?.id || statuses.find(s => s.name === 'Initial Contact')?.id || statuses[0]?.id;
    };

    // Prepare products for insert (without title/brand/category - Keepa will provide)
    const productsToInsert = products.map(p => ({
      user_id: user.id,
      asin: p.asin?.toUpperCase(),
      status_id: getStatusId(p.status),
      decision: ['sell', 'keep'].includes(p.decision?.toLowerCase()) ? p.decision.toLowerCase() : null,
      requirements: p.requirements || null,
      notes: p.notes || null,
      important_date: p.important_date || null,
      important_date_comment: p.important_date_comment || null,
    }));

    const { data: insertedProducts, error } = await supabase
      .from('sourced_products')
      .insert(productsToInsert)
      .select();

    if (error) throw error;

    // Enrich products with Keepa data in background (don't block)
    // Process in batches of 5 to avoid rate limiting
    const enrichPromises = insertedProducts.map((product, index) => 
      new Promise(resolve => {
        setTimeout(async () => {
          await enrichProductWithKeepa(product.id, product.asin);
          resolve();
        }, index * 200); // 200ms delay between each to avoid rate limiting
      })
    );

    // Start enrichment in background
    Promise.all(enrichPromises).then(() => {
      // Refresh products list after enrichment completes
      fetchProducts();
    });

    // Refresh immediately to show imported products (without Keepa data yet)
    fetchProducts();
    
    return insertedProducts;
  };

  // Handle owner changes with immediate UI update
  const handleOwnersChange = async (productId, newOwners) => {
    try {
      // Delete existing owners for this product
      await supabase
        .from('product_owners')
        .delete()
        .eq('product_id', productId);
      
      // Insert new owners
      if (newOwners.length > 0) {
        await supabase
          .from('product_owners')
          .insert(newOwners.map(o => ({
            product_id: productId,
            owner_id: o.owner_id,
            is_primary: o.is_primary
          })));
      }
      
      // Fetch owner details to update local state with full info
      const ownerIds = newOwners.map(o => o.owner_id);
      let ownersWithDetails = [];
      
      if (ownerIds.length > 0) {
        const { data: ownerDetails } = await supabase
          .from('crm_owners')
          .select('id, name, email, avatar_color')
          .in('id', ownerIds);
        
        const ownerMap = new Map((ownerDetails || []).map(o => [o.id, o]));
        
        ownersWithDetails = newOwners.map(o => {
          const owner = ownerMap.get(o.owner_id);
          return {
            id: o.owner_id,
            is_primary: o.is_primary,
            name: owner?.name || 'Unknown',
            email: owner?.email,
            avatar_color: owner?.avatar_color || '#3B82F6'
          };
        });
      }
      
      // Update selectedProduct with new owners (immediate UI update)
      setSelectedProduct(prev => prev ? { ...prev, owners: ownersWithDetails } : null);
      
      // Also update the products array for consistency
      setProducts(prev => prev.map(p => 
        p.id === productId ? { ...p, owners: ownersWithDetails } : p
      ));
      
    } catch (err) {
      console.error('Failed to update owners:', err);
    }
  };

  // Count delivered items for badge
  const deliveredCount = products.filter(p => p.status?.name === 'Delivered').length;
  
  // Filtered products - apply view mode filter, status filter, and owner filter
  const filteredProducts = products.filter(product => {
    // Status filter (multi-select) - if statuses are selected, only show those
    if (statusFilter.size > 0 && product.status?.id) {
      if (!statusFilter.has(product.status.id)) return false;
    }
    // If no status filter selected, fall back to view mode behavior
    if (statusFilter.size === 0) {
      // Open Items view - show everything EXCEPT Delivered and Completed
      if (viewMode === 'open') {
        if (product.status?.name === 'Delivered' || product.status?.name === 'Completed') return false;
      }
      // Delivered view - only show Delivered status
      if (viewMode === 'delivered') {
        if (product.status?.name !== 'Delivered') return false;
      }
    }
    // Owner filter (applies to all views)
    if (ownerFilter && product.owners) {
      const hasOwner = product.owners.some(o => o.owner_id === ownerFilter);
      if (!hasOwner) return false;
    }
    if (ownerFilter && (!product.owners || product.owners.length === 0)) {
      return false;
    }
    return true;
  });

  // Pagination calculations
  const totalPages = Math.ceil(filteredProducts.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedProducts = filteredProducts.slice(startIndex, endIndex);
  
  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [viewMode, ownerFilter, statusFilter, searchQuery]);

  // Close status filter dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (statusFilterOpen && !e.target.closest('.status-filter-dropdown')) {
        setStatusFilterOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [statusFilterOpen]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="px-4 sm:px-6 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                {viewMode === 'delivered' ? 'Delivered Items' : viewMode === 'all' ? 'All Products' : 'Product CRM'}
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                {viewMode === 'delivered' 
                  ? 'Products ready for listing - review and create eBay listings'
                  : viewMode === 'all'
                  ? 'All products including delivered'
                  : 'Track your sourced products from discovery to listing'
                }
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsImportModalOpen(true)}
                className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 flex items-center gap-2"
              >
                <Construction className="w-4 h-4 text-yellow-400" />
                Import
              </button>
              <button
                onClick={() => setIsAddModalOpen(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Add Product
              </button>
            </div>
          </div>
        </div>
      </div>
      
      {/* Filters */}
      <div className="px-4 sm:px-6 py-4">
        <div className="flex items-center gap-4 flex-wrap">
          {/* View Mode Toggle */}
          <div className="flex items-center bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
            <button
              onClick={() => setViewMode('open')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                viewMode === 'open' 
                  ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm' 
                  : 'text-gray-600 dark:text-gray-300 hover:text-gray-900'
              }`}
            >
              Open Items
            </button>
            <button
              onClick={() => setViewMode('delivered')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5 ${
                viewMode === 'delivered' 
                  ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm' 
                  : 'text-gray-600 dark:text-gray-300 hover:text-gray-900'
              }`}
            >
              <Inbox className="w-4 h-4" />
              Delivered
              {deliveredCount > 0 && (
                <span className="bg-red-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center">
                  {deliveredCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setViewMode('all')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                viewMode === 'all' 
                  ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm' 
                  : 'text-gray-600 dark:text-gray-300 hover:text-gray-900'
              }`}
            >
              All Products
            </button>
          </div>
          
          {/* Search */}
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search by ASIN..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            />
          </div>
          
          {/* Status Filter - Multi-select */}
          <div className="relative status-filter-dropdown">
            <button
              onClick={() => setStatusFilterOpen(!statusFilterOpen)}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white flex items-center gap-2 min-w-[160px]"
            >
              <span className="truncate">
                {statusFilter.size === 0 
                  ? 'All Statuses' 
                  : statusFilter.size === statuses.length 
                    ? 'All Statuses'
                    : `${statusFilter.size} Status${statusFilter.size > 1 ? 'es' : ''}`}
              </span>
              <ChevronDown className="w-4 h-4 flex-shrink-0" />
            </button>
            
            {statusFilterOpen && (
              <div className="absolute z-50 mt-1 w-64 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg">
                <div className="p-2 border-b border-gray-200 dark:border-gray-700 flex gap-2">
                  <button
                    onClick={() => setStatusFilter(new Set(statuses.map(s => s.id)))}
                    className="text-xs text-blue-600 hover:text-blue-700"
                  >
                    Select All
                  </button>
                  <span className="text-gray-300">|</span>
                  <button
                    onClick={() => setStatusFilter(new Set())}
                    className="text-xs text-blue-600 hover:text-blue-700"
                  >
                    Clear All
                  </button>
                  <span className="text-gray-300">|</span>
                  <button
                    onClick={() => {
                      const openStatuses = new Set(
                        statuses
                          .filter(s => s.name !== 'Delivered' && s.name !== 'Completed')
                          .map(s => s.id)
                      );
                      setStatusFilter(openStatuses);
                    }}
                    className="text-xs text-blue-600 hover:text-blue-700"
                  >
                    Open Only
                  </button>
                </div>
                <div className="max-h-64 overflow-y-auto p-2">
                  {statuses.map(status => (
                    <label 
                      key={status.id} 
                      className="flex items-center gap-2 px-2 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={statusFilter.has(status.id)}
                        onChange={(e) => {
                          const newFilter = new Set(statusFilter);
                          if (e.target.checked) {
                            newFilter.add(status.id);
                          } else {
                            newFilter.delete(status.id);
                          }
                          setStatusFilter(newFilter);
                        }}
                        className="w-4 h-4 rounded border-gray-300"
                      />
                      <span 
                        className="w-3 h-3 rounded-full flex-shrink-0" 
                        style={{ backgroundColor: status.color || '#6b7280' }}
                      />
                      <span className="text-sm text-gray-700 dark:text-gray-300">{status.name}</span>
                    </label>
                  ))}
                </div>
                <div className="p-2 border-t border-gray-200 dark:border-gray-700">
                  <button
                    onClick={() => setStatusFilterOpen(false)}
                    className="w-full px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>
          
          {/* Owner Filter */}
          <select
            value={ownerFilter}
            onChange={e => setOwnerFilter(e.target.value)}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          >
            <option value="">All Owners</option>
            {availableOwners.map(owner => (
              <option key={owner.id} value={owner.id}>{owner.name}</option>
            ))}
          </select>
          
          {/* Refresh */}
          <button
            onClick={fetchProducts}
            className="p-2 text-gray-400 hover:text-gray-600 border border-gray-300 dark:border-gray-600 rounded-lg"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>
      
      {/* Content */}
      <div className="px-4 sm:px-6 pb-8">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
          {isLoading ? (
            <div className="p-12 text-center">
              <RefreshCw className="w-8 h-8 text-gray-400 animate-spin mx-auto" />
              <p className="text-gray-500 mt-2">Loading products...</p>
            </div>
          ) : error ? (
            <div className="p-12 text-center">
              <AlertCircle className="w-8 h-8 text-red-400 mx-auto" />
              <p className="text-red-500 mt-2">{error}</p>
              <button onClick={fetchProducts} className="mt-4 text-blue-600 hover:text-blue-700">
                Try again
              </button>
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="p-12 text-center">
              <Package className="w-12 h-12 text-gray-300 mx-auto" />
              <p className="text-gray-500 mt-2">No products found</p>
              <button
                onClick={() => setIsAddModalOpen(true)}
                className="mt-4 text-blue-600 hover:text-blue-700 flex items-center gap-1 mx-auto"
              >
                <Plus className="w-4 h-4" /> Add your first product
              </button>
            </div>
          ) : (
            <>
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-700/50">
                <tr>
                  <th className="py-3 px-3 w-10">
                    <input
                      type="checkbox"
                      checked={paginatedProducts.length > 0 && paginatedProducts.every(p => selectedProducts.has(p.id))}
                      onChange={(e) => {
                        if (e.target.checked) {
                          // Select all on current page
                          const newSelected = new Set(selectedProducts);
                          paginatedProducts.forEach(p => newSelected.add(p.id));
                          setSelectedProducts(newSelected);
                        } else {
                          // Deselect all on current page
                          const newSelected = new Set(selectedProducts);
                          paginatedProducts.forEach(p => newSelected.delete(p.id));
                          setSelectedProducts(newSelected);
                        }
                      }}
                      className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                    />
                  </th>
                  <th className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider py-3 px-4">Image</th>
                  <th className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider py-3 px-4">ASIN</th>
                  <th className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider py-3 px-4">Status</th>
                  <th className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider py-3 px-4">Owners</th>
                  <th className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider py-3 px-4">Decision</th>
                  <th className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider py-3 px-4">Important Date</th>
                  <th className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider py-3 px-4">Shipping</th>
                  <th className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider py-3 px-4 w-12"></th>
                </tr>
              </thead>
              <tbody>
                {paginatedProducts.map(product => (
                  <ProductRow
                    key={product.id}
                    product={product}
                    isSelected={selectedProduct?.id === product.id}
                    isChecked={selectedProducts.has(product.id)}
                    onCheck={(checked) => {
                      const newSelected = new Set(selectedProducts);
                      if (checked) {
                        newSelected.add(product.id);
                      } else {
                        newSelected.delete(product.id);
                      }
                      setSelectedProducts(newSelected);
                    }}
                    onSelect={setSelectedProduct}
                    onEdit={setSelectedProduct}
                  />
                ))}
              </tbody>
            </table>

            {/* Pagination Controls */}
            {filteredProducts.length > 0 && (
              <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    Showing {startIndex + 1}-{Math.min(endIndex, filteredProducts.length)} of {filteredProducts.length}
                  </span>
                  <select
                    value={itemsPerPage}
                    onChange={(e) => {
                      setItemsPerPage(Number(e.target.value));
                      setCurrentPage(1);
                    }}
                    className="px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  >
                    <option value={25}>25 per page</option>
                    <option value={50}>50 per page</option>
                    <option value={100}>100 per page</option>
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage(1)}
                    disabled={currentPage === 1}
                    className="px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    First
                  </button>
                  <button
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    ←
                  </button>
                  <span className="px-3 py-1 text-sm text-gray-600 dark:text-gray-400">
                    Page {currentPage} of {totalPages}
                  </span>
                  <button
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    →
                  </button>
                  <button
                    onClick={() => setCurrentPage(totalPages)}
                    disabled={currentPage === totalPages}
                    className="px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Last
                  </button>
                </div>
              </div>
            )}
          </>
          )}
        </div>
      </div>
      
      {/* Add Product Modal */}
      <AddProductModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onAdd={handleAddProduct}
        statuses={statuses}
      />
      
      {/* Import Modal */}
      <ImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onImport={handleImportProducts}
        statuses={statuses}
      />
      
      {/* Detail Panel */}
      <ProductDetailPanel
        product={selectedProduct}
        onClose={() => setSelectedProduct(null)}
        onUpdate={handleUpdateProduct}
        onDelete={handleDeleteProduct}
        onOwnersChange={handleOwnersChange}
        statuses={statuses}
        collaborationTypes={collaborationTypes}
        contactSources={contactSources}
        marketplaces={marketplaces}
      />

      {/* Bulk Action Toolbar */}
      {selectedProducts.size > 0 && (
        <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 bg-gray-900 dark:bg-gray-700 rounded-xl shadow-2xl px-6 py-4 flex items-center gap-4 z-50 border border-gray-700 dark:border-gray-600">
          <span className="text-white font-medium">{selectedProducts.size} selected</span>
          <div className="w-px h-6 bg-gray-600"></div>
          <button
            onClick={() => setShowBulkEditModal(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
          >
            <Edit className="w-4 h-4" />
            Edit Selected
          </button>
          <button
            onClick={() => setShowBulkDeleteConfirm(true)}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center gap-2"
          >
            <Trash2 className="w-4 h-4" />
            Delete Selected
          </button>
          <button
            onClick={() => setSelectedProducts(new Set())}
            className="px-3 py-2 text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* Bulk Delete Confirmation */}
      {showBulkDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              Delete {selectedProducts.size} Products?
            </h3>
            <p className="text-gray-600 dark:text-gray-300 mb-6">
              This action cannot be undone. All selected products and their owner assignments will be permanently deleted.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowBulkDeleteConfirm(false)}
                className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkDelete}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
              >
                Delete {selectedProducts.size} Products
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Edit Modal */}
      {showBulkEditModal && (
        <BulkEditModal
          isOpen={showBulkEditModal}
          onClose={() => setShowBulkEditModal(false)}
          selectedCount={selectedProducts.size}
          statuses={statuses}
          availableOwners={availableOwners}
          onApply={handleBulkEdit}
        />
      )}
    </div>
  );
}

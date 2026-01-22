import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { userAPI } from '../../lib/supabase';
import { Cloud, FolderOpen, RefreshCw, Unlink, Settings } from 'lucide-react';
import FolderPicker from './FolderPicker';

/**
 * OneDriveConnection Component
 * Manages OneDrive OAuth connection and folder selection for video storage
 */
export default function OneDriveConnection({ onStatusChange }) {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [showFolderPicker, setShowFolderPicker] = useState(false);
  const [showDisconnectModal, setShowDisconnectModal] = useState(false);

  useEffect(() => {
    fetchStatus();
  }, []);

  // Notify parent when connection status changes
  useEffect(() => {
    onStatusChange?.(status?.connected === true);
  }, [status, onStatusChange]);

  const fetchStatus = async () => {
    try {
      setLoading(true);
      const token = await userAPI.getAuthToken();
      const response = await fetch('/.netlify/functions/onedrive-status', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch OneDrive status');
      }

      const data = await response.json();
      setStatus(data);
    } catch (error) {
      console.error('Error fetching OneDrive status:', error);
      toast.error('Failed to load OneDrive connection status');
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = async () => {
    try {
      // Prevent concurrent connection attempts
      if (window.oneDriveAuthWindow && !window.oneDriveAuthWindow.closed) {
        window.oneDriveAuthWindow.focus();
        toast.info('OneDrive connection window is already open. Please complete the authorization.');
        return;
      }

      setConnecting(true);

      const token = await userAPI.getAuthToken();
      const response = await fetch('/.netlify/functions/onedrive-auth-start', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to get authorization URL');
      }

      const data = await response.json();

      if (data.authUrl) {
        // Open OneDrive OAuth in new window
        const authWindow = window.open(
          data.authUrl,
          'onedrive-auth',
          'width=600,height=700,scrollbars=yes'
        );

        // Check if popup was blocked
        if (!authWindow || authWindow.closed || typeof authWindow.closed === 'undefined') {
          toast.error('Popup blocked! Please allow popups for this site and try again.');
          setConnecting(false);
          return;
        }

        // Store reference to the popup window
        window.oneDriveAuthWindow = authWindow;

        // Allowed origins for security validation
        const allowedOrigins = [
          window.location.origin,
          /^https:\/\/.*\.netlify\.app$/,
          /^http:\/\/localhost(:\d+)?$/
        ];

        // Listen for messages from the popup
        const messageHandler = (event) => {
          // Security: Strict origin validation
          const isAllowedOrigin = allowedOrigins.some(allowed => {
            if (typeof allowed === 'string') {
              return event.origin === allowed;
            } else if (allowed instanceof RegExp) {
              return allowed.test(event.origin);
            }
            return false;
          });

          if (!isAllowedOrigin) {
            console.warn(`Rejected message from untrusted origin: ${event.origin}`);
            return;
          }

          if (event.data.type === 'onedrive-oauth-success') {
            console.log('OneDrive OAuth success!', event.data);

            // Clean up listeners and window reference
            clearInterval(checkClosed);
            window.removeEventListener('message', messageHandler);
            window.oneDriveAuthWindow = null;

            // Refresh status
            fetchStatus();

            toast.success(`Successfully connected to OneDrive${event.data.email ? ` as ${event.data.email}` : ''}!`);
            setConnecting(false);
          } else if (event.data.type === 'onedrive-oauth-error') {
            console.error('OneDrive OAuth error:', event.data);

            // Clean up listeners and window reference
            clearInterval(checkClosed);
            window.removeEventListener('message', messageHandler);
            window.oneDriveAuthWindow = null;

            toast.error(`Failed to connect to OneDrive: ${event.data.error || 'Unknown error'}`);
            setConnecting(false);
          }
        };

        // Add message event listener
        window.addEventListener('message', messageHandler);

        // Check if window was closed without completing OAuth
        const checkClosed = setInterval(() => {
          if (authWindow.closed) {
            clearInterval(checkClosed);
            window.removeEventListener('message', messageHandler);
            window.oneDriveAuthWindow = null;
            setConnecting(false);
          }
        }, 1000);
      } else {
        throw new Error('No authorization URL received');
      }
    } catch (error) {
      console.error('Connection error:', error);
      toast.error(`Failed to connect to OneDrive: ${error.message}`);
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    setShowDisconnectModal(false);
    setDisconnecting(true);

    try {
      const token = await userAPI.getAuthToken();
      const response = await fetch('/.netlify/functions/onedrive-disconnect', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error('Failed to disconnect');
      }

      const data = await response.json();

      if (data.success) {
        await fetchStatus();
        toast.success('OneDrive disconnected successfully');
      } else {
        throw new Error(data.error || 'Failed to disconnect');
      }
    } catch (error) {
      console.error('Disconnect error:', error);
      toast.error(`Failed to disconnect: ${error.message}`);
    } finally {
      setDisconnecting(false);
    }
  };

  const handleFolderSelected = async () => {
    setShowFolderPicker(false);
    await fetchStatus();
    toast.success('Folder updated successfully');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <RefreshCw className="w-6 h-6 animate-spin text-ebay-blue" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Connection Status Card */}
      <div className={`border rounded-lg p-6 ${
        status?.connected
          ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
          : 'bg-theme-primary border-theme'
      }`}>
        <div className="flex items-start justify-between">
          <div className="flex items-start space-x-4">
            <div className={`p-3 rounded-lg ${
              status?.connected
                ? 'bg-green-100 dark:bg-green-900/40'
                : 'bg-gray-100 dark:bg-gray-800'
            }`}>
              <Cloud className={`w-6 h-6 ${
                status?.connected
                  ? 'text-green-600 dark:text-green-400'
                  : 'text-gray-400'
              }`} />
            </div>
            
            <div className="flex-1">
              <h4 className={`text-lg font-semibold ${
                status?.connected
                  ? 'text-green-900 dark:text-green-100'
                  : 'text-theme-primary'
              }`}>
                OneDrive {status?.connected ? 'Connected' : 'Not Connected'}
              </h4>
              
              {status?.connected ? (
                <div className="mt-2 space-y-1">
                  {status.email && (
                    <p className="text-sm text-green-700 dark:text-green-300">
                      <span className="font-medium">Account:</span> {status.email}
                    </p>
                  )}
                  {status.folderPath && (
                    <p className="text-sm text-green-700 dark:text-green-300 flex items-center gap-2">
                      <FolderOpen className="w-4 h-4" />
                      <span className="font-medium">Folder:</span> {status.folderPath}
                    </p>
                  )}
                  {!status.folderPath && (
                    <p className="text-sm text-orange-600 dark:text-orange-400 flex items-center gap-2">
                      <Settings className="w-4 h-4" />
                      Please select a folder for video storage
                    </p>
                  )}
                </div>
              ) : (
                <p className="mt-2 text-sm text-theme-secondary">
                  Connect your OneDrive account to enable video uploads for products.
                </p>
              )}
            </div>
          </div>

          {status?.connected && (
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
              <span className="text-sm font-medium text-green-700 dark:text-green-300">Active</span>
            </div>
          )}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-3">
        {!status?.connected ? (
          <button
            onClick={handleConnect}
            disabled={connecting}
            className="bg-green-600 text-white px-6 py-2.5 rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {connecting ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Connecting...
              </>
            ) : (
              <>
                <Cloud className="w-4 h-4" />
                Connect OneDrive
              </>
            )}
          </button>
        ) : (
          <>
            <button
              onClick={() => setShowFolderPicker(true)}
              className="bg-ebay-blue text-white px-6 py-2.5 rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
            >
              <FolderOpen className="w-4 h-4" />
              {status.folderPath ? 'Change Folder' : 'Select Folder'}
            </button>
            
            <button
              onClick={() => setShowDisconnectModal(true)}
              disabled={disconnecting}
              className="bg-red-600 text-white px-6 py-2.5 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {disconnecting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Disconnecting...
                </>
              ) : (
                <>
                  <Unlink className="w-4 h-4" />
                  Disconnect
                </>
              )}
            </button>
          </>
        )}
      </div>

      {/* Folder Picker Modal */}
      {showFolderPicker && (
        <FolderPicker
          onClose={() => setShowFolderPicker(false)}
          onSelect={handleFolderSelected}
        />
      )}

      {/* Disconnect Confirmation Modal */}
      {showDisconnectModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-theme-primary mb-4">
              Disconnect OneDrive?
            </h3>
            <p className="text-sm text-theme-secondary mb-6">
              Are you sure you want to disconnect your OneDrive account? This will remove access to your stored videos, but won't delete any files.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowDisconnectModal(false)}
                className="px-4 py-2 text-sm text-theme-secondary hover:text-theme-primary transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDisconnect}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                Disconnect
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

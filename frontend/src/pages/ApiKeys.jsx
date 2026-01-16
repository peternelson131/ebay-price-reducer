import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Eye, EyeOff, ExternalLink, CheckCircle, XCircle, AlertCircle, Loader, Link2, Unlink } from 'lucide-react';

// API key services
const API_SERVICES = [
  {
    id: 'keepa',
    name: 'Keepa',
    description: 'Required for product data, variations, and similar product search',
    helpUrl: 'https://keepa.com/#!api',
    placeholder: 'Enter your Keepa API key'
  },
  {
    id: 'elevenlabs',
    name: 'Eleven Labs',
    description: 'Required for video auto-dubbing into multiple languages',
    helpUrl: 'https://elevenlabs.io/app/settings/api-keys',
    placeholder: 'Enter your Eleven Labs API key'
  }
];

function ApiKeyInput({ service, existingKey, onSave, onDelete, saving }) {
  // Don't pre-fill with encrypted value - start empty for new entry
  const [inputValue, setInputValue] = useState('');
  const [showKey, setShowKey] = useState(false);
  
  // Track if user has started typing (to show placeholder vs saved indicator)
  const hasExistingKey = existingKey?.hasKey;

  return (
    <div className="bg-theme-surface rounded-lg border border-theme p-6">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-medium text-theme-primary">{service.name}</h3>
          <p className="mt-1 text-sm text-theme-tertiary">{service.description}</p>
          <a
            href={service.helpUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 text-sm text-accent hover:text-accent-hover transition-colors inline-flex items-center gap-1"
          >
            Get API key <ExternalLink className="h-3 w-3" />
          </a>
        </div>
        {hasExistingKey && (
          <span className={`px-2 py-1 text-xs rounded-lg ${
            existingKey.isValid 
              ? 'bg-success/10 text-success' 
              : 'bg-error/10 text-error'
          }`}>
            {existingKey.isValid ? 'Configured' : 'Invalid'}
          </span>
        )}
      </div>

      <div className="mt-4">
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <input
              type={showKey ? 'text' : 'password'}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder={hasExistingKey ? 'Enter new key to replace existing' : service.placeholder}
              className="w-full px-3 py-2.5 bg-theme-primary border border-theme rounded-lg text-theme-primary placeholder-text-tertiary focus:ring-2 focus:ring-accent focus:border-transparent transition-colors"
            />
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-theme-tertiary hover:text-theme-primary transition-colors"
            >
              {showKey ? <EyeOff className="h-4 w-4" strokeWidth={1.5} /> : <Eye className="h-4 w-4" strokeWidth={1.5} />}
            </button>
          </div>
          <button
            onClick={() => onSave(service.id, inputValue)}
            disabled={saving || !inputValue.trim()}
            className="px-4 py-2.5 bg-accent text-white rounded-lg hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
          {hasExistingKey && (
            <button
              onClick={() => onDelete(service.id)}
              className="px-4 py-2.5 bg-error/10 text-error border border-error/30 rounded-lg hover:bg-error/20 transition-colors"
            >
              Delete
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function EbayConnectionCard() {
  const { user } = useAuth();
  const [status, setStatus] = useState('loading'); // loading, not_connected, pending, connected, error
  const [message, setMessage] = useState('');
  const [connecting, setConnecting] = useState(false);

  // Check URL params for OAuth callback results
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('ebay_connected') === 'true') {
      setMessage('eBay account connected successfully!');
      setStatus('connected');
      // Clean up URL
      window.history.replaceState({}, '', window.location.pathname);
    } else if (params.get('ebay_error')) {
      setMessage(`eBay connection failed: ${params.get('ebay_error')}`);
      setStatus('error');
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  // Check connection status on mount
  useEffect(() => {
    checkConnectionStatus();
  }, [user]);

  const checkConnectionStatus = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch('/.netlify/functions/ebay-connection-status', {
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      });

      const data = await response.json();
      
      if (data.connected) {
        setStatus('connected');
      } else if (data.status === 'pending') {
        setStatus('pending');
      } else {
        setStatus('not_connected');
      }
    } catch (error) {
      console.error('Failed to check eBay status:', error);
      setStatus('not_connected');
    }
  };

  const startOAuthFlow = async () => {
    setConnecting(true);
    setMessage('');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      // Call OAuth start - no credentials needed, uses platform app credentials
      const response = await fetch('/.netlify/functions/ebay-oauth-start', {
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to start authorization');
      }

      // Redirect to eBay authorization
      window.location.href = data.authUrl;
    } catch (error) {
      console.error('OAuth start error:', error);
      setMessage(error.message);
      setConnecting(false);
    }
  };

  const disconnectEbay = async () => {
    if (!confirm('Are you sure you want to disconnect your eBay account?')) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const response = await fetch('/.netlify/functions/ebay-disconnect', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to disconnect');
      }

      setStatus('not_connected');
      setMessage('eBay account disconnected');
    } catch (error) {
      console.error('Disconnect error:', error);
      setMessage(error.message);
    }
  };

  const getStatusIcon = () => {
    switch (status) {
      case 'loading':
        return <Loader className="h-5 w-5 animate-spin text-theme-tertiary" />;
      case 'connected':
        return <CheckCircle className="h-5 w-5 text-success" />;
      case 'pending':
        return <AlertCircle className="h-5 w-5 text-warning" />;
      case 'error':
        return <XCircle className="h-5 w-5 text-error" />;
      default:
        return <XCircle className="h-5 w-5 text-theme-tertiary" />;
    }
  };

  const getStatusBadge = () => {
    switch (status) {
      case 'connected':
        return <span className="px-2 py-1 text-xs rounded-lg bg-success/10 text-success">Connected</span>;
      case 'pending':
        return <span className="px-2 py-1 text-xs rounded-lg bg-warning/10 text-warning">Pending</span>;
      default:
        return <span className="px-2 py-1 text-xs rounded-lg bg-gray-200 dark:bg-gray-700 text-theme-tertiary">Not Connected</span>;
    }
  };

  return (
    <div className="bg-theme-surface rounded-lg border border-theme p-6">
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          {getStatusIcon()}
          <div>
            <h3 className="text-lg font-medium text-theme-primary">eBay Account</h3>
            <p className="mt-1 text-sm text-theme-tertiary">
              Connect your eBay seller account to create and manage listings
            </p>
          </div>
        </div>
        {getStatusBadge()}
      </div>

      {message && (
        <div className={`mt-4 p-3 rounded-lg text-sm ${
          message.includes('success') || message.includes('connected') 
            ? 'bg-success/10 text-success' 
            : 'bg-error/10 text-error'
        }`}>
          {message}
        </div>
      )}

      {status === 'connected' ? (
        <div className="mt-4 flex items-center justify-between">
          <p className="text-sm text-success">Your eBay account is connected and ready to use.</p>
          <button
            onClick={disconnectEbay}
            className="flex items-center gap-2 px-3 py-2 text-sm text-error border border-error/30 rounded-lg hover:bg-error/10 transition-colors"
          >
            <Unlink className="h-4 w-4" />
            Disconnect
          </button>
        </div>
      ) : (
        <div className="mt-4">
          <p className="text-sm text-theme-secondary mb-4">
            Click below to securely connect your eBay seller account via OAuth.
          </p>
          <button
            onClick={startOAuthFlow}
            disabled={connecting}
            className="flex items-center gap-2 px-4 py-2.5 bg-accent text-white rounded-lg hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
          >
            {connecting ? (
              <>
                <Loader className="h-4 w-4 animate-spin" />
                Connecting...
              </>
            ) : (
              <>
                <Link2 className="h-4 w-4" />
                Connect eBay Account
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}

export default function ApiKeys() {
  const { user } = useAuth();
  const [keys, setKeys] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState({});
  const [message, setMessage] = useState(null);

  useEffect(() => {
    if (user) {
      loadKeys();
    }
  }, [user]);

  const loadKeys = async () => {
    try {
      const { data, error } = await supabase
        .from('user_api_keys')
        .select('*')
        .eq('user_id', user.id);

      if (error) throw error;

      const keyMap = {};
      (data || []).forEach(row => {
        keyMap[row.service] = {
          id: row.id,
          // Don't expose encrypted value - just show it's configured
          value: row.api_key_encrypted ? '••••••••••••••••' : '',
          hasKey: !!row.api_key_encrypted,
          isValid: row.is_valid,
          lastUsed: row.last_used_at
        };
      });
      setKeys(keyMap);
    } catch (error) {
      console.error('Error loading keys:', error);
      setMessage({ type: 'error', text: 'Failed to load API keys' });
    } finally {
      setLoading(false);
    }
  };

  const saveKey = async (serviceId, value) => {
    if (!value.trim()) return;
    
    setSaving(prev => ({ ...prev, [serviceId]: true }));
    setMessage(null);

    try {
      // Get auth token for the API call
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('Not authenticated');
      }

      // Call backend to securely encrypt and save the key
      const response = await fetch('/.netlify/functions/save-api-key', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          service: serviceId,
          apiKey: value.trim()
        })
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to save key');
      }

      setMessage({ type: 'success', text: data.message || `${serviceId} key saved successfully` });
      await loadKeys();
    } catch (error) {
      console.error('Error saving key:', error);
      setMessage({ type: 'error', text: `Failed to save ${serviceId} key: ${error.message}` });
    } finally {
      setSaving(prev => ({ ...prev, [serviceId]: false }));
    }
  };

  const deleteKey = async (serviceId) => {
    const existing = keys[serviceId];
    if (!existing?.id) return;

    if (!confirm(`Are you sure you want to delete your ${serviceId} API key?`)) return;

    try {
      const { error } = await supabase
        .from('user_api_keys')
        .delete()
        .eq('id', existing.id);

      if (error) throw error;

      setMessage({ type: 'success', text: `${serviceId} key deleted` });
      await loadKeys();
    } catch (error) {
      console.error('Error deleting key:', error);
      setMessage({ type: 'error', text: `Failed to delete ${serviceId} key` });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent"></div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-theme-primary">API Keys</h1>
        <p className="mt-2 text-theme-secondary">
          Manage your API credentials for external services. Keys are encrypted and stored securely.
        </p>
      </div>

      {message && (
        <div className={`mb-6 p-4 rounded-lg border ${
          message.type === 'success' 
            ? 'bg-success/10 border-success/30 text-success' 
            : 'bg-error/10 border-error/30 text-error'
        }`}>
          {message.text}
        </div>
      )}

      <div className="space-y-4">
        {/* eBay Connection - OAuth Flow */}
        <EbayConnectionCard />

        {/* Simple API Key Services */}
        {API_SERVICES.map(service => (
          <ApiKeyInput
            key={service.id}
            service={service}
            existingKey={keys[service.id]}
            onSave={saveKey}
            onDelete={deleteKey}
            saving={saving[service.id]}
          />
        ))}
      </div>

      <div className="mt-8 p-4 bg-accent/10 border border-accent/30 rounded-lg">
        <h3 className="font-medium text-accent">Security Note</h3>
        <p className="mt-1 text-sm text-theme-secondary">
          Your API keys are encrypted at rest and only used to make requests on your behalf. 
          We never share your keys with third parties.
        </p>
      </div>
    </div>
  );
}
